"""
Lista Apeluri — AMI-driven real-time call log with DB persistence.

Flow:
  1. ami_event_loop() connects to Asterisk AMI and listens forever.
  2. On connect: QueueStatus is fetched first → recovers calls active before
     backend started (e.g. after a restart mid-call).
  3. On every queue event (Join/Bridge/Hangup/Abandon): _process() updates
     both the in-memory _ami_active dict AND writes/updates a row in ami_apeluri
     table — so no call is ever lost across restarts.
  4. _broadcast() notifies all connected WebSocket clients instantly.
  5. /apeluri/lista reads _ami_active (live) + ami_apeluri DB (history).
"""

import asyncio
import json
from datetime import datetime, date, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select, or_

from app.core.database import get_db, AsyncSessionLocal
from app.core.security import get_current_user, decode_token
from app.models import AmiApel, Setting, SmsTemplate, SmsLog

router = APIRouter(tags=["lista-apeluri"])

# ─── AMI config (defaults — overridden by settings table at runtime) ──────────
AMI_HOST = "10.170.7.32"
AMI_PORT = 5038
AMI_USER = "admin"
AMI_PASS = "amp111"
MAX_ACTIVE = 500
RECONNECT_DELAY = 10
AMI_KEEPALIVE_INTERVAL = 25


async def _get_ami_config() -> tuple[str, int, str, str]:
    """Read AMI connection settings from DB. Falls back to hardcoded defaults."""
    from sqlalchemy import select as _select
    from app.models import Setting as _Setting
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                _select(_Setting).where(
                    _Setting.cheie.in_(["ami_host", "ami_port", "ami_user", "ami_pass"])
                )
            )
            cfg = {s.cheie: (s.valoare or "").strip() for s in result.scalars().all()}
        host = cfg.get("ami_host") or AMI_HOST
        port = int(cfg.get("ami_port") or AMI_PORT)
        user = cfg.get("ami_user") or AMI_USER
        pw   = cfg.get("ami_pass") or AMI_PASS
        return host, port, user, pw
    except Exception as e:
        print(f"[AMI] Failed to read config from DB, using defaults: {e}")
        return AMI_HOST, AMI_PORT, AMI_USER, AMI_PASS

# ─── In-memory live state ─────────────────────────────────────────────────────
_ami_active: dict[str, dict] = {}   # uniqueid → call currently in queue/talking
_ami_connected: bool = False
_ws_clients: set[WebSocket] = set()

# ─── Event log (last N non-noise events for UI debugging) ─────────────────────
_event_log: list[dict] = []   # newest first
_EVENT_LOG_MAX = 60

# AMI events to skip immediately (RTCP noise + low-level channel/dialplan events)
# NOTE: "Hangup" is intentionally NOT here — we use it to detect abandoned calls.
_SKIP_EVENTS = frozenset({
    # RTCP / RTP quality reports
    "RTCPSent", "RTCPReceived",
    # Channel lifecycle / dialplan
    "Newchannel", "Newstate", "Newexten", "NewCallerId",
    "HangupHandlerRun", "HangupHandlerPush", "HangupHandlerPop",
    "VarSet", "Rename", "SoftHangupRequest", "HangupRequest",
    "MonitorStart", "MonitorStop",
    # Audio / media
    "Hold", "Unhold", "DTMF", "MusicOnHold",
    # Network / registration
    "ChannelUpdate", "PeerStatus", "Registry", "FullyBooted",
    # Queue infrastructure (not call flow events)
    "Dial", "AgentCalled", "AgentRingNoAnswer",
    "QueueMemberAdded", "QueueMemberRemoved", "QueueMemberPause",
    "QueueMemberStatus", "QueueParams", "QueueMember",
    "CoreShowChannel", "CoreShowChannelsComplete",
    "NewAccountCode", "CEL",
})


# ─── WebSocket broadcast ──────────────────────────────────────────────────────

async def _broadcast(msg: dict) -> None:
    global _ws_clients
    if not _ws_clients:
        return
    data = json.dumps(msg)
    dead: set[WebSocket] = set()
    for ws in list(_ws_clients):
        try:
            await ws.send_text(data)
        except Exception:
            dead.add(ws)
    _ws_clients.difference_update(dead)


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def _db_upsert(callid: str, fields: dict) -> None:
    """Insert or update a row in ami_apeluri. Fire-and-forget friendly."""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AmiApel).where(AmiApel.callid == callid)
            )
            apel = result.scalar_one_or_none()
            if apel:
                for k, v in fields.items():
                    setattr(apel, k, v)
                apel.updated_at = datetime.now()
            else:
                apel = AmiApel(callid=callid, **fields)
                session.add(apel)
            await session.commit()
    except Exception as e:
        print(f"[AMI] DB write error: {e}")


# ─── AMI protocol ─────────────────────────────────────────────────────────────

async def _read_block(reader: asyncio.StreamReader) -> dict:
    """
    Read one AMI message block.
    Raises ConnectionResetError on EOF or timeout — triggers reconnect.
    """
    msg: dict = {}
    while True:
        try:
            raw = await asyncio.wait_for(reader.readline(), timeout=60.0)
        except asyncio.TimeoutError:
            raise ConnectionResetError("AMI read timeout (60s without data)")

        if not raw:
            raise ConnectionResetError("AMI EOF — connection closed by server")

        line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
        if not line:
            break   # blank line = end of AMI block
        if ":" in line:
            key, _, val = line.partition(":")
            msg[key.strip()] = val.strip()
    return msg


async def _keepalive(writer: asyncio.StreamWriter, stop: asyncio.Event) -> None:
    """Send AMI Ping every 25s to prevent idle-disconnect on old Asterisk."""
    while not stop.is_set():
        try:
            await asyncio.sleep(AMI_KEEPALIVE_INTERVAL)
            writer.write(b"Action: Ping\r\n\r\n")
            await writer.drain()
        except asyncio.CancelledError:
            break
        except Exception:
            break


async def _recover_active_calls(reader: asyncio.StreamReader,
                                writer: asyncio.StreamWriter) -> None:
    """
    Send QueueStatus to Asterisk and populate _ami_active with any callers
    currently waiting in queue. Handles backend restarts mid-call.
    """
    writer.write(b"Action: QueueStatus\r\n\r\n")
    await writer.drain()

    recovered = 0
    now = datetime.now()

    for _ in range(500):   # safety limit
        try:
            block = await asyncio.wait_for(_read_block(reader), timeout=5.0)
        except (asyncio.TimeoutError, ConnectionResetError):
            break

        event = block.get("Event", "")
        if event == "QueueStatusComplete":
            break

        if event == "QueueEntry":
            uid = _get_uid(block)
            caller = _get_caller(block)
            queue = block.get("Queue", "")
            wait = int(block.get("Wait", 0) or 0)
            channel = block.get("Channel", "")
            if uid and uid not in _ami_active:
                enter_ts = now.timestamp() - wait
                enter_dt = datetime.fromtimestamp(enter_ts)
                _ami_active[uid] = {
                    "callid": uid,
                    "channel": channel,
                    "caller_id": caller,
                    "queue": queue,
                    "agent": "",
                    "status": "IN_QUEUE",
                    "data": enter_dt.strftime("%Y-%m-%d"),
                    "ora": enter_dt.strftime("%H:%M:%S"),
                    "ts_enter": enter_ts,
                    "hold_time": wait,
                    "call_time": 0,
                }
                # Ensure DB row exists for this recovered call
                await _db_upsert(uid, {
                    "caller_id": caller, "agent": "", "queue": queue,
                    "status": "IN_QUEUE",
                    "data": enter_dt.date(),
                    "ora": enter_dt.strftime("%H:%M:%S"),
                    "hold_time": wait, "call_time": 0,
                })
                recovered += 1

    if recovered:
        print(f"[AMI] Recovered {recovered} active calls from QueueStatus")


# ─── Event processor ─────────────────────────────────────────────────────────

def _get_caller(block: dict) -> str:
    """Extract caller ID from AMI block — handles old (CallerID) and new (CallerIDNum) field names."""
    return (
        block.get("CallerIDNum") or block.get("CallerIDnum") or
        block.get("CallerID") or block.get("Callerid") or ""
    ).strip()


def _get_uid(block: dict) -> str:
    return block.get("UniqueID") or block.get("Uniqueid") or block.get("uniqueid") or ""


def _log_event(event: str, caller: str, queue: str, uid: str, extra: str = "") -> None:
    """Append to in-memory event log and print to stdout."""
    global _event_log
    from datetime import datetime as _dt
    entry = {
        "ts": _dt.now().strftime("%H:%M:%S"),
        "event": event,
        "caller_id": caller,
        "queue": queue,
        "uid": uid[-8:] if uid else "",
        "extra": extra,
    }
    _event_log.insert(0, entry)
    if len(_event_log) > _EVENT_LOG_MAX:
        _event_log.pop()
    print(f"[AMI] {event:25s} caller={caller or '-':15s} queue={queue or '-':15s} {extra}")


async def _process(block: dict) -> None:
    """Update in-memory state, persist to DB, broadcast to WebSocket clients."""
    event = block.get("Event", "")
    if not event or event in _SKIP_EVENTS:
        return

    uid = _get_uid(block)
    caller = _get_caller(block)
    queue = block.get("Queue", "")
    channel = block.get("Channel", "")
    now = datetime.now()

    # ── QueueCallerJoin / Join (old Asterisk 1.8 uses "Join") ───────────────
    if event in ("QueueCallerJoin", "Join"):
        _log_event(event, caller, queue, uid)
        _ami_active[uid] = {
            "callid": uid,
            "channel": channel,
            "caller_id": caller,
            "queue": queue,
            "agent": "",
            "status": "IN_QUEUE",
            "data": now.strftime("%Y-%m-%d"),
            "ora": now.strftime("%H:%M:%S"),
            "ts_enter": now.timestamp(),
            "hold_time": 0,
            "call_time": 0,
        }
        await _db_upsert(uid, {
            "caller_id": caller, "agent": "", "queue": queue,
            "status": "IN_QUEUE", "data": now.date(),
            "ora": now.strftime("%H:%M:%S"),
            "hold_time": 0, "call_time": 0,
        })
        await _broadcast({"type": "ami_event", "event": event, "caller_id": caller})

    elif event == "AgentConnect":
        hold = int(block.get("HoldTime", 0) or 0)
        agent = (block.get("MemberName") or "").replace("SIP/", "").strip()
        _log_event(event, caller, queue, uid, f"agent={agent} hold={hold}s")
        if uid in _ami_active:
            _ami_active[uid].update({"status": "IN_CURS", "agent": agent, "hold_time": hold})
        else:
            # Call was answered but we missed the Join (e.g. backend restarted)
            _ami_active[uid] = {
                "callid": uid, "channel": channel, "caller_id": caller,
                "queue": queue, "agent": agent, "status": "IN_CURS",
                "data": now.strftime("%Y-%m-%d"), "ora": now.strftime("%H:%M:%S"),
                "ts_enter": now.timestamp(), "hold_time": hold, "call_time": 0,
            }
        await _db_upsert(uid, {"status": "IN_CURS", "agent": agent, "hold_time": hold})
        await _broadcast({"type": "ami_event", "event": event, "caller_id": caller})

    elif event == "AgentComplete":
        hold = int(block.get("HoldTime", 0) or 0)
        talk = int(block.get("TalkTime", 0) or 0)
        agent = (block.get("MemberName") or "").replace("SIP/", "").strip()
        call = _ami_active.pop(uid, {})
        final_caller = call.get("caller_id") or caller
        final_hold = hold or call.get("hold_time", 0)
        final_agent = agent or call.get("agent", "")
        _log_event(event, final_caller, queue, uid, f"agent={final_agent} hold={final_hold}s talk={talk}s")
        await _db_upsert(uid, {
            "status": "COMPLETAT", "agent": final_agent,
            "hold_time": final_hold, "call_time": talk,
        })
        await _broadcast({"type": "ami_event", "event": event, "caller_id": final_caller})

    # ── Bridge: old Asterisk 1.8 with SIP queue members fires this instead of
    #    AgentConnect/AgentComplete. Bridgestate=Link means agent answered;
    #    Bridgestate=Unlink means call ended (but we use Hangup for that).
    #    NOTE: uid is in Uniqueid1 field (not the usual UniqueID/Uniqueid).
    elif event == "Bridge":
        bridgestate = block.get("Bridgestate", "")
        uid1 = block.get("Uniqueid1", "")
        callerid1 = (block.get("CallerID1") or "").strip()
        channel2 = block.get("Channel2", "")

        if bridgestate == "Link" and uid1:
            call = _ami_active.get(uid1)
            if call and call.get("status") == "IN_QUEUE":
                hold_elapsed = int(now.timestamp() - call.get("ts_enter", now.timestamp()))
                # Extract agent name: "SIP/telefon5-00000101" → "telefon5"
                agent = channel2.replace("SIP/", "").rsplit("-", 1)[0] if channel2 else ""
                _ami_active[uid1].update({
                    "status": "IN_CURS",
                    "agent": agent,
                    "hold_time": hold_elapsed,
                    "ts_answer": now.timestamp(),
                })
                # Enrich caller_id if we have it from Bridge but not from Join
                if callerid1 and not _ami_active[uid1].get("caller_id"):
                    _ami_active[uid1]["caller_id"] = callerid1
                final_caller = _ami_active[uid1].get("caller_id", "")
                _log_event("Bridge:Link", final_caller, call.get("queue", ""), uid1,
                           f"agent={agent} hold={hold_elapsed}s → IN_CURS")
                await _db_upsert(uid1, {"status": "IN_CURS", "agent": agent, "hold_time": hold_elapsed})
                await _broadcast({"type": "ami_event", "event": "AgentConnect",
                                  "caller_id": final_caller})
        # Bridgestate=Unlink is ignored — Hangup handles COMPLETAT

    # ── QueueCallerAbandon (new Asterisk only — explicit abandon event) ───────
    elif event == "QueueCallerAbandon":
        hold = int(block.get("HoldTime", 0) or 0)
        call = _ami_active.pop(uid, {})
        final_caller = call.get("caller_id") or caller
        final_hold = hold or call.get("hold_time", 0)
        _log_event(event, final_caller, queue, uid, f"hold={final_hold}s (ABANDONAT)")
        await _db_upsert(uid, {"status": "ABANDONAT", "agent": "",
                               "hold_time": final_hold, "call_time": 0})
        await _broadcast({"type": "ami_event", "event": event, "caller_id": final_caller})

    # ── Leave: OLD Asterisk fires this when caller EXITS queue (answered OR
    #    abandoned). We IGNORE it here — Hangup below handles the abandon case
    #    reliably, and AgentComplete handles the completed case.
    elif event == "Leave":
        _log_event(event, caller, queue, uid, "ignored (ambiguous in old Asterisk)")

    # ── Hangup: detects both abandoned and completed calls.
    #    IN_QUEUE at hangup → genuine abandon (agent never answered).
    #    IN_CURS at hangup  → call completed (Bridge:Link was seen, now caller hung up).
    elif event == "Hangup":
        call = _ami_active.get(uid)
        if call and call.get("status") == "IN_QUEUE":
            elapsed = int(now.timestamp() - call.get("ts_enter", now.timestamp()))
            final_caller = call.get("caller_id") or caller
            _ami_active.pop(uid, None)
            _log_event(event, final_caller, call.get("queue", ""), uid,
                       f"hold={elapsed}s → ABANDONAT (Hangup while IN_QUEUE)")
            await _db_upsert(uid, {
                "status": "ABANDONAT", "agent": "",
                "hold_time": elapsed, "call_time": 0,
            })
            await _broadcast({"type": "ami_event", "event": "QueueCallerAbandon",
                              "caller_id": final_caller})
        elif call and call.get("status") == "IN_CURS":
            ts_answer = call.get("ts_answer", call.get("ts_enter", now.timestamp()))
            talk_time = int(now.timestamp() - ts_answer)
            hold_time = call.get("hold_time", 0)
            final_caller = call.get("caller_id") or caller
            final_agent = call.get("agent", "")
            _ami_active.pop(uid, None)
            _log_event(event, final_caller, call.get("queue", ""), uid,
                       f"hold={hold_time}s talk={talk_time}s → COMPLETAT (Hangup while IN_CURS)")
            await _db_upsert(uid, {
                "status": "COMPLETAT", "agent": final_agent,
                "hold_time": hold_time, "call_time": talk_time,
            })
            await _broadcast({"type": "ami_event", "event": "AgentComplete",
                              "caller_id": final_caller})
        # Untracked channel hangup → silent ignore

    else:
        # Log unknown/unhandled events so we can spot new event types
        _log_event(event, caller, queue, uid)


# ─── Background task ─────────────────────────────────────────────────────────

async def ami_event_loop() -> None:
    """Persistent AMI task. On every connect: recover active calls, then listen."""
    global _ami_connected
    while True:
        writer = None
        keepalive_task = None
        stop_event = asyncio.Event()
        try:
            host, port, user, pw = await _get_ami_config()
            print(f"[AMI] Connecting to {host}:{port} ...")
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port), timeout=10.0
            )
            banner_raw = await asyncio.wait_for(reader.readline(), timeout=5.0)
            if not banner_raw:
                raise ConnectionResetError("Empty AMI banner")
            print(f"[AMI] Connected — {banner_raw.decode().strip()}")

            # Login
            writer.write(
                f"Action: Login\r\nUsername: {user}\r\nSecret: {pw}\r\n\r\n".encode()
            )
            await writer.drain()
            resp = await _read_block(reader)
            if resp.get("Response") != "Success":
                print(f"[AMI] Auth failed: {resp}")
                await asyncio.sleep(RECONNECT_DELAY)
                continue
            print("[AMI] Authenticated")

            # Step 1: recover active calls from QueueStatus (before subscribing to events)
            await _recover_active_calls(reader, writer)

            # Step 2: subscribe to queue/agent events
            writer.write(b"Action: Events\r\nEventMask: agent,call\r\n\r\n")
            await writer.drain()
            await _read_block(reader)  # ack

            # Step 3: keepalive
            keepalive_task = asyncio.create_task(_keepalive(writer, stop_event))

            _ami_connected = True
            await _broadcast({"type": "ami_connected"})
            print(f"[AMI] Listening — keepalive every {AMI_KEEPALIVE_INTERVAL}s")

            while True:
                block = await _read_block(reader)
                if block:
                    await _process(block)

        except asyncio.CancelledError:
            print("[AMI] Task cancelled")
            _ami_connected = False
            return
        except (asyncio.TimeoutError, ConnectionRefusedError,
                ConnectionResetError, OSError) as e:
            print(f"[AMI] Connection lost: {e} — reconnect in {RECONNECT_DELAY}s")
            from app.core.log import write_log
            await write_log("ERROR", "ami", f"AMI connection lost: {type(e).__name__}", str(e))
        except Exception as e:
            print(f"[AMI] Error ({type(e).__name__}: {e}) — reconnect in {RECONNECT_DELAY}s")
            from app.core.log import write_log
            await write_log("ERROR", "ami", f"AMI error: {type(e).__name__}", str(e))
        finally:
            _ami_connected = False
            stop_event.set()
            if keepalive_task and not keepalive_task.done():
                keepalive_task.cancel()
                try:
                    await keepalive_task
                except (asyncio.CancelledError, Exception):
                    pass
            if writer:
                try:
                    writer.close()
                    await asyncio.wait_for(writer.wait_closed(), timeout=2.0)
                except Exception:
                    pass
            await _broadcast({"type": "ami_disconnected"})
        await asyncio.sleep(RECONNECT_DELAY)


# ─── WebSocket endpoints ──────────────────────────────────────────────────────

@router.websocket("/ws/apeluri/public")
async def ws_apeluri_public(websocket: WebSocket):
    """Public WebSocket — no authentication required."""
    await websocket.accept()
    _ws_clients.add(websocket)
    await websocket.send_text(json.dumps({
        "type": "welcome",
        "ami_connected": _ami_connected,
        "active_calls": len(_ami_active),
    }))
    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if msg == "ping":
                    await websocket.send_text('{"type":"pong"}')
            except asyncio.TimeoutError:
                await websocket.send_text('{"type":"ping"}')
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _ws_clients.discard(websocket)


@router.websocket("/ws/apeluri")
async def ws_apeluri(websocket: WebSocket, token: Optional[str] = Query(None)):
    payload = decode_token(token) if token else None
    if not payload:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    _ws_clients.add(websocket)
    await websocket.send_text(json.dumps({
        "type": "welcome",
        "ami_connected": _ami_connected,
        "active_calls": len(_ami_active),
    }))

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if msg == "ping":
                    await websocket.send_text('{"type":"pong"}')
            except asyncio.TimeoutError:
                await websocket.send_text('{"type":"ping"}')
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _ws_clients.discard(websocket)


# ─── REST endpoints ───────────────────────────────────────────────────────────

def _build_canale_response() -> dict:
    """Shared logic for canale endpoint — used by both public and authenticated versions."""
    now_ts = datetime.now().timestamp()
    canale = []
    for uid, c in _ami_active.items():
        elapsed = int(now_ts - c.get("ts_enter", now_ts))
        canale.append({
            "channel": c.get("channel", ""),
            "caller_id": c.get("caller_id", ""),
            "queue": c.get("queue", ""),
            "agent": c.get("agent", ""),
            "status": c.get("status", "IN_QUEUE"),
            "seconds": elapsed,
            "bridged": c.get("status") == "IN_CURS",
        })
    return {
        "canale": canale,
        "total": len(canale),
        "connected": _ami_connected,
        "event_log": _event_log[:30],
    }


@router.get("/apeluri/ami/canale/public")
async def get_ami_canale_public():
    """Public version — no authentication required."""
    return _build_canale_response()


@router.get("/apeluri/ami/canale")
async def get_ami_canale_endpoint(current_user=Depends(get_current_user)):
    return _build_canale_response()


async def _build_lista_response(
    data_start: Optional[str], data_end: Optional[str],
    q: Optional[str], status: Optional[str],
    page: int, limit: int, db,
) -> dict:
    """Shared logic for lista apeluri — used by both public and authenticated versions."""
    today = date.today()
    try:
        start = date.fromisoformat(data_start) if data_start else today
    except ValueError:
        start = today
    try:
        end = date.fromisoformat(data_end) if data_end else today
    except ValueError:
        end = today
    if start > end:
        start, end = end, start

    now_ts = datetime.now().timestamp()

    active = []
    for uid, c in _ami_active.items():
        call_date = c.get("data", "")
        if not (start.isoformat() <= call_date <= end.isoformat()):
            continue
        elapsed = int(now_ts - c.get("ts_enter", now_ts))
        active.append({
            "callid": uid,
            "data": call_date,
            "ora": c.get("ora", ""),
            "caller_id": c.get("caller_id", ""),
            "agent": c.get("agent", ""),
            "queue": c.get("queue", ""),
            "status": c.get("status", "IN_QUEUE"),
            "hold_time": elapsed if c.get("status") == "IN_QUEUE" else c.get("hold_time", 0),
            "call_time": max(0, int(elapsed - c.get("hold_time", 0)))
                         if c.get("status") == "IN_CURS" else 0,
        })

    active_uids = set(_ami_active.keys())
    stmt = (
        select(AmiApel)
        .where(AmiApel.data >= start)
        .where(AmiApel.data <= end)
        .where(or_(AmiApel.status == "COMPLETAT", AmiApel.status == "ABANDONAT"))
        .order_by(AmiApel.data.desc(), AmiApel.ora.desc())
    )
    if q:
        stmt = stmt.where(AmiApel.caller_id.ilike(f"%{q.strip()}%"))
    if status and status not in ("IN_QUEUE", "IN_CURS"):
        stmt = stmt.where(AmiApel.status == status)

    rows = (await db.execute(stmt)).scalars().all()
    history = [
        {
            "callid": r.callid,
            "data": r.data.isoformat(),
            "ora": r.ora or "",
            "caller_id": r.caller_id or "",
            "agent": r.agent or "",
            "queue": r.queue or "",
            "status": r.status,
            "hold_time": r.hold_time or 0,
            "call_time": r.call_time or 0,
        }
        for r in rows
        if r.callid not in active_uids
    ]

    if status in ("IN_QUEUE", "IN_CURS"):
        active = [c for c in active if c["status"] == status]
        history = []
    elif status:
        active = []

    if q:
        ql = q.strip().lower()
        active = [c for c in active if ql in (c.get("caller_id") or "").lower()]

    all_calls = active + history
    total = len(all_calls)
    offset = (page - 1) * limit
    return {
        "calls": all_calls[offset: offset + limit],
        "total": total,
        "page": page,
        "pages": max(1, (total + limit - 1) // limit),
        "data_start": start.isoformat(),
        "data_end": end.isoformat(),
        "ami_connected": _ami_connected,
    }


@router.get("/apeluri/lista/public")
async def get_lista_apeluri_public(
    data_start: Optional[str] = Query(None),
    data_end: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db=Depends(get_db),
):
    """Public version — no authentication required."""
    return await _build_lista_response(data_start, data_end, q, status, page, limit, db)


@router.get("/apeluri/lista")
async def get_lista_apeluri(
    data_start: Optional[str] = Query(None),
    data_end: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    return await _build_lista_response(data_start, data_end, q, status, page, limit, db)


# ─── SMS endpoint ─────────────────────────────────────────────────────────────

class _SmsSend(BaseModel):
    phone: str
    message: str


@router.post("/sms/send")
async def send_sms_endpoint(
    payload: _SmsSend,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    """Send SMS via Dinstar DWG2000 gateway (Digest Auth). Logs every attempt."""
    phone = payload.phone.strip()
    message = payload.message.strip()
    if not phone or not message:
        raise HTTPException(status_code=400, detail="Număr și mesaj obligatorii")

    # Read Dinstar credentials from settings table
    result = await db.execute(
        select(Setting).where(
            Setting.cheie.in_(["dinstar_ip", "dinstar_user", "dinstar_pass"])
        )
    )
    cfg = {s.cheie: (s.valoare or "").strip() for s in result.scalars().all()}

    dinstar_ip   = cfg.get("dinstar_ip", "")
    dinstar_user = cfg.get("dinstar_user", "")
    dinstar_pass = cfg.get("dinstar_pass", "")

    if not all([dinstar_ip, dinstar_user, dinstar_pass]):
        raise HTTPException(
            status_code=503,
            detail="SMS gateway neconfigurat — adaugă dinstar_ip / dinstar_user / dinstar_pass în Setări › SMS Gateway",
        )

    sent_by = getattr(current_user, "username", None) or str(getattr(current_user, "id", ""))

    async def _log(ok: bool, error_msg: str | None = None) -> None:
        try:
            async with AsyncSessionLocal() as s:
                s.add(SmsLog(phone=phone, message=message, ok=ok,
                             error_msg=error_msg, sent_by=sent_by))
                await s.commit()
        except Exception as le:
            print(f"[SMS] Log write error: {le}")

    try:
        async with httpx.AsyncClient(verify=False, timeout=6.0) as client:
            resp = await client.post(
                f"https://{dinstar_ip}/api/send_sms",
                auth=httpx.DigestAuth(dinstar_user, dinstar_pass),
                json={"text": message, "param": [{"number": phone}]},
            )
        body = resp.json()
        if body.get("error_code") == 202:
            print(f"[SMS] Trimis la {phone} de {sent_by}: {message[:50]}")
            await _log(ok=True)
            return {"ok": True, "phone": phone}
        else:
            err = str(body)
            print(f"[SMS] Eroare gateway pentru {phone}: {err}")
            await _log(ok=False, error_msg=err)
            return {"ok": False, "error": err}
    except httpx.TimeoutException:
        await _log(ok=False, error_msg="timeout")
        raise HTTPException(status_code=504, detail="Timeout — SMS gateway nu răspunde")
    except Exception as e:
        await _log(ok=False, error_msg=str(e))
        raise HTTPException(status_code=502, detail=f"Eroare SMS gateway: {e}")


@router.get("/sms/log")
async def get_sms_log(
    limit: int = Query(200, ge=1, le=1000),
    phone: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    stmt = select(SmsLog).order_by(SmsLog.created_at.desc()).limit(limit)
    if phone:
        stmt = stmt.where(SmsLog.phone.ilike(f"%{phone.strip()}%"))
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "phone": r.phone,
            "message": r.message,
            "ok": r.ok,
            "error_msg": r.error_msg,
            "sent_by": r.sent_by,
            "created_at": r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else "",
        }
        for r in rows
    ]


# ─── SMS Templates CRUD ───────────────────────────────────────────────────────

class _SmsTemplateCreate(BaseModel):
    titlu: str
    corp: str

class _SmsTemplateUpdate(BaseModel):
    titlu: Optional[str] = None
    corp: Optional[str] = None


@router.get("/sms/templates")
async def list_sms_templates(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    rows = (await db.execute(
        select(SmsTemplate).order_by(SmsTemplate.created_at)
    )).scalars().all()
    return [
        {"id": r.id, "titlu": r.titlu, "corp": r.corp}
        for r in rows
    ]


@router.post("/sms/templates", status_code=201)
async def create_sms_template(
    payload: _SmsTemplateCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    titlu = payload.titlu.strip()
    corp  = payload.corp.strip()
    if not titlu or not corp:
        raise HTTPException(status_code=400, detail="Titlu și corp obligatorii")
    tmpl = SmsTemplate(titlu=titlu, corp=corp)
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return {"id": tmpl.id, "titlu": tmpl.titlu, "corp": tmpl.corp}


@router.put("/sms/templates/{tmpl_id}")
async def update_sms_template(
    tmpl_id: int,
    payload: _SmsTemplateUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    tmpl = (await db.execute(
        select(SmsTemplate).where(SmsTemplate.id == tmpl_id)
    )).scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template negăsit")
    if payload.titlu is not None:
        tmpl.titlu = payload.titlu.strip()
    if payload.corp is not None:
        tmpl.corp = payload.corp.strip()
    await db.commit()
    await db.refresh(tmpl)
    return {"id": tmpl.id, "titlu": tmpl.titlu, "corp": tmpl.corp}


@router.delete("/sms/templates/{tmpl_id}")
async def delete_sms_template(
    tmpl_id: int,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    tmpl = (await db.execute(
        select(SmsTemplate).where(SmsTemplate.id == tmpl_id)
    )).scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template negăsit")
    await db.delete(tmpl)
    await db.commit()
    return {"ok": True}

"""Predicții produse — Random Forest + LightGBM cu sezonalitate + sărbători românești.

Logică:
  • Datele: comenzi_linii JOIN comenzi, agregate în ferestre de 15 min (ora locală RO).
  • Features per fereastră (12):
      [hour, quarter(0-3), day_of_week(0-6), month, season(1-4), is_weekend,
       is_public_holiday, is_easter_week, is_christmas_period,
       is_1_march, is_8_march, is_school_vacation]
  • Modele per produs (top 80 după cantitate totală):
      - RandomForestRegressor   → cantitate estimată (RF)
      - LGBMRegressor           → cantitate estimată (LGB)
      - RandomForestClassifier  → probabilitate comandă (RF)
      - LGBMClassifier          → probabilitate comandă (LGB)
  • Predicție "Acum":    fereastra 15 min la horizon_min de acum.
  • Predicție "Azi":     P(produs apare cel puțin o dată azi) = 1 - ∏(1-p_slot) pe orele programului.
  • Predicție "Pe oră":  P(produs apare în ora h) = 1 - ∏(1-p_slot) pe 4 sferturi.
  • Cache re-antrenat la 8h; antrenare background la startup (non-blocant).
"""

import asyncio
import pickle
import pathlib
import numpy as np
from collections import defaultdict
from datetime import datetime, timezone, timedelta, date as date_type
from typing import Any

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text

from app.core.database import AsyncSessionLocal, get_db
from app.core.security import get_current_user
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["🔮 Predicții"])

TZ_RO = timezone(timedelta(hours=2))

# Sezon: 1=primăvară, 2=vară, 3=toamnă, 4=iarnă
_SEASON: dict[int, int] = {
    1: 4, 2: 4,
    3: 1, 4: 1, 5: 1,
    6: 2, 7: 2, 8: 2,
    9: 3, 10: 3, 11: 3,
    12: 4,
}
_SEASON_LABEL  = {1: "Primăvară", 2: "Vară", 3: "Toamnă", 4: "Iarnă"}
_WEEKDAY_LABEL = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"]

# ─── Sărbători și zile speciale România ───────────────────────────────────────

_RO_FIXED_HOLIDAYS: frozenset[tuple[int, int]] = frozenset({
    (1, 1), (1, 2),     # Anul Nou
    (1, 24),            # Ziua Unirii
    (5, 1),             # Ziua Muncii
    (6, 1),             # Ziua Copilului
    (8, 15),            # Sf. Maria Mare
    (11, 30),           # Sf. Andrei
    (12, 1),            # Ziua Națională
    (12, 25), (12, 26), # Crăciun
})

_easter_cache: dict[int, date_type] = {}


def _orthodox_easter(year: int) -> date_type:
    """Calculează Paștele Ortodox (calendar gregorian) pentru un an dat."""
    if year in _easter_cache:
        return _easter_cache[year]
    a = year % 19
    b = year % 4
    c = year % 7
    d = (19 * a + 15) % 30
    e = (2 * b + 4 * c - d + 34) % 7
    f = d + e + 114
    month = f // 31
    day   = (f % 31) + 1
    result = date_type(year, month, day) + timedelta(days=13)
    _easter_cache[year] = result
    return result


def _is_school_vacation(d: date_type, easter: date_type) -> bool:
    """Aproximare vacanțe școlare România."""
    if (d.month == 6 and d.day >= 14) or d.month in (7, 8) or (d.month == 9 and d.day <= 11):
        return True
    if (d.month == 12 and d.day >= 21) or (d.month == 1 and d.day <= 7):
        return True
    if (easter - timedelta(days=7)) <= d <= (easter + timedelta(days=1)):
        return True
    if d.month == 2 and d.day <= 14:
        return True
    if (d.month == 10 and d.day >= 26) or (d.month == 11 and d.day <= 3):
        return True
    return False


_MIN_TOTAL_QTY = 5
_MAX_PRODUCTS  = 80
_RETRAIN_HOURS = 8

_cache: dict[str, Any] = {
    "trained_at":    None,
    "rf_reg":        {},   # product → RandomForestRegressor
    "lgb_reg":       {},   # product → LGBMRegressor
    "rf_clf":        {},   # product → RandomForestClassifier
    "lgb_clf":       {},   # product → LGBMClassifier
    "cond_mean":     {},   # product → {(dow, hour): mean_qty, "__overall__": float}
    "product_list":  [],
    "training":      False,
    "error":         None,
    "days_of_data":  0,
    "orders_count":  0,
    "lgb_available": False,
}
_train_lock = asyncio.Lock()

# ─── Pickle — volum partajat între API și worker ──────────────────────────────

_MODELS_PATH = pathlib.Path("/app/models/predictii_cache.pkl")
_last_mtime: float = 0.0
_SAVE_KEYS = [
    "rf_reg", "lgb_reg", "rf_clf", "lgb_clf",
    "cond_mean", "product_list", "trained_at",
    "days_of_data", "orders_count", "lgb_available",
]


def _save_models() -> None:
    """Salvează modelele pe volum partajat (rulează în worker)."""
    try:
        _MODELS_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = {k: _cache[k] for k in _SAVE_KEYS}
        tmp = _MODELS_PATH.with_suffix(".tmp")
        with open(tmp, "wb") as f:
            pickle.dump(data, f, protocol=5)
        tmp.rename(_MODELS_PATH)
        print(f"[Predictii] Modele salvate: {len(_cache['rf_reg'])} produse → {_MODELS_PATH}")
    except Exception as e:
        print(f"[Predictii] Eroare salvare modele: {e}")


def _load_models() -> bool:
    """Încarcă modelele din pickle în _cache. Returnează True dacă a reușit."""
    global _last_mtime
    try:
        if not _MODELS_PATH.exists():
            return False
        with open(_MODELS_PATH, "rb") as f:
            data = pickle.load(f)
        for k in _SAVE_KEYS:
            if k in data:
                _cache[k] = data[k]
        _last_mtime = _MODELS_PATH.stat().st_mtime
        print(f"[Predictii] Modele încărcate: {len(_cache['rf_reg'])} produse")
        return True
    except Exception as e:
        print(f"[Predictii] Eroare încărcare modele: {e}")
        return False


def _features(dt: datetime) -> list[float]:
    """Extrage 12 caracteristici temporale + sărbători dintr-un datetime (timezone-aware)."""
    d      = dt.date()
    easter = _orthodox_easter(d.year)

    variable_holidays = {
        easter - timedelta(days=2),   # Vinerea Mare
        easter + timedelta(days=1),   # Lunea Paștelui
        easter + timedelta(days=40),  # Înălțarea
        easter + timedelta(days=50),  # Rusalii
        easter + timedelta(days=51),  # Rusalii ziua 2
    }
    is_holiday    = 1.0 if (d.month, d.day) in _RO_FIXED_HOLIDAYS or d in variable_holidays else 0.0
    days_to_easter = (d - easter).days
    is_easter_week = 1.0 if -7 <= days_to_easter <= 1 else 0.0
    is_christmas   = 1.0 if d.month == 12 and 24 <= d.day <= 26 else 0.0
    is_1_march     = 1.0 if d.month == 3 and d.day == 1 else 0.0
    is_8_march     = 1.0 if d.month == 3 and d.day == 8 else 0.0
    is_school_vac  = 1.0 if _is_school_vacation(d, easter) else 0.0

    return [
        float(dt.hour),
        float(dt.minute // 15),              # 0-3 (sfertul de oră)
        float(dt.weekday()),                 # 0=luni … 6=duminică
        float(dt.month),                     # 1-12
        float(_SEASON[dt.month]),            # 1-4
        1.0 if dt.weekday() >= 5 else 0.0,  # is_weekend
        is_holiday,
        is_easter_week,
        is_christmas,
        is_1_march,
        is_8_march,
        is_school_vac,
    ]


# ─── Helpers program restaurant ───────────────────────────────────────────────

async def _get_restaurant_hours(db: AsyncSession) -> tuple[int, int]:
    rows = (await db.execute(text(
        "SELECT cheie, valoare FROM settings WHERE cheie IN ('predictii_open_hour', 'predictii_close_hour')"
    ))).all()
    m = {r.cheie: r.valoare for r in rows}
    return int(m.get("predictii_open_hour", "10")), int(m.get("predictii_close_hour", "23"))


# ─── Antrenament ──────────────────────────────────────────────────────────────

async def _train() -> None:
    """Antrenează RF + LGB (regressor + classifier) per produs."""
    try:
        from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
    except ImportError:
        _cache["error"] = "scikit-learn neinstalat — rebuild docker image."
        _cache["training"] = False
        return

    lgb_ok = False
    try:
        from lightgbm import LGBMRegressor, LGBMClassifier
        lgb_ok = True
    except ImportError:
        pass

    _cache["training"] = True
    _cache["error"]    = None

    try:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(text("""
                SELECT
                    date_trunc('hour', c.created_at_erp AT TIME ZONE 'Europe/Bucharest')
                        + INTERVAL '15 min' * FLOOR(
                            EXTRACT(MINUTE FROM c.created_at_erp AT TIME ZONE 'Europe/Bucharest') / 15
                          ) AS window_start,
                    cl.product_name,
                    SUM(cl.quantity) AS qty
                FROM comenzi_linii cl
                JOIN comenzi c ON c.id = cl.comanda_id
                WHERE c.created_at_erp IS NOT NULL
                  AND cl.product_name IS NOT NULL
                  AND cl.quantity > 0
                  AND c.linii_synced = TRUE
                GROUP BY 1, 2
                ORDER BY 1
            """))).all()

        if not rows:
            _cache["error"] = "Nicio dată de antrenament — rulează backfill din Settings → Keys."
            return

        window_data: dict[Any, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        product_totals: dict[str, float] = defaultdict(float)

        for row in rows:
            ws  = row.window_start
            pn  = str(row.product_name).strip()
            qty = float(row.qty or 0)
            window_data[ws][pn] += qty
            product_totals[pn]  += qty

        top_products = sorted(
            [p for p, t in product_totals.items() if t >= _MIN_TOTAL_QTY],
            key=lambda p: -product_totals[p],
        )[:_MAX_PRODUCTS]

        all_windows  = sorted(window_data.keys())
        days_of_data = len({
            (ws.year, ws.month, ws.day) if hasattr(ws, "year") else ws
            for ws in all_windows
        })

        async with AsyncSessionLocal() as db2:
            orders_count = (await db2.execute(text(
                "SELECT COUNT(*) FROM comenzi WHERE linii_synced = TRUE"
            ))).scalar() or 0

        rf_reg_d:  dict[str, Any] = {}
        lgb_reg_d: dict[str, Any] = {}
        rf_clf_d:  dict[str, Any] = {}
        lgb_clf_d: dict[str, Any] = {}
        cond_mean_d: dict[str, dict] = {}

        for product in top_products:
            X:     list[list[float]] = []
            y_qty: list[float]       = []
            y_bin: list[float]       = []
            slot_pos_qtys: dict[tuple, list[float]] = defaultdict(list)

            for ws in all_windows:
                if hasattr(ws, "tzinfo") and ws.tzinfo is not None:
                    ws_dt = ws.astimezone(TZ_RO)
                else:
                    ws_dt = datetime(ws.year, ws.month, ws.day, ws.hour, ws.minute, tzinfo=TZ_RO)
                feats = _features(ws_dt)
                qty   = window_data[ws].get(product, 0.0)
                X.append(feats)
                y_qty.append(qty)
                y_bin.append(1.0 if qty > 0 else 0.0)
                if qty > 0:
                    slot_pos_qtys[(ws_dt.weekday(), ws_dt.hour)].append(qty)

            n_pos = sum(1 for v in y_bin if v > 0)
            if len(X) < 5 or n_pos < 3:
                continue

            X_arr  = np.array(X,     dtype=np.float32)
            yq_arr = np.array(y_qty, dtype=np.float32)
            yb_arr = np.array(y_bin, dtype=np.int32)

            rf_r = RandomForestRegressor(
                n_estimators=60, max_depth=6, min_samples_leaf=2,
                random_state=42, n_jobs=1,
            )
            rf_r.fit(X_arr, yq_arr)
            rf_reg_d[product] = rf_r

            rf_c = RandomForestClassifier(
                n_estimators=60, max_depth=6, min_samples_leaf=2,
                random_state=42, n_jobs=1,
            )
            rf_c.fit(X_arr, yb_arr)
            rf_clf_d[product] = rf_c

            if lgb_ok:
                lgb_r = LGBMRegressor(
                    n_estimators=100, learning_rate=0.1, max_depth=5,
                    random_state=42, n_jobs=1, verbose=-1,
                )
                lgb_r.fit(X_arr, yq_arr)
                lgb_reg_d[product] = lgb_r

                lgb_c = LGBMClassifier(
                    n_estimators=100, learning_rate=0.1, max_depth=5,
                    random_state=42, n_jobs=1, verbose=-1,
                )
                lgb_c.fit(X_arr, yb_arr)
                lgb_clf_d[product] = lgb_c

            # Medie condiționată (cantitate dacă e comandat)
            cond_means: dict = {}
            for slot, qtys in slot_pos_qtys.items():
                if qtys:
                    cond_means[slot] = sum(qtys) / len(qtys)
            all_pos = [q for qs in slot_pos_qtys.values() for q in qs]
            cond_means["__overall__"] = (sum(all_pos) / len(all_pos)) if all_pos else 0.0
            cond_mean_d[product] = cond_means

        _cache["rf_reg"]        = rf_reg_d
        _cache["lgb_reg"]       = lgb_reg_d
        _cache["rf_clf"]        = rf_clf_d
        _cache["lgb_clf"]       = lgb_clf_d
        _cache["cond_mean"]     = cond_mean_d
        _cache["product_list"]  = [p for p in top_products if p in rf_reg_d]
        _cache["trained_at"]    = datetime.now(TZ_RO)
        _cache["days_of_data"]  = days_of_data
        _cache["orders_count"]  = orders_count
        _cache["lgb_available"] = lgb_ok
        _cache["error"]         = None
        print(
            f"[Predictii] Antrenament terminat: {len(rf_reg_d)} prod RF, "
            f"{len(lgb_reg_d)} prod LGB, {days_of_data} zile, {orders_count} comenzi"
        )
        _save_models()

    except Exception as e:
        _cache["error"] = str(e)
        print(f"[Predictii] Eroare antrenament: {e}")
        import traceback; traceback.print_exc()
    finally:
        _cache["training"] = False


async def _ensure_trained() -> None:
    """No-op: antrenamentul este responsabilitatea cheltuieli_worker."""
    pass


async def load_models_on_startup() -> None:
    """Startup API — încarcă modelele din pickle (rapid, fără training)."""
    if _load_models():
        print(f"[Predictii] Models loaded: {len(_cache['rf_reg'])} products")
    else:
        print("[Predictii] Niciun pkl găsit — aşteptând cheltuieli_worker.")


async def watch_models_loop() -> None:
    """API — verifică la 60s dacă pkl-ul s-a schimbat (worker a retrenat) și reîncarcă."""
    global _last_mtime
    while True:
        try:
            await asyncio.sleep(60)
            if _MODELS_PATH.exists():
                mtime = _MODELS_PATH.stat().st_mtime
                if mtime > _last_mtime:
                    print("[Predictii] Modele noi detectate — reîncărc...")
                    _load_models()
        except asyncio.CancelledError:
            print("[Predictii] watch_models_loop oprit")
            return
        except Exception as e:
            print(f"[Predictii] watch_models_loop eroare: {e}")


async def worker_train_loop() -> None:
    """Worker — antrenament inițial + re-antrenament periodic sau la cerere (flag DB)."""
    print("[Predictii] Worker: delay 10s înainte de antrenament inițial...")
    await asyncio.sleep(10)
    print("[Predictii] Worker: initial training...")
    await _train()
    while True:
        try:
            await asyncio.sleep(3600)

            retrain_requested = False
            try:
                async with AsyncSessionLocal() as db:
                    row = (await db.execute(text(
                        "SELECT valoare FROM settings WHERE cheie = 'predictii_retrain_requested'"
                    ))).fetchone()
                    if row and row[0] == "true":
                        retrain_requested = True
                        await db.execute(text(
                            "UPDATE settings SET valoare = 'false' "
                            "WHERE cheie = 'predictii_retrain_requested'"
                        ))
                        await db.commit()
            except Exception as e:
                print(f"[Predictii] Worker: eroare citire flag DB: {e}")

            now        = datetime.now(TZ_RO)
            trained_at = _cache.get("trained_at")
            expired    = (
                trained_at is None
                or (now - trained_at).total_seconds() > _RETRAIN_HOURS * 3600
            )
            if retrain_requested or expired:
                reason = "la cerere" if retrain_requested else "expirat (>8h)"
                print(f"[Predictii] Worker: re-antrenament {reason}...")
                await _train()
        except asyncio.CancelledError:
            print("[Predictii] worker_train_loop oprit")
            return
        except Exception as e:
            print(f"[Predictii] Worker: eroare buclă: {e}")


# ─── Helpers predicție ────────────────────────────────────────────────────────

def _clf_proba_slots(product: str, model: str, slots: list[datetime]) -> np.ndarray:
    """P(comandat) per slot, folosind clasificatorul RF sau LGB."""
    key = "rf_clf" if model == "rf" else "lgb_clf"
    clf = _cache[key].get(product)
    if clf is None:
        # fallback la RF dacă LGB nu e disponibil
        clf = _cache["rf_clf"].get(product)
    if clf is None:
        return np.zeros(len(slots))
    feats = np.array([_features(dt) for dt in slots], dtype=np.float32)
    proba = clf.predict_proba(feats)
    return proba[:, 1] if proba.shape[1] >= 2 else proba[:, 0]


def _p_at_least_once(probs: np.ndarray) -> float:
    """P(cel puțin un slot cu comandă) = 1 - ∏(1-p_i)."""
    if len(probs) == 0:
        return 0.0
    p_never = float(np.prod(1.0 - np.clip(probs, 0.0, 1.0)))
    return round((1.0 - p_never) * 100, 1)


def _day_slots(d: date_type, open_h: int, close_h: int) -> list[datetime]:
    slots = []
    for h in range(open_h, close_h):
        for m in (0, 15, 30, 45):
            slots.append(datetime(d.year, d.month, d.day, h, m, tzinfo=TZ_RO))
    return slots


def _hour_slots(d: date_type, hour: int) -> list[datetime]:
    return [datetime(d.year, d.month, d.day, hour, m, tzinfo=TZ_RO) for m in (0, 15, 30, 45)]


def _day_qty_estimate(product: str, model: str, slots: list[datetime]) -> float:
    """Cantitate totală estimată pentru o zi (suma regresorului pe toate sloturile)."""
    key = "rf_reg" if model == "rf" else "lgb_reg"
    reg = _cache[key].get(product) or _cache["rf_reg"].get(product)
    if reg is None:
        return 0.0
    feats = np.array([_features(dt) for dt in slots], dtype=np.float32)
    preds = reg.predict(feats)
    return round(float(np.sum(np.maximum(preds, 0))), 1)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/predictii/produse")
async def predict_products(
    horizon_min: int = Query(20, ge=5, le=60, description="Fereastra de predicție (minute de acum)"),
    top_n:       int = Query(20, ge=3,  le=80, description="Număr maxim produse returnate"),
    model:       str = Query("rf", pattern="^(rf|lgb)$", description="Model: rf sau lgb"),
    current_user = Depends(get_current_user),
):
    """Produse cel mai probabil comandate în fereastra de 15 min la horizon_min de acum."""
    await _ensure_trained()

    if _cache["error"] and not _cache["rf_reg"]:
        return {"error": _cache["error"], "predictions": [], "trained_at": None, "training": _cache["training"]}

    if not _cache["rf_reg"]:
        return {
            "error":    "Model neantrenat." if not _cache["training"] else None,
            "predictions": [], "trained_at": None, "training": _cache["training"],
        }

    now    = datetime.now(TZ_RO)
    target = now + timedelta(minutes=horizon_min)

    min_slot = (target.minute // 15 + 1) * 15
    if min_slot >= 60:
        target = target.replace(hour=(target.hour + 1) % 24, minute=0, second=0, microsecond=0)
    else:
        target = target.replace(minute=min_slot, second=0, microsecond=0)

    slot = (target.weekday(), target.hour)

    predictions = []
    for product in _cache["product_list"]:
        probs    = _clf_proba_slots(product, model, [target])
        prob_pct = round(float(probs[0]) * 100, 0) if len(probs) > 0 else 0.0

        cm        = _cache["cond_mean"].get(product, {})
        cond_mean = cm.get(slot, cm.get("__overall__", 0.0))

        if prob_pct < 5 and cond_mean < 0.1:
            continue

        predictions.append({
            "product_name":  product,
            "predicted_qty": round(cond_mean, 1),
            "probability":   prob_pct,
        })

    predictions.sort(key=lambda x: -(x["probability"] * 10 + x["predicted_qty"]))

    days = _cache.get("days_of_data", 0)
    data_quality = "bun" if days >= 90 else "ok" if days >= 30 else "limitat" if days >= 7 else "insuficient"

    return {
        "now":           now.strftime("%H:%M"),
        "window_start":  target.strftime("%H:%M"),
        "horizon_min":   horizon_min,
        "day_of_week":   _WEEKDAY_LABEL[target.weekday()],
        "month":         target.month,
        "season":        _SEASON_LABEL[_SEASON[target.month]],
        "model":         model,
        "lgb_available": _cache.get("lgb_available", False),
        "predictions":   predictions[:top_n],
        "trained_at":    _cache["trained_at"].isoformat() if _cache["trained_at"] else None,
        "model_count":   len(_cache["rf_reg"]),
        "days_of_data":  days,
        "orders_count":  _cache.get("orders_count", 0),
        "data_quality":  data_quality,
        "training":      _cache["training"],
        "error":         _cache.get("error"),
    }


@router.get("/predictii/ziua")
async def predict_day(
    model: str = Query("rf", pattern="^(rf|lgb)$"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """P(produs apare cel puțin o dată azi) per produs, pe tot programul restaurantului."""
    await _ensure_trained()

    if not _cache["rf_reg"]:
        return {"error": "Model neantrenat.", "products": [], "training": _cache["training"]}

    open_h, close_h = await _get_restaurant_hours(db)
    now   = datetime.now(TZ_RO)
    today = now.date()

    # Ce s-a comandat deja azi
    today_start = datetime(today.year, today.month, today.day, 0, 0, 0)
    rows_azi = (await db.execute(text("""
        SELECT cl.product_name, SUM(cl.quantity) AS qty
        FROM comenzi_linii cl
        JOIN comenzi c ON c.id = cl.comanda_id
        WHERE (c.created_at_erp AT TIME ZONE 'Europe/Bucharest') >= :ts
          AND cl.quantity > 0
          AND cl.product_name IS NOT NULL
        GROUP BY cl.product_name
    """), {"ts": today_start})).all()
    already: dict[str, int] = {r.product_name: int(r.qty) for r in rows_azi}

    all_slots = _day_slots(today, open_h, close_h)

    results = []
    for product in _cache["product_list"]:
        probs       = _clf_proba_slots(product, model, all_slots)
        prob_pct    = _p_at_least_once(probs)
        qty_deja    = already.get(product, 0)
        qty_estimat = _day_qty_estimate(product, model, all_slots)

        if prob_pct > 2 or qty_deja > 0:
            results.append({
                "product":           product,
                "probabilitate":     prob_pct,
                "cantitate_estimata": qty_estimat,
                "cantitate_deja":    qty_deja,
            })

    results.sort(key=lambda x: -(x["probabilitate"] + x["cantitate_deja"] * 0.5))

    return {
        "model":         model,
        "data":          today.isoformat(),
        "open_hour":     open_h,
        "close_hour":    close_h,
        "products":      results,
        "trained_at":    _cache["trained_at"].isoformat() if _cache["trained_at"] else None,
        "lgb_available": _cache.get("lgb_available", False),
    }


@router.get("/predictii/ore")
async def predict_hours(
    model: str = Query("rf", pattern="^(rf|lgb)$"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Predicție probabilitate per oră, pentru ziua curentă, în orele programului."""
    await _ensure_trained()

    if not _cache["rf_reg"]:
        return {"error": "Model neantrenat.", "ore": {}, "training": _cache["training"]}

    open_h, close_h = await _get_restaurant_hours(db)
    now   = datetime.now(TZ_RO)
    today = now.date()

    ore: dict[str, list] = {}
    for h in range(open_h, close_h):
        slots = _hour_slots(today, h)
        prods = []
        for product in _cache["product_list"]:
            probs    = _clf_proba_slots(product, model, slots)
            prob_pct = _p_at_least_once(probs)
            if prob_pct > 5:
                prods.append({"product": product, "probabilitate": prob_pct})
        prods.sort(key=lambda x: -x["probabilitate"])
        ore[str(h)] = prods[:15]

    return {
        "model":         model,
        "data":          today.isoformat(),
        "ora_curenta":   now.hour,
        "open_hour":     open_h,
        "close_hour":    close_h,
        "ore":           ore,
        "trained_at":    _cache["trained_at"].isoformat() if _cache["trained_at"] else None,
        "lgb_available": _cache.get("lgb_available", False),
    }


@router.get("/predictii/deja")
async def get_already_ordered(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Ce s-a comandat azi (din DB comenzi_linii)."""
    now   = datetime.now(TZ_RO)
    today = now.date()
    ts    = datetime(today.year, today.month, today.day, 0, 0, 0)

    rows = (await db.execute(text("""
        SELECT
            cl.product_name,
            SUM(cl.quantity) AS qty,
            MAX(c.created_at_erp AT TIME ZONE 'Europe/Bucharest') AS ultima
        FROM comenzi_linii cl
        JOIN comenzi c ON c.id = cl.comanda_id
        WHERE (c.created_at_erp AT TIME ZONE 'Europe/Bucharest') >= :ts
          AND cl.quantity > 0
          AND cl.product_name IS NOT NULL
        GROUP BY cl.product_name
        ORDER BY qty DESC
    """), {"ts": ts})).all()

    return {
        "data": today.isoformat(),
        "ora":  now.strftime("%H:%M"),
        "products": [
            {
                "product":   r.product_name,
                "cantitate": int(r.qty),
                "ultima":    r.ultima.strftime("%H:%M") if r.ultima else None,
            }
            for r in rows
        ],
    }


@router.get("/predictii/setari")
async def get_setari(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Citește programul restaurantului (ore deschis/închis)."""
    open_h, close_h = await _get_restaurant_hours(db)
    return {"open_hour": open_h, "close_hour": close_h}


@router.post("/predictii/setari")
async def save_setari(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Salvează programul restaurantului."""
    open_h  = int(body.get("open_hour",  10))
    close_h = int(body.get("close_hour", 23))
    if not (0 <= open_h < close_h <= 24):
        raise HTTPException(status_code=400, detail="Ore invalide (open_hour < close_hour, 0-24)")
    for cheie, val in [("predictii_open_hour", open_h), ("predictii_close_hour", close_h)]:
        await db.execute(text("""
            INSERT INTO settings (cheie, valoare)
            VALUES (:c, :v)
            ON CONFLICT (cheie) DO UPDATE SET valoare = :v
        """), {"c": cheie, "v": str(val)})
    await db.commit()
    return {"open_hour": open_h, "close_hour": close_h}


@router.post("/predictii/retrain")
async def force_retrain(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Setează flag de re-antrenare — cheltuieli_worker va procesa la next check (max 1h)."""
    await db.execute(text("""
        INSERT INTO settings (cheie, valoare)
        VALUES ('predictii_retrain_requested', 'true')
        ON CONFLICT (cheie) DO UPDATE SET valoare = 'true'
    """))
    await db.commit()
    return {
        "status":        "queued",
        "model_count":   len(_cache["rf_reg"]),
        "lgb_available": _cache.get("lgb_available", False),
        "error":         None,
        "trained_at":    _cache["trained_at"].isoformat() if _cache["trained_at"] else None,
    }


@router.get("/predictii/backtest")
async def backtest(
    target_dt:   str = Query(..., description="Datetime ISO YYYY-MM-DDTHH:MM (ora locală RO)"),
    horizon_min: int = Query(20, ge=5, le=60),
    top_n:       int = Query(30, ge=3, le=100),
    model:       str = Query("rf", pattern="^(rf|lgb)$"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Compară predicția modelului cu ce s-a comandat efectiv."""
    await _ensure_trained()

    try:
        base   = datetime.fromisoformat(target_dt.rstrip("Z").split("+")[0])
        target = base.replace(tzinfo=TZ_RO)
    except ValueError:
        raise HTTPException(status_code=400, detail="Format datetime invalid (YYYY-MM-DDTHH:MM)")

    min_slot = (target.minute // 15 + 1) * 15
    if min_slot >= 60:
        window_start = target.replace(hour=(target.hour + 1) % 24, minute=0, second=0, microsecond=0)
    else:
        window_start = target.replace(minute=min_slot, second=0, microsecond=0)
    window_end = window_start + timedelta(minutes=15)

    predictions: dict[str, dict] = {}
    if _cache["rf_reg"]:
        slot = (window_start.weekday(), window_start.hour)
        for product in _cache["product_list"]:
            probs    = _clf_proba_slots(product, model, [window_start])
            prob_pct = round(float(probs[0]) * 100, 0) if len(probs) > 0 else 0.0
            cm        = _cache["cond_mean"].get(product, {})
            cond_mean = cm.get(slot, cm.get("__overall__", 0.0))
            if prob_pct >= 5 or cond_mean >= 0.1:
                predictions[product] = {
                    "predicted_qty": round(cond_mean, 1),
                    "probability":   prob_pct,
                }

    ws_naive = window_start.replace(tzinfo=None)
    we_naive = window_end.replace(tzinfo=None)
    rows = (await db.execute(text("""
        SELECT cl.product_name, SUM(cl.quantity) AS qty
        FROM comenzi_linii cl
        JOIN comenzi c ON c.id = cl.comanda_id
        WHERE (c.created_at_erp AT TIME ZONE 'Europe/Bucharest') >= :ws
          AND (c.created_at_erp AT TIME ZONE 'Europe/Bucharest') <  :we
          AND c.linii_synced = TRUE
          AND cl.product_name IS NOT NULL
          AND cl.quantity > 0
        GROUP BY cl.product_name
        ORDER BY qty DESC
    """), {"ws": ws_naive, "we": we_naive})).all()

    actuals: dict[str, float] = {r.product_name: float(r.qty) for r in rows}

    all_products = set(predictions.keys()) | set(actuals.keys())
    results = []
    for product in all_products:
        pred   = predictions.get(product, {"predicted_qty": 0.0, "probability": 0.0})
        actual = actuals.get(product, 0.0)
        results.append({
            "product_name":  product,
            "predicted_qty": pred["predicted_qty"],
            "probability":   pred["probability"],
            "actual_qty":    actual,
            "diff":          round(actual - pred["predicted_qty"], 1),
            "in_model":      product in predictions,
            "in_actuals":    product in actuals,
        })
    results.sort(key=lambda x: -(x["actual_qty"] * 10 + x["predicted_qty"]))

    return {
        "target_dt":       target.isoformat(),
        "window_start":    window_start.strftime("%H:%M"),
        "window_end":      window_end.strftime("%H:%M"),
        "window_date":     window_start.strftime("%Y-%m-%d"),
        "day_of_week":     _WEEKDAY_LABEL[window_start.weekday()],
        "season":          _SEASON_LABEL[_SEASON[window_start.month]],
        "model":           model,
        "results":         results[:top_n],
        "total_actual":    round(sum(actuals.values()), 1),
        "total_predicted": round(sum(p["predicted_qty"] for p in predictions.values()), 1),
        "actuals_count":   len(actuals),
        "model_count":     len(_cache["rf_reg"]),
        "no_data":         len(rows) == 0,
    }


@router.get("/predictii/status")
async def get_status(current_user = Depends(get_current_user)):
    """Starea curentă a modelelor de predicție."""
    return {
        "trained_at":     _cache["trained_at"].isoformat() if _cache["trained_at"] else None,
        "model_count":    len(_cache["rf_reg"]),
        "product_count":  len(_cache["product_list"]),
        "lgb_available":  _cache.get("lgb_available", False),
        "training":       _cache["training"],
        "error":          _cache["error"],
    }

from app.core.database import AsyncSessionLocal


async def write_log(nivel: str, sursa: str, mesaj: str, detalii: str = None) -> None:
    """Fire-and-forget. Never raises."""
    try:
        from app.models import SysLog
        async with AsyncSessionLocal() as session:
            session.add(SysLog(nivel=nivel, sursa=sursa, mesaj=mesaj, detalii=detalii))
            await session.commit()
        print(f"[LOG] {nivel} [{sursa}] {mesaj}")
    except Exception as e:
        print(f"[LOG] write failed: {e}")

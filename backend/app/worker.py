"""Cheltuieli Worker — task-uri grele, izolate de API (ML training + Playwright scraping)."""
import asyncio
import os


async def main():
    os.makedirs("/app/models", exist_ok=True)
    from app.api.predictii import worker_train_loop
    from app.api.competitori import competitor_scrape_loop
    print("[Worker] cheltuieli_worker pornit")
    await asyncio.gather(worker_train_loop(), competitor_scrape_loop())


if __name__ == "__main__":
    asyncio.run(main())

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies + Playwright browser deps
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-unifont \
    wget \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-ron \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip first
RUN pip install --upgrade pip

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium browser (without --with-deps, deps installed above)
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN playwright install chromium
RUN chmod -R 755 /opt/playwright

# Copy application
COPY . .

# Create non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app /opt/playwright
USER appuser

EXPOSE 8000

# Run with gunicorn
CMD ["gunicorn", "app.main:app", "-w", "2", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000", "--access-logfile", "-"]

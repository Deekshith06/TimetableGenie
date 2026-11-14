FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt && useradd --create-home planner

# Copy application backend, datasets, public assets, and compiled frontend
COPY backend /app/backend
COPY datasets /app/datasets
COPY dist-local /app/dist-local
COPY public /app/public

# Prepare persistent data directory and grant permissions
RUN mkdir -p /app/data && chown -R planner:planner /app && chmod -R 775 /app

USER planner

ENV DATABASE_URL="sqlite:////app/data/timetablegenie.db"
ENV FRONTEND_DIST=/app/dist-local
ENV ALLOW_DEMO_AUTH=true
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

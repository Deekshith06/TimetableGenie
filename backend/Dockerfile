FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate && pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec vite build --config vite.local.config.ts

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt && useradd --create-home planner
COPY backend /app/backend
COPY datasets /app/datasets
COPY --from=frontend /app/dist-local /app/dist-local
RUN mkdir /app/data && chown planner:planner /app/data
USER planner
ENV FRONTEND_DIST=/app/dist-local
EXPOSE 8000
CMD ["uvicorn","backend.app.main:app","--host","0.0.0.0","--port","8000"]

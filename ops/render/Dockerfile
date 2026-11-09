FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV API_URL=http://127.0.0.1:8000
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 tesseract-ocr tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=frontend /usr/local/bin/node /usr/local/bin/node
COPY --from=frontend /app/frontend /app/frontend
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY ops/render/start.sh /app/start.sh
ENV API_URL=http://127.0.0.1:8000 DATA_DIR=/data NODE_ENV=production
ENTRYPOINT ["tini", "--"]
CMD ["bash", "/app/start.sh"]

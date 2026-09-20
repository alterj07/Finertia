FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
COPY data/ ./data/

ENV DATA_DIR=/app/data \
    MEMORY_GRAPH_PATH=/app/var/memory_graph.json \
    FEEDBACK_PATH=/app/var/feedback.json \
    CHAT_SESSIONS_PATH=/app/var/chat_sessions.json

CMD ["sh", "-c", "uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

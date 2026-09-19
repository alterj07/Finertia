# Finertia

Boilerplate monorepo for the Finertia finance-agent demo: a Next.js frontend and a FastAPI backend.

## Prerequisites

- Node.js 24+ and npm 12+
- Python 3.14+ (managed via [uv](https://docs.astral.sh/uv/))

## Layout

- `frontend/` — Next.js (App Router, TypeScript, Tailwind, shadcn/ui)
- `backend/` — FastAPI (uv-managed)

## Backend

```bash
cd backend
cp .env.example .env        # optional; defaults work for local dev
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

- Health check: `GET http://localhost:8000/api/health`
- Tests: `uv run pytest`
- Lint: `uv run ruff check .`

## Frontend

```bash
cd frontend
cp .env.local.example .env.local   # optional; defaults to http://localhost:8000
npm install
npm run dev
```

The app runs at http://localhost:3000 and calls the backend health endpoint
via `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).

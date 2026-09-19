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
- Tests: `uv run pytest` (data-driven tests need `DATA_DIR` pointing at the lab data)
- Lint: `uv run ruff check .`

Backend env vars (see `backend/.env.example`):

| Var | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `../data` | Finance data lake (bank CSV, GL parquet, invoices JSONL, emails/) |
| `MEMORY_GRAPH_PATH` | `./var/memory_graph.json` | Shared memory-graph JSON file |
| `FEEDBACK_PATH` | `./var/feedback.json` | Tuning adjustments JSON file |

### Backend architecture

```
app/
  config.py             pydantic-settings: app name, CORS, DATA_DIR, memory/feedback paths
  data/
    models.py           BankTxn, GLLine, Invoice, Email pydantic models
    loaders.py          norm_ref + regexes; loaders for the 4 raw sources
    lake.py             DataLake — storage seam (query helpers; future ES/DuckDB impls)
  memory/
    models.py           Finding, Node, Edge
    graph.py            MemoryGraph — shared JSON-persisted memory (remember/recall/neighbors)
  agents/
    base.py             AgentContext + Agent ABC + AgentResult — the orchestrator contract
    llm.py              LLMProvider protocol + NullLLM (no keys; plug-in seam)
    feedback.py         Adjustment + FeedbackStore — the tuning seam
    recon/
      models.py         RuleParams, Match, ReconSummary
      rules.py          MatchRule ABC + 4 ported passes + RuleBook (pins/blocks/params)
      agent.py          CashReconAgent — bank-to-book recon, emits findings to memory
  api/
    recon.py            POST /api/agents/recon/run
    memory.py           GET /api/memory/graph, /api/memory/findings, POST /api/memory/reset
    feedback.py         GET/POST /api/feedback, DELETE /api/feedback/{id}
```

## Frontend

```bash
cd frontend
cp .env.local.example .env.local   # optional; defaults to http://localhost:8000
npm install
npm run dev
```

The app runs at http://localhost:3000 and calls the backend health endpoint
via `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).

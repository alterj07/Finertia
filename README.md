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
    models.py           Finding, Node, Edge, Signal
    graph.py            MemoryGraph — shared JSON-persisted memory (seed/remember/recall/context/search/signals)
    seed.py             base layer: every invoice/JE/bank line/email/scan linked into one graph
    signals.py          structural leads (duplicates, bank changes, unrecorded items...) routed by agent
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
    memory.py           GET /api/memory/{graph,stats,node,context,search,signals,precedents,findings}
                        POST /api/memory/findings, POST /api/memory/reset
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

### Shared memory graph

The memory graph has two layers in one JSON file (`var/memory_graph.json`):

- **base layer** (`agent="ingest"`), rebuilt from `DATA_DIR` on every start by `app/memory/seed.py`.
  Every document is a node (`INV-7781`, `JE-1049`, `BK00037`, `AR-1044`, `001_brightline_resend.eml`,
  `scan_brightline_INV7781.png`), every party/account/period is a node (`V003`, `C007`, `acct:****9921`,
  `2026-03`), and every cross-source relationship is an edge: `ISSUED_BY`, `REMITS_TO`, `USES_ACCOUNT`,
  `RECORDS` (JE → document, with `amount_diff`), `SETTLES` / `CLEARS` (bank line → document / JE),
  `MENTIONS` / `EXPLAINS` (email → anything), `SCAN_OF`. Different spellings of one document number
  (`INV-7781`, `INV7781`) resolve to one node via aliases.
- **memory layer**: findings agents write with `MemoryGraph.remember` (`finding:{code}:{key}` nodes with
  `INVOLVES` / `EVIDENCED_BY` edges). Persisted and kept across restarts.

What an agent does with it:

| Call | Purpose |
| --- | --- |
| `GET /api/memory/context?id=INV7781` | prompt-ready markdown of a node's neighbourhood + prior findings |
| `GET /api/memory/signals?agent=AP/AR` | structural leads for that agent to confirm (all 11 ground-truth traps surface here) |
| `GET /api/memory/precedents?party=V009` | a vendor/customer's history, recurring patterns, usual remit account, past findings |
| `GET /api/memory/search?q=damaged units` | keyword search over every node incl. email bodies and memos |
| `POST /api/memory/findings` | write a finding back; entities/evidence ids attach to the seeded nodes |
| `GET /api/memory/graph?types=invoice&types=bank_txn` | slice for a force-graph visualisation |

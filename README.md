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

Backend env vars (see `backend/.env`):

| Var | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `../data` | Finance data lake (bank CSV, GL parquet, invoices JSONL, emails/) |
| `MEMORY_GRAPH_PATH` | `./var/memory_graph.json` | Shared memory-graph JSON file |
| `FEEDBACK_PATH` | `./var/feedback.json` | Tuning adjustments JSON file |
| `CHAT_SESSIONS_PATH` | `./var/chat_sessions.json` | Chatbot session store JSON file |
| `OPENAI_API_KEY` | — | Enables LLM orchestrator planning (fallback planner if unset) |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model used by the orchestrator planner |

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
    base.py             AgentContext + Agent ABC + AgentSpec/AgentResult — the orchestrator contract
    llm.py              LLMProvider protocol + NullLLM + OpenAIProvider + build_llm(settings)
    registry.py         AgentRegistry + AgentSpec specs; default_registry() registers specialists
    orchestrator.py     Orchestrator — LLM plan (JSON) with deterministic keyword fallback
    feedback.py         Adjustment + FeedbackStore — the tuning seam
    recon/
      models.py         RuleParams, Match, ReconSummary
      rules.py          MatchRule ABC + 4 ported passes + RuleBook (pins/blocks/params)
      agent.py          CashReconAgent — bank-to-book recon, emits findings to memory
  chat/
    models.py           ChatMessage/ToolCall/ToolEvent/ChatSession/ChatResponse
    sessions.py         ChatSessionStore — JSON-file session list (var/chat_sessions.json)
    tools.py            build_tools() — graph/orchestrator/feedback tools with citations
    service.py          ChatService — the tool-calling loop (≤8 steps, OpenAI tools API)
  api/
    recon.py            POST /api/agents/recon/run
    memory.py           GET /api/memory/{graph,stats,node,context,search,signals,precedents,findings}
                        POST /api/memory/findings, POST /api/memory/reset
    feedback.py         GET/POST /api/feedback, DELETE /api/feedback/{id}
    orchestrator.py     GET /api/agents (specs), POST /api/orchestrator/run
    chat.py             POST /api/chat, GET/DELETE /api/chat/sessions[/{id}]
```

The orchestrator plans from the agent registry via OpenAI when
`OPENAI_API_KEY` is set, and falls back to deterministic keyword matching
otherwise. Each run is recorded as an `ORCHESTRATION_RUN` finding in the
shared memory graph.

### Chatbot

`POST /api/chat` runs a tool-calling loop (`app/chat/service.py`): the LLM gets
the system prompt plus session history, calls tools, and answers with inline
`[node-id]` citations. Sessions persist to `var/chat_sessions.json` and are
resumable via `?session=<id>` on `/chat`. Requires `OPENAI_API_KEY` (503
without it). Tools (`app/chat/tools.py`):

| Tool | Purpose |
| --- | --- |
| `search_memory` | BM25 search over all graph nodes |
| `get_context` | neighbourhood + prior findings around a node |
| `get_findings` | list memory findings by code/agent |
| `get_precedents` | a party's history, patterns, past findings |
| `get_signals` | structural leads the graph surfaces |
| `list_agents` | registered agent specs |
| `run_orchestrator` | run specialist agents for a request |
| `record_feedback` | write a tuning Adjustment for an agent |
| `list_feedback` | list recorded adjustments |

## Deploy

The backend ships as a Docker image built from the repo root (it bundles `data/`):

- `backend/Dockerfile` — uv-based, `uvicorn app.main:app` on `$PORT` (default 8000)
- `render.yaml` — Render blueprint: web service `finertia-api`, health check `/api/health`

Steps:

1. Push the repo and create a new **Blueprint** on Render pointing at `render.yaml`.
2. Set env vars on the Render service:
   - `OPENAI_API_KEY` — required for the chatbot and LLM orchestrator planning
   - `CORS_ORIGINS` — `https://<your-vercel-app>.vercel.app`
   - `OPENAI_MODEL` defaults to `gpt-4o-mini`
3. Deploy the frontend on Vercel with `NEXT_PUBLIC_API_URL=https://<render-service>.onrender.com`.

Note: `var/` state (memory graph, feedback, chat sessions) lives on the
container filesystem — on Render's free plan it is ephemeral and resets on
redeploy/restart. The seeded base layer is rebuilt from `data/` on every start.

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

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
| `STORAGE_BACKEND` | `elastic` | `elastic` reads/writes the lake + memory through Elasticsearch; falls back to `local` when ES is unreachable |
| `ES_URL` | `http://localhost:9200` | Elasticsearch endpoint |
| `ES_API_KEY` | — | Optional API key for a secured cluster |
| `ES_INDEX_PREFIX` | — | Prefix prepended to every index name (tests use `test-`) |

### Backend architecture

```
app/
  config.py             pydantic-settings: app name, CORS, DATA_DIR, memory/feedback paths
  data/
    models.py           BankTxn, GLLine, Invoice, Email pydantic models
    loaders.py          norm_ref + regexes; loaders for the 4 raw sources
    lake.py             DataLake — storage seam (query helpers; future ES/DuckDB impls)
    es_store.py         ElasticStore + index MAPPINGS (thin ES 8 wrapper)
    es_lake.py          ElasticDataLake — the DataLake seam over ES queries
    ingest.py           ingest_lake() + `python -m app.data.ingest` CLI
  memory/
    models.py           Finding, Node, Edge, Signal
    graph.py            MemoryGraph — shared JSON-persisted memory (seed/remember/recall/context/search/signals)
    seed.py             base layer: every invoice/JE/bank line/email/scan linked into one graph
    signals.py          structural leads (duplicates, bank changes, unrecorded items...) routed by agent
    es_sync.py          ElasticMemorySync — mirrors findings/edges/nodes into ES indices
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
    deals/
      agent.py          DealsAgent — inbox triage: which emails are sales opportunities,
                        stage, value estimate, credit check vs memory, reply draft
    apar/
      agent.py          APARAgent — deterministic AP/AR: duplicates, amount mismatches vs
                        OCR'd scans, accruals, remit-to changes, short pays, promises to
                        pay, cash application, AR aging, payment run
  chat/
    models.py           ChatMessage/ToolCall/ToolEvent/ChatSession/ChatResponse
    sessions.py         ChatSessionStore — JSON-file session list (var/chat_sessions.json)
    tools.py            build_tools() — graph/orchestrator/feedback tools with citations
    service.py          ChatService — the tool-calling loop (≤8 steps, OpenAI tools API)
  api/
    recon.py            POST /api/agents/recon/run, POST /api/agents/apar/run
    deals.py            POST /api/agents/deals/run, GET /api/deals (inbox triage + drafts)
    memory.py           GET /api/memory/{graph,stats,node,context,search,signals,precedents,findings}
                        POST /api/memory/findings, POST /api/memory/reset
    feedback.py         GET/POST /api/feedback, DELETE /api/feedback/{id}
    orchestrator.py     GET /api/agents (specs), POST /api/orchestrator/run
    chat.py             POST /api/chat, GET/DELETE /api/chat/sessions[/{id}]
    storage.py          GET /api/storage, POST /api/storage/ingest
```

The orchestrator plans from the agent registry via OpenAI when
`OPENAI_API_KEY` is set, and falls back to deterministic keyword matching
otherwise. Each run is recorded as an `ORCHESTRATION_RUN` finding in the
shared memory graph.

**The orchestrator is memory-first**: before planning it consults the shared
memory (`consult_memory`) and builds a `MemoryBrief` — recent findings, open
signals grouped by `suggested_agent`, and a `memory.search()` hit list (an
Elasticsearch query in elastic mode). The brief goes into the LLM prompt and
also boosts the keyword-fallback scoring (agents with open signals get
+2/signal). `GET /api/orchestrator/brief?request=...` returns the brief alone;
`POST /api/orchestrator/run` responses include it. The LLM may answer
`{"calls": [], "reason": ...}` when a finding already covers the request —
that is a real plan, not a fallback.

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

### Elasticsearch backend (optional)

With `STORAGE_BACKEND=elastic`, the data lake and the memory graph read/write
through Elasticsearch instead of local files — agents, the orchestrator and the
chatbot are unchanged. If ES is unreachable at startup the backend logs a
warning and falls back to `local`.

Start ES (and optionally Kibana) with podman:

```bash
podman run -d --name finertia-es -p 9200:9200 \
  -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  -e ES_JAVA_OPTS="-Xms1g -Xmx1g" \
  docker.elastic.co/elasticsearch/elasticsearch:8.15.1

podman run -d --name finertia-kibana -p 5601:5601 \
  -e ELASTICSEARCH_HOSTS=http://host.containers.internal:9200 \
  docker.elastic.co/kibana/kibana:8.15.1
```

Load the lake into ES and run the backend against it:

```bash
cd backend
uv run python -m app.data.ingest            # recreates fin-* indices, prints counts
STORAGE_BACKEND=elastic uv run uvicorn app.main:app --port 8000
```

If `fin-bank` is missing, empty, or fails the `_meta.finertia_schema`
compatibility check at startup, the app re-ingests from `DATA_DIR`
automatically (falling back to local mode if `DATA_DIR` is unavailable — it
never crashes on foreign indices). `GET /api/storage` reports the active
backend and per-index document counts; `POST /api/storage/ingest` re-ingests
from `DATA_DIR`. Every `fin-*` doc carries an `ord` field preserving the local
loader order, since `seed()` is order-dependent.

Indices (`ES_INDEX_PREFIX` prepends to each name):

| Index | Holds |
| --- | --- |
| `fin-bank` | bank transactions (`BankTxn`, id = `txn_id`) |
| `fin-gl` | journal lines (`GLLine`, id = `je_id:line_no`) |
| `fin-invoices` | invoices (`Invoice`, id = `source:invoice_number_norm`) |
| `fin-emails` | emails (`Email`, id = `file`) |
| `agent-memory` | findings written by `MemoryGraph.remember` |
| `memory-graph` | edges written by `remember` (finding-layer edges) |
| `memory-nodes` | every graph node + flattened text, powering ES-backed `search()` |

In elastic mode ES is the memory store: `MemoryGraph` runs with no JSON path,
`attach_sync` loads the persisted findings/edges/nodes from `agent-memory` /
`memory-graph` / `memory-nodes` at startup (backfilling anything ES missed),
and `graph.search()` queries `memory-nodes` with a local-BM25 fallback. In
local mode everything behaves as before — `var/memory_graph.json` is the
store.

## Authentication

Every API route except `/api/health` and `/api/auth/*` requires a Bearer token.
Accounts are email + password and live in the `users` Elasticsearch index
(scrypt-hashed; `var/users.json` in local mode). All accounts share the same
workspace — the data, memory graph and findings are common; chat history is
per user.

- Demo account seeded at startup: **user `admin` / password `password`**
  (override with `DEMO_ADMIN_USERNAME` / `DEMO_ADMIN_PASSWORD`).
- `POST /api/auth/signup {email, password, name}`, `POST /api/auth/login
  {identifier, password}` → `{token, user}`, `GET /api/auth/me`.
- Set `AUTH_SECRET` (32+ random bytes) in production; tokens last
  `AUTH_TOKEN_TTL_HOURS` (default 168).
- `AUTH_REQUIRED=false` disables the gate entirely.

The frontend redirects unauthenticated visitors to `/login`; sign up at `/signup`.

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

### AP/AR agent and OCR

`POST /api/agents/apar/run` (or the orchestrator with "receivables", "payables",
"invoices", "aging"...) runs the AP/AR agent. It is fully rule-based over the
memory graph and writes one finding per issue with evidence ids and, where
applicable, a proposed journal entry:

| Code | What it means | Proposed action |
| --- | --- | --- |
| `DUPLICATE_PAYMENT` | one invoice posted and paid twice under two spellings | reverse expense, recover from vendor |
| `AMOUNT_MISMATCH` | booked amount differs from the invoice, confirmed by scan/email | correcting entry |
| `UNRECORDED_LIABILITY` | invoice received (scan/email) but never posted | accrual |
| `VENDOR_BANK_CHANGE` | remit-to account differs from the vendor's history | hold / recall, verify by phone |
| `SHORT_PAY_DISPUTE` | customer short-paid with a written reason | credit memo |
| `PROMISE_TO_PAY` | customer committed to a date by email | forecast on that date |
| `AR_AGING` / `PAYMENT_RUN` | period-end outputs (data in the finding) | — |

Scans are read by OCR **offline**: `scripts/ocr_scans.py` runs RapidOCR over
`data/scanned_invoices/*.png` and writes `ocr.json` next to them (committed).
Seeding parses invoice number, dates, currency, total and remit account from
that text onto each scan node and compares them to the invoice feed
(`SCAN_OF` edge carries `total_diff` / `remit_match`). Runtime never calls an
OCR engine, so results are identical on every machine. Re-run after changing a
scan:

```bash
cd backend && uv run --no-project --with rapidocr-onnxruntime --with pillow python scripts/ocr_scans.py
```

### Deals agent (inbox → opportunities → reply drafts)

The **Deals** screen lists every email in `data/emails/` with the agent's verdict.
Classification is deterministic: buying-intent words (quote, RFQ, pilot, renew,
units, pricing...) score up; vendor senders, internal mail and operations
phrases (remittance, resending, short payment, "reply to accept") score down;
sent-to-`sales@` scores up. Score ≥ 4 is a deal, staged as New inbound
(unknown domain), Expansion, Renewal or RFQ.

For each deal the agent sizes it (amount in the email, else units × the
customer's average invoice), pulls the customer's record from shared memory
(invoices, open AR, invoices more than 7 days past due, promises to pay,
disputes) and drafts a reply from a template filled with those facts. A
customer with past-due invoices gets a credit-terms paragraph and the finding
is marked high severity. If `OPENAI_API_KEY` is set the draft is rephrased by
the model, but only kept if every number survives; otherwise the template is
shown. Nothing is sent: the UI offers "Copy draft".

Seven sample sales emails (`013`–`019`) sit alongside the twelve operations
emails so the triage has both kinds to separate; `018_vantage_upsell.eml` is a
vendor selling to us and is correctly ruled out.

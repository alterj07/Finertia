# Finertia

> Your books, run by agents you can audit.

Finertia is an agentic CFO demo: a set of specialist finance agents (cash
reconciliation, AP/AR, deals) that work over one **shared memory graph** built
from a small finance data lake, an **LLM orchestrator** that plans which agents
to run, a **tool-calling chatbot** that answers with citations into that graph,
and a **Next.js dashboard** (command center, Financial Operations with
AP/AR–Reconciliation–Close–Audit–Forecast tabs, Flight Simulator, Data Graph)
where every number is sourced from the lake or an agent finding.

Monorepo: a FastAPI backend (`backend/`), a Next.js frontend (`frontend/`) and
the sample data lake (`data/`).

## Contents

- [Quick start](#quick-start)
- [Repository layout](#repository-layout)
- [Data lake](#data-lake)
- [Shared memory graph](#shared-memory-graph)
- [Agents](#agents)
  - [Orchestrator](#orchestrator-memory-first-planning)
  - [Cash & Reconciliation](#cash--reconciliation-agent)
  - [AP/AR and OCR](#apar-agent-and-ocr)
  - [Deals](#deals-agent-inbox--opportunities--reply-drafts)
  - [Audit & Controls](#audit--controls-agent)
  - [Auto-run on cold start](#auto-run-on-cold-start)
  - [Tuning feedback](#tuning-feedback)
- [Chatbot](#chatbot)
- [Dashboard API](#dashboard-api)
- [Flight Simulator](#flight-simulator)
- [Data uploads](#data-uploads)
- [Elasticsearch backend](#elasticsearch-backend)
- [Frontend](#frontend)
- [API reference](#api-reference)
- [Configuration](#configuration)
- [Testing and linting](#testing-and-linting)
- [Deploy](#deploy)

## Quick start

Prerequisites: Node.js 24+ / npm 12+, Python 3.14+ managed via
[uv](https://docs.astral.sh/uv/), and optionally Elasticsearch 8 (podman/docker).

```bash
# backend
cd backend
cp .env.example .env              # then set OPENAI_API_KEY for LLM features
uv sync
uv run uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend
cp .env.local.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                       # http://localhost:3000
```

Without Elasticsearch running the backend logs a warning and falls back to
local JSON files under `backend/var/`. Without `OPENAI_API_KEY` the
orchestrator uses its deterministic planner, the deals agent shows template
drafts, the flight simulator uses rules, and the chatbot returns 503.

## Repository layout

```
data/                         sample finance data lake (see below)
render.yaml                   Render blueprint for the backend
frontend.txt                  original frontend build spec (design tokens, screen specs)
backend/
  Dockerfile                  uv-based image; bundles data/
  pyproject.toml              deps: fastapi, elasticsearch, openai, pyarrow, pyjwt, python-multipart
  scripts/ocr_scans.py        offline OCR of scanned invoices -> data/scanned_invoices/ocr.json
  tests/                      pytest suite (agents, memory, chat, uploads, dashboard, ES)
  var/                        local-mode state: memory_graph.json, feedback.json, chat_sessions.json, users.json
  app/
    main.py                   lifespan: storage selection, lake, memory, LLM, registry, warm-up
    config.py                 pydantic-settings (see Configuration)
    data/
      models.py               BankTxn, GLLine, Invoice, Email
      loaders.py              norm_ref + regexes; parsers for the 4 raw sources
      lake.py                 DataLake — in-memory storage seam with query helpers + add()
      es_store.py             ElasticStore + index MAPPINGS (thin ES 8 wrapper)
      es_lake.py              ElasticDataLake — the DataLake seam over ES queries
      ingest.py               ingest_lake() + `python -m app.data.ingest` CLI
      upload.py               inspect_files(): classify/validate/parse uploaded files and zips
    memory/
      models.py               Finding, Node, Edge, Signal
      graph.py                MemoryGraph — seed/remember/recall/context/search/signals
      seed.py                 base layer: every document/party/account/period linked into one graph
      signals.py              structural leads (duplicates, bank changes, unrecorded items...) per agent
      view.py                 human-readable node/edge labels for the graph UI and chat citations
      es_sync.py              ElasticMemorySync — mirrors findings/edges/nodes into ES
    agents/
      base.py                 AgentContext, Agent ABC, AgentSpec/AgentResult — the orchestrator contract
      llm.py                  LLMProvider protocol + NullLLM + OpenAIProvider + build_llm()
      registry.py             AgentRegistry; default_registry() registers the specialists
      orchestrator.py         Orchestrator — memory brief + LLM plan (JSON) with keyword fallback
      warmup.py               AgentWarmup — background orchestrator run on cold start
      feedback.py             Adjustment + FeedbackStore — the tuning seam
      recon/                  ReconAgent: RuleBook of 4 match passes, bank-to-book recon
      apar/                   APARAgent: deterministic AP/AR findings with proposed JEs
      deals/                  DealsAgent: inbox triage, sizing, credit check, reply drafts
      audit/                  AuditAgent: SOD violations, findings rollup, cash forecast
    chat/
      models.py               ChatMessage/ToolCall/ToolEvent/ChatSession/ChatResponse
      sessions.py             ChatSessionStore — per-user session list
      tools.py                build_tools() — graph/orchestrator/feedback tools with citations
      service.py              ChatService — tool-calling loop (<=8 steps, OpenAI tools API)
    dashboard/
      common.py               kpi/money/finding helpers; "N/A" for anything unsourced
      screens.py              build_<screen>() — lake+memory -> the frontend's TS shapes
    api/                      one router per feature (see API reference)
frontend/
  src/app/                    App Router pages: / financial-operations flight-simulator graph chat
                              payables receivables reconciliation close deals forecast
                              audit redirect into Financial Operations tabs (payables/invoices/[id]
                              and payables/auto-paid remain as drill-downs)
  src/components/
    shell/                    app-shell, left-rail, topbar, copilot-rail
    screens/                  command-center, financial-operations (tabbed), deals, flight-simulator, graph
    graph/                    graph-canvas (d3-force), detail panel, legend, agent-runner, data-upload
    shared/                   kpi-row, ledger, data-table, section-block, dashboard-gate, status-tag,
                              chat-text, rolling-figure...
    ui/                       shadcn primitives
  src/lib/                    api.ts (apiFetch + typed helpers), types.ts, config/nav.ts,
                              config/copilot.ts, use-dashboard.ts, use-agent-status.ts,
                              financial-ops.ts (tab row builders), graph-utils.ts
  src/store/                  zustand: app-store (nav), copilot-store, highlight-store
```

## Data lake

`data/` holds one quarter of a small company's books, with eleven planted
ground-truth issues (`ground_truth.json`):

| File | Contents |
| --- | --- |
| `bank_transactions.csv` | bank statement lines (`BankTxn`) |
| `general_ledger.parquet` | journal lines (`GLLine`) |
| `vendor_invoices.jsonl` | AP invoices and AR invoices from several source systems (`Invoice`) |
| `emails/*.eml` | 12 operations emails (remittances, disputes, promises to pay, bank changes) + 7 sales emails |
| `scanned_invoices/*.png` + `ocr.json` | scanned vendor invoices and their pre-computed OCR text |

`DataLake.from_dir(DATA_DIR)` loads everything in memory; `ElasticDataLake`
serves the same interface from `fin-*` indices. Both support `add()` for
[uploads](#data-uploads).

## Shared memory graph

The memory graph has two layers:

- **base layer** (`agent="ingest"`), rebuilt from the lake on every start by
  `app/memory/seed.py`. Every document is a node (`INV-7781`, `JE-1049`,
  `BK00037`, `AR-1044`, `001_brightline_resend.eml`,
  `scan_brightline_INV7781.png`), every party/account/period is a node (`V003`,
  `C007`, `acct:****9921`, `2026-03`), and every cross-source relationship is an
  edge: `ISSUED_BY`, `REMITS_TO`, `USES_ACCOUNT`, `RECORDS` (JE -> document,
  with `amount_diff`), `SETTLES` / `CLEARS` (bank line -> document / JE),
  `MENTIONS` / `EXPLAINS` (email -> anything), `SCAN_OF`. Different spellings of
  one document number (`INV-7781`, `INV7781`) resolve to one node via aliases.
- **memory layer**: findings agents write with `MemoryGraph.remember`
  (`finding:{code}:{key}` nodes with `INVOLVES` / `EVIDENCED_BY` edges). Kept
  across restarts — in `var/memory_graph.json` locally, in ES in elastic mode.

`app/memory/view.py` gives every node and edge a human-readable label
(`Brightline Systems [V-1002]`, `records`, `settles`) used by the Data Graph
screen and by chat citations.

What an agent (or the chatbot) does with it:

| Call | Purpose |
| --- | --- |
| `GET /api/memory/context?id=INV7781` | prompt-ready markdown of a node's neighbourhood + prior findings |
| `GET /api/memory/signals?agent=AP/AR` | structural leads for that agent to confirm (all 11 ground-truth traps surface here) |
| `GET /api/memory/precedents?party=V009` | a vendor/customer's history, recurring patterns, usual remit account, past findings |
| `GET /api/memory/search?q=damaged units` | keyword search over every node incl. email bodies and memos (ES query in elastic mode, BM25 locally) |
| `POST /api/memory/findings` | write a finding back; entities/evidence ids attach to the seeded nodes |
| `GET /api/memory/graph?types=invoice&types=bank_txn` | slice for the force-graph visualisation |
| `GET /api/memory/graph/view` | the labelled view the Data Graph screen renders |

## Agents

All agents implement `Agent.run(ctx: AgentContext, params) -> AgentResult` and
are registered with an `AgentSpec` (name, capabilities, parameters) in
`default_registry()`. `AgentContext` carries the lake, the memory graph, the
feedback store and the LLM provider.

### Orchestrator (memory-first planning)

`POST /api/orchestrator/run {request}` plans from the registry via OpenAI when
`OPENAI_API_KEY` is set and falls back to deterministic keyword matching
otherwise. Each run is recorded as an `ORCHESTRATION_RUN` finding.

Before planning it consults shared memory (`consult_memory`) and builds a
`MemoryBrief` — recent findings, open signals grouped by `suggested_agent`,
and a `memory.search()` hit list. The brief goes into the LLM prompt and boosts
the keyword-fallback scoring (agents with open signals get +2/signal).
`GET /api/orchestrator/brief?request=...` returns the brief alone; run
responses include it. The LLM may answer `{"calls": [], "reason": ...}` when a
finding already covers the request — that is a real plan, not a fallback.

### Cash & Reconciliation agent

`POST /api/agents/recon/run` matches bank lines to book entries through a
`RuleBook` of four passes — `ReferenceMatch` (invoice/check reference + exact
amount, closest date), `AmountDateMatch` (exact amount, closest date within a
window), `ManyToOneMatch` (one bank line = several book lines, subset-sum
remittance confirmed by email) and `ToleranceMatch` (near-amount → FX/fee
differences) — with pins/blocks/params that feedback can adjust.
It writes `RECON_SUMMARY`, `UNRECORDED_BANK_ITEMS`, `TIMING_ITEMS` and
per-item findings (`LUMP_SUM_MATCH`, `FX_DIFFERENCE`, `AMOUNT_VARIANCE`)
with the matches as evidence.

### AP/AR agent and OCR

`POST /api/agents/apar/run` (or the orchestrator with "receivables",
"payables", "invoices", "aging"...) is fully rule-based over the memory graph
and writes one finding per issue with evidence ids and, where applicable, a
proposed journal entry:

| Code | What it means | Proposed action |
| --- | --- | --- |
| `DUPLICATE_PAYMENT` / `DUPLICATE_INVOICE` | one invoice posted and paid twice under two spellings | reverse expense, recover from vendor |
| `AMOUNT_MISMATCH` | booked amount differs from the invoice, confirmed by scan/email | correcting entry |
| `UNRECORDED_LIABILITY` | invoice received (scan/email) but never posted | accrual |
| `VENDOR_BANK_CHANGE` | remit-to account differs from the vendor's history | hold / recall, verify by phone |
| `SHORT_PAY_DISPUTE` / `SHORT_PAY` | customer short-paid — with a written reason (dispute) or without (chase the balance) | credit memo (dispute only) |
| `PROMISE_TO_PAY` | customer committed to a date by email | forecast on that date |
| `AR_AGING` / `PAYMENT_RUN` | period-end outputs (data in the finding) | — |

Scans are read by OCR **offline**: `scripts/ocr_scans.py` runs RapidOCR over
`data/scanned_invoices/*.png` and writes `ocr.json` next to them (committed).
Seeding parses invoice number, dates, currency, total and remit account from
that text onto each scan node and compares them to the invoice feed (`SCAN_OF`
carries `total_diff` / `remit_match`). Runtime never calls an OCR engine, so
results are identical on every machine. Re-run after changing a scan:

```bash
cd backend && uv run --no-project --with rapidocr-onnxruntime --with pillow python scripts/ocr_scans.py
```

### Deals agent (inbox -> opportunities -> reply drafts)

`GET /api/deals` / `POST /api/agents/deals/run` lists every email in
`data/emails/` with the agent's verdict. Classification is deterministic:
buying-intent words (quote, RFQ, pilot, renew, units, pricing...) score up;
vendor senders, internal mail and operations phrases (remittance, resending,
short payment, "reply to accept") score down; sent-to-`sales@` scores up.
Score >= 4 is a deal, staged as New inbound (unknown domain), Expansion,
Renewal or RFQ.

For each deal the agent sizes it (amount in the email, else units x the
customer's average invoice), pulls the customer's record from shared memory
(invoices, open AR, invoices more than 7 days past due, promises to pay,
disputes) and drafts a reply from a template filled with those facts. A
customer with past-due invoices gets a credit-terms paragraph and the finding
is marked high severity. If `OPENAI_API_KEY` is set the draft is rephrased by
the model, but only kept if every number survives. Nothing is sent: the UI
offers "Copy draft". `018_vantage_upsell.eml` is a vendor selling to us and is
correctly ruled out.

### Audit & Controls agent

`POST /api/agents/audit/run` is deliberately small: it turns `SOD_VIOLATION`
signals (self-approved / off-hours / round-amount manual journals) into
findings, writes an `AUDIT_SUMMARY` rollup of open findings by severity and
agent, and emits a `CASH_FORECAST` straight-line projection of the GL cash
balance. No LLM calls.

### Auto-run on cold start

When shared memory holds no specialist findings (fresh container, reset
memory), `AgentWarmup` runs the orchestrator once in a background thread with
`AUTO_RUN_REQUEST` ("Close the books for Q1: reconcile cash, review payables
and receivables, and review the deal pipeline"). `GET /api/orchestrator/status`
reports `idle | skipped | running | done | failed`; the frontend polls it
(`use-agent-status.ts`) — dashboard screens show an "Agents are analysing the
data" banner via `DashboardGate` (with a **Run agents** button when a screen
reports `needs_run`), the Copilot rail shows a notice, and screens refetch
when the run finishes. Disable with `AUTO_RUN_AGENTS=false`. The Data
Graph screen also has a manual **Run agents** button.

### Tuning feedback

`FeedbackStore` (`var/feedback.json`) holds `Adjustment`s — per-agent tuning
such as recon pins/blocks or parameter overrides. `GET/POST /api/feedback`,
`DELETE /api/feedback/{id}`; the chatbot can write them via `record_feedback`.

## Chatbot

`POST /api/chat {message, session_id?, context?}` runs a tool-calling loop
(`app/chat/service.py`): the LLM gets the system prompt plus session history,
calls tools, and answers concisely with inline `[node-id]` citations. Responses
carry the ordered `citations`, the `tool_events` trace, and a `labels` map from
cited ids to readable names so the UI can render `Brightline Systems` instead
of `V-1002` while keeping the id for links. Requires `OPENAI_API_KEY` (503
without it).

| Tool | Purpose |
| --- | --- |
| `search_memory` | search over all graph nodes |
| `get_context` | neighbourhood + prior findings around a node |
| `get_findings` | list memory findings by code/agent |
| `get_precedents` | a party's history, patterns, past findings |
| `get_signals` | structural leads the graph surfaces |
| `list_agents` | registered agent specs |
| `run_orchestrator` | run specialist agents for a request |
| `record_feedback` | write a tuning Adjustment for an agent |
| `list_feedback` | list recorded adjustments |

Sessions are stored per user (`var/chat_sessions.json` locally) and listed /
fetched / deleted via `/api/chat/sessions[/{id}]`; a user can only see their
own. In the frontend the **Copilot rail** keeps one persistent conversation
across pages and reloads (zustand `persist` in `localStorage`), shows
per-module suggestion chips from `config/copilot.ts`, and `/chat` is the
full-page view
(`?session=<id>` resumes). Citations are chips; on the Data Graph screen,
nodes the chatbot mentions or cites are selected and zoomed into view.

## Dashboard API

`GET /api/dashboard/{screen}` for `command-center`, `payables`, `receivables`,
`reconciliation`, `close`, `forecast`, `audit` returns exactly the TypeScript
shapes the screens render, built by `app/dashboard/screens.py` from the lake
plus memory findings. Anything that cannot be sourced renders as the literal
`"N/A"` rather than a made-up number; screens that need agent output before
they are meaningful say so (`needs_run`).
`GET /api/dashboard/payables/invoices/{key}` returns the drill-down for one
payable finding. 503 if no lake is loaded.

## Flight Simulator

`/flight-simulator` is a read-only what-if over the 13-week cash forecast. Pick
a lever (bring receivables forward, defer payables, add opex, draw debt,
cut capex), an amount and a
timing; the screen recomputes the scenario curve client-side against the live
forecast and shows the end-of-horizon delta and the cash-floor delta.
`POST /api/flight-simulator/analyze` returns a 3-field opinion
(`verdict: good|bad|neutral`, `recommendation`, `why`) from a deliberately tiny
LLM payload (six numbers, JSON mode, <=90 tokens), with a rules fallback when
no key is configured; `source` tells you which one answered.

## Data uploads

The Data Graph screen has a drop zone (`components/graph/data-upload.tsx`) that
accepts files, folders or zips. `POST /api/uploads/validate` returns a per-file
report without writing anything; `POST /api/uploads` ingests and re-seeds the
memory graph.

- Accepted: `.csv` (bank or GL — classified by headers), `.parquet` (GL),
  `.json`/`.jsonl` (invoices, schema-checked), `.eml`, `.zip` (expanded;
  nested zips rejected). OS junk (`.DS_Store`, `Thumbs.db`, `__MACOSX/`) is
  ignored.
- One incompatible file blocks the whole batch (400 with the report) before
  anything is stored. 50 MB limit (413).
- Both lakes dedupe by natural id (bank `txn_id`, GL `je_id:line_no`, invoice
  `source:number`, email file): elastic upserts into the `fin-*` indices, local
  merges in memory (later wins) until restart.
- Scanned PNG invoices are not accepted at runtime (OCR is offline, see above).

## Elasticsearch backend

With `STORAGE_BACKEND=elastic` (the default), the data lake, the memory graph
and the user store read/write through Elasticsearch — agents, orchestrator,
chatbot and dashboards are unchanged. If ES is unreachable at startup the
backend logs a warning and falls back to `local`.

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

For a secured / Elastic Cloud cluster set `ES_URL` and `ES_API_KEY`.

Load the lake into ES manually if you want to:

```bash
cd backend
uv run python -m app.data.ingest            # recreates fin-* indices, prints counts
```

If `fin-bank` is missing, empty, or fails the `_meta.finertia_schema`
compatibility check at startup, the app re-ingests from `DATA_DIR`
automatically (falling back to local mode if `DATA_DIR` is unavailable — it
never crashes on foreign indices). `GET /api/storage` reports the active
backend and per-index counts; `POST /api/storage/ingest` re-ingests from
`DATA_DIR`. Every `fin-*` doc carries an `ord` field preserving loader order,
since `seed()` is order-dependent.

Indices (`ES_INDEX_PREFIX` prepends to each name; tests use `test-`):

| Index | Holds |
| --- | --- |
| `fin-bank` | bank transactions (`BankTxn`, id = `txn_id`) |
| `fin-gl` | journal lines (`GLLine`, id = `je_id:line_no`) |
| `fin-invoices` | invoices (`Invoice`, id = `source:invoice_number_norm`) |
| `fin-emails` | emails (`Email`, id = `file`) |
| `agent-memory` | findings written by `MemoryGraph.remember` |
| `memory-graph` | finding-layer edges |
| `memory-nodes` | every graph node + flattened text, powering ES-backed `search()` |
| `users` | accounts (scrypt hash + salt, never plaintext) |

In elastic mode `MemoryGraph` runs with no JSON path: `attach_sync` loads the
persisted findings/edges/nodes at startup (backfilling anything ES missed) and
`graph.search()` queries `memory-nodes` with a local-BM25 fallback.


## Frontend

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 + shadcn/base-ui,
zustand for state, recharts for charts, d3-force/zoom/drag for the graph,
lucide icons. Design tokens and screen specs come from `frontend.txt`.

```bash
cd frontend
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

Shell:

- **Left rail** — icon rail that expands on hover (single theme; there is no
  light/dark toggle). Modules: Dashboard, Financial Operations, Flight
  Simulator, Data Graph.
- **Topbar** — module title, mobile nav/copilot buttons, account chip with
  sign-out.
- **Copilot rail** — the persistent chatbot (see [Chatbot](#chatbot)); shows
  the "agents are analysing" indicator while the warm-up runs, and the
  Financial Operations screen's row-level **Ask** buttons hand it a pending
  draft (`setPendingDraft`, e.g. "explain this finding").
- Pages stagger into view and KPI figures roll like a counter
  (`rolling-figure.tsx`, 900 ms).

Screens (`components/screens/`):

| Route | Screen | Shows |
| --- | --- | --- |
| `/` | Command center | KPIs, agent activity ledger + flag/review/auto breakdown, close-status mini checklist |
| `/financial-operations` | Financial Operations | work queue plus tabs fed by `useDashboard(<screen>)`: **AP / AR** (payables and receivables tables), **Reconciliation** (bank-to-book match status), **Close** (checklist + proposed adjusting entries + the embedded Deals inbox triage/drafts), **Audit** (control findings), **Forecast** (13-week cash forecast) |
| `/payables`, `/receivables`, `/reconciliation`, `/close`, `/deals`, `/forecast`, `/audit` | — | redirect to the matching `/financial-operations?tab=` tab |
| `/payables/invoices/[id]`, `/payables/auto-paid` | drill-downs | one payable finding; the payment-run ledger |
| `/flight-simulator` | Flight Simulator | what-if levers over the forecast + LLM/rules verdict |
| `/graph` | Data Graph | force-directed memory graph, legend, detail panel, agent runner, uploads |
| `/chat` | Chat | full-page copilot with sessions |

Data Graph details: hover focus lights up a node's connections and fades the
rest (driven by CSS data attributes, frozen while dragging); clicking opens
the detail panel with the node's readable label, props and edges; the
chatbot's mentioned/cited nodes are selected and zoomed into view.

## API reference

All routes are under `/api`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness |
| GET | `/agents` | registered agent specs |
| GET | `/orchestrator/brief?request=` | memory brief for a request |
| GET | `/orchestrator/status` | warm-up state |
| POST | `/orchestrator/run` | plan + run specialists |
| POST | `/agents/recon/run`, `/agents/apar/run`, `/agents/deals/run`, `/agents/audit/run` | run one agent directly |
| GET | `/deals` | inbox triage + drafts |
| GET | `/memory/graph`, `/memory/graph/view`, `/memory/stats`, `/memory/node`, `/memory/context`, `/memory/search`, `/memory/signals`, `/memory/precedents`, `/memory/findings` | read the shared memory |
| POST | `/memory/findings`, `/memory/reset` | write a finding / wipe memory and re-seed the base layer from the lake |
| GET/POST | `/feedback` · DELETE `/feedback/{id}` | tuning adjustments |
| POST | `/chat` · GET/DELETE `/chat/sessions[/{id}]` | chatbot |
| GET | `/dashboard/{screen}`, `/dashboard/payables/invoices/{key}` | screen payloads |
| POST | `/flight-simulator/analyze` | scenario verdict |
| POST | `/uploads/validate`, `/uploads` | data uploads |
| GET/POST | `/storage`, `/storage/ingest` | backend status / re-ingest |

## Configuration

Backend (`backend/.env`, all optional unless noted):

| Var | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `../data` | Finance data lake |
| `STORAGE_BACKEND` | `elastic` | `elastic` or `local`; elastic falls back to local when ES is unreachable |
| `ES_URL` | `http://localhost:9200` | Elasticsearch endpoint |
| `ES_API_KEY` | — | API key for a secured cluster |
| `ES_INDEX_PREFIX` | — | Prefix for every index name |
| `MEMORY_GRAPH_PATH` | `./var/memory_graph.json` | memory store (local mode) |
| `FEEDBACK_PATH` | `./var/feedback.json` | tuning adjustments |
| `CHAT_SESSIONS_PATH` | `./var/chat_sessions.json` | chat sessions |
| `USERS_PATH` | `./var/users.json` | user store (local mode) |
| `OPENAI_API_KEY` | — | enables LLM planning, chatbot, deal-draft rephrasing, simulator verdicts |
| `OPENAI_MODEL` | `gpt-4o-mini` | model for all LLM calls |
| `AUTO_RUN_AGENTS` | `true` | run the orchestrator on cold start |
| `AUTO_RUN_REQUEST` | "Close the books for Q1: ..." | the request the warm-up runs |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated; localhost is always allowed |

Frontend (`frontend/.env.local`): `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).

## Testing and linting

```bash
cd backend
uv run pytest                 # 114 tests; ES integration tests skip when ES is down
uv run ruff check .

cd frontend
npx tsc --noEmit
npm run lint
npm run build
```

Test coverage by area: loaders and lake, memory graph + seeding, signals,
recon/AP-AR/deals agents, registry + orchestrator (LLM and fallback), warm-up,
feedback, chat tools/service/API, dashboard builders, uploads (classification,
zips, mixed-batch rejection), ES ingest unit tests
and a live ES integration suite under the `test-` prefix.

## Deploy

The backend ships as a Docker image built from the repo root (it bundles
`data/`):

- `backend/Dockerfile` — uv-based, `uvicorn app.main:app` on `$PORT` (default 8000)
- `render.yaml` — Render blueprint: web service `finertia-api`, health check
  `/api/health`

Steps:

1. Push the repo and create a new **Blueprint** on Render pointing at `render.yaml`.
2. Set env vars on the Render service:
   - `OPENAI_API_KEY` — chatbot, LLM planning, drafts, simulator
   - `ES_URL` / `ES_API_KEY` — Elastic Cloud (otherwise the service runs in local mode)
   - `CORS_ORIGINS` — `https://<your-vercel-app>.vercel.app`
3. Deploy the frontend on Vercel with `NEXT_PUBLIC_API_URL=https://<render-service>.onrender.com`.

In local mode `var/` state (memory layer, feedback, chat sessions, users)
lives on the container filesystem — on Render's free plan it is ephemeral and
resets on redeploy/restart; the base layer is rebuilt from `data/` on every
start and the warm-up re-creates the findings. With Elasticsearch configured,
everything persists in the cluster.

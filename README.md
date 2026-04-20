# Receipt Assistant Frontend

React dashboard for the [Receipt Assistant](https://github.com/TINKPA/receipt-assistant) — an open-source, AI-native personal finance system that parses receipt images with Claude, tracks spending in a PostgreSQL double-entry ledger, and monitors every AI call through self-hosted Langfuse.

> **Part of a larger project**: This frontend connects to a backend that uses Claude Code CLI to extract structured data from receipt photos. Every extraction is traced and monitored. See the [backend repo](https://github.com/TINKPA/receipt-assistant) for the full picture.

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (this repo)                     :5173         │
│  React 19 + Vite + Tailwind CSS v4                      │
│                                                         │
│  Dashboard ───── spending overview, recent activity     │
│  Transactions ── full history, click → receipt detail   │
│  ReceiptDetail ─ line items, map, OCR text, quality     │
│  Upload Modal ── drop receipt → batch ingest            │
│                                                         │
│  All API calls go through openapi-fetch + Vite proxy:   │
│    /api/v1/* ───────────────────────────┐               │
└─────────────────────────────────────────┼───────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────┐
│  Backend (receipt-assistant)              :3000         │
│  Express + Claude Code CLI + PostgreSQL                 │
│                                                         │
│  POST /v1/ingest/batch ─── upload N files as a batch    │
│  GET  /v1/batches/:id ──── poll batch status/counts     │
│  GET  /v1/batches/:id/stream ─ SSE live progress        │
│  GET  /v1/transactions ─── list with filters            │
│  GET  /v1/transactions/:id ─ single receipt + postings  │
│  GET  /v1/documents/:id/content ─ receipt image         │
│  GET  /v1/reports/{summary,trends,net_worth,cashflow}   │
└─────────────────────────────────────────────────────────┘
```

## Type-safe client, code-first

The backend ships an **OpenAPI 3.1 spec** at [`openapi/openapi.json`](https://github.com/TINKPA/receipt-assistant/blob/main/openapi/openapi.json). We do **not** hand-write `fetch` calls against it — TypeScript types are generated from the spec:

```bash
npm run api:types   # regenerates src/lib/api-types.ts from the backend spec
```

`src/lib/api.ts` then wraps [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) with ergonomic helpers (compression on upload, `ETag` extraction on GET, `Idempotency-Key` on POST `/v1/transactions`, `If-Match` on PATCH / DELETE / POST `.../void`). Whenever the spec changes, regenerate and the type-checker will surface any breakage at the call site.

## Quick Start

```bash
# 1. Start the backend (see backend repo)
# 2. Clone and run the frontend
git clone https://github.com/TINKPA/receipt-assistant-frontend.git
cd receipt-assistant-frontend
npm install
npm run dev
# Open http://localhost:5173
```

The Vite dev server proxies `/api/*` to `localhost:3000` automatically.

### Environment variables

| Variable | When needed | Purpose |
|----------|-------------|---------|
| `VITE_GOOGLE_MAPS_API_KEY` | Receipt detail page | Enables the map + marker when an extraction produces `latitude` / `longitude`. Feature is gated on the key's presence — without it the map block is simply not rendered. |

Set either in `.env.local` (for dev) or as build-time variables for Docker builds.

## Running with Docker

An independent nginx-based stack is provided for self-hosting. It does **not** share a network with the backend — the two stacks communicate at the HTTP level, via the browser.

```bash
docker compose up -d --build
# frontend → http://localhost:8080
# expects backend at http://localhost:3000 (see receipt-assistant)
```

The container proxies `/api/*` to the backend URL configured via `BACKEND_URL` (default `http://host.docker.internal:3000`, which resolves to the host on Docker Desktop and — thanks to the `extra_hosts: host-gateway` line — on Linux too). To point at a remote backend instead:

```bash
BACKEND_URL=https://receipts.example.com docker compose up -d --build
```

`npm run dev` / `npm run build` continue to work unchanged for host development — the container is purely for production-style serving.

## Project Structure

```
src/
├── App.tsx                          # Tab routing + modal + receipt/batch detail state
├── main.tsx                         # React entry point
├── types.ts                         # UI Transaction / Category types
├── constants.ts                     # Static fixtures for placeholder sections
├── index.css                        # Tailwind v4 theme tokens + custom effects
├── lib/
│   ├── api.ts                       # ★ Type-safe backend client (openapi-fetch)
│   ├── api-types.ts                 # Generated from backend OpenAPI spec
│   └── utils.ts                     # cn() utility (clsx + tailwind-merge)
└── components/
    ├── Layout.tsx                   # Shell: sidebar + topbar + content area
    ├── Sidebar.tsx                  # Navigation tabs + user info + "Add" button
    ├── TopBar.tsx                   # Search bar + notifications + user menu
    ├── Dashboard.tsx                # ★ Spending overview, charts, recent activity
    ├── Transactions.tsx             # ★ Full transaction table with live API data
    ├── ReceiptDetail.tsx            # ★ Single receipt: items, image, map, OCR, quality
    ├── AddTransactionModal.tsx      # ★ Drop receipt → POST /v1/ingest/batch
    ├── ProcessingToast.tsx          # ★ Persistent toast polling outstanding batches
    ├── useProcessingJobs.ts         # localStorage-backed hook for in-flight batches
    ├── MonthlyReview.tsx            # Monthly analysis (currently static fixtures)
    └── YearlyReview.tsx             # Yearly review (currently static fixtures)
```

Components marked ★ are connected to the backend API.

## Data Flow

### Viewing transactions

```
Transactions.tsx
  └── useEffect → fetchTransactions({ has_document: true, limit: 50 })
        └── GET /api/v1/transactions?has_document=true&limit=50
              └── Vite proxy → localhost:3000
                    └── PostgreSQL → transactions + postings + documents
```

`src/lib/api.ts` maps the backend `Transaction` shape to the compact UI `Transaction` row (payee → description, signed minor-unit amount → float, metadata-derived category → `Dining`/`Travel`/...). Currency is never stored as a float — minor units are kept intact until the render boundary.

Clicking a row sets `selectedReceiptId` in `App.tsx`, which mounts `ReceiptDetail` and calls `fetchReceiptDetail(id)` → `GET /v1/transactions/:id`. The response's `ETag` is captured for future PATCH / DELETE / void calls.

### Uploading a receipt

```
AddTransactionModal.tsx
  └── user drops image(s)
        └── compressImage(file)            # if > 500 KB, re-encode to ≤ 1 MB JPEG
              └── ingestBatch([file])      # POST /api/v1/ingest/batch (FormData)
                    └── returns { batchId, items: [{ ingestId, filename, ... }] }
                          └── onComplete({ batchId, ingestId, filename })

App.tsx → useProcessingJobs
  └── job added to localStorage (survives refresh)
        └── ProcessingToast
              └── polls GET /v1/batches/:id every 2–3 s
                    ├── status 'extracted' / 'reconciled' → produce transactionId, remove job
                    ├── any error → surface in toast
                    └── refresh parent list on completion
```

The backend pipeline is **single-call**: one `claude -p` invocation reads the image, reasons in plain text, and writes the extracted fields directly via a `psql` tool call. There is no quick-done / processing-full split anymore — that multi-phase pipeline was removed and folded into a single chain-of-thought pass (see the backend README for why).

## API client

`src/lib/api.ts` exports the full v1 surface. Highlights:

```typescript
// Transactions — double-entry ledger primitives
listTransactions(filters)       // GET /v1/transactions
fetchReceiptDetail(id)          // GET /v1/transactions/:id → ReceiptView with ETag
createTransaction(input)        // POST /v1/transactions (Idempotency-Key required)
patchTransaction(id, patch, etag) // PATCH /v1/transactions/:id (If-Match, merge-patch+json)
voidTransaction(id, reason, etag) // POST /v1/transactions/:id/void (If-Match)
deleteTransaction(id, etag)     // DELETE /v1/transactions/:id (If-Match, draft/error only)

// Ingest batches — multi-file uploads with live stream
ingestBatch(files, { autoReconcile })  // POST /v1/ingest/batch
getBatch(id)                    // GET /v1/batches/:id
subscribeToBatch(id, onEvent)   // EventSource on /v1/batches/:id/stream

// Documents — receipt images + other attachments
uploadDocument(file, kind)      // POST /v1/documents (sha256-idempotent)
documentContentUrl(docId)       // URL for <img src>

// Reports
getSummaryReport({ from, to, groupBy })
getTrendsReport({ from, to, period, groupBy })
getNetWorthReport({ asOf })
getCashflowReport({ from, to })

// Errors — RFC 7807
extractProblemMessage(err)      // pull a human-visible string out of a Problem Details payload
```

Backend errors come back as `application/problem+json` per RFC 7807 — every helper funnels them through `extractProblemMessage` so callers only need to deal with readable strings.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19.0 |
| Build | Vite | 6.2 |
| Styling | Tailwind CSS | 4.1 (v4, using `@theme` tokens) |
| HTTP client | openapi-fetch | 0.17 |
| Types | openapi-typescript (dev) | 7.13 |
| Charts | Recharts | 2.12 |
| Icons | Lucide React | 0.546 |
| Animations | Framer Motion | 12.23 |
| Maps | @vis.gl/react-google-maps | 1.8 |
| Image compression | browser-image-compression | 2.0 |
| Language | TypeScript | 5.8 |

> **Note:** `@google/genai` is currently listed in `package.json` but has no code-level usage. Slated for investigation / removal.

## Design System

Dark theme with glass-panel effects, inspired by Material Design 3:

| Token | Color | Usage |
|-------|-------|-------|
| `primary` | `#4edea3` (teal) | Growth, positive metrics, CTAs |
| `secondary` | `#d0bcff` (purple) | Categories, accents |
| `tertiary` | `#7bd0ff` (cyan) | Alternate emphasis |
| `error` | `#ffb4ab` (coral) | Warnings, losses, pending status |
| `surface-*` | Dark grays | Card backgrounds, containers |

Fonts: **Manrope** (headlines), **Inter** (body text).

Custom effects: `glass-panel` (backdrop blur), `neon-glow-primary` (teal glow on key metrics).

## Development

```bash
npm run dev       # Dev server with HMR on :5173
npm run build     # Type-check + production build
npm run preview   # Preview production build locally
npm run lint      # ESLint
npm run api:types # Regenerate lib/api-types.ts from the backend OpenAPI spec
```

## Roadmap

- [ ] Connect filters on Transactions page to API query params ([#4](https://github.com/TINKPA/receipt-assistant/issues/4))
- [ ] Wire Monthly Review to real spending data (trends + cashflow + summary)
- [ ] Wire Yearly Review to real spending data (net_worth + cashflow + summary)
- [ ] Edit / void / delete affordances in ReceiptDetail (backend endpoints exist)
- [ ] Dedicated "Uploads" screen — batch history with live SSE progress
- [ ] Search functionality in TopBar

## Related

- [receipt-assistant](https://github.com/TINKPA/receipt-assistant) — Backend: Express + Claude Code CLI + PostgreSQL double-entry ledger + Langfuse monitoring
- [receipt-assistant-macos](https://github.com/TINKPA/receipt-assistant-macos) — Native macOS client (SwiftUI + swift-openapi-generator)

## License

MIT

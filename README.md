# Receipt Assistant Frontend

React PWA for the [Receipt Assistant](https://github.com/TINKPA/receipt-assistant) — an open-source, AI-native personal-finance system that parses receipt images with Claude, tracks spending in a PostgreSQL double-entry ledger, and monitors every AI call through self-hosted Langfuse.

> **Part of a larger project.** This frontend connects to a backend that uses Claude Code CLI to extract structured data from receipt photos. Every extraction is traced and monitored. See the [backend repo](https://github.com/TINKPA/receipt-assistant) for the full picture.

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (this repo)                     :5173 / :8080 │
│  React 19 + Vite 6 + Tailwind CSS v4                    │
│                                                         │
│  Books ───────── home, monthly spend, top categories    │
│  Ledger ──────── week-grouped transactions + filters    │
│  Receipt ─────── single entry: image, fields, items, …  │
│  Capture ─────── full-screen viewfinder + getUserMedia  │
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

`src/lib/api.ts` wraps [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) with ergonomic helpers (compression on upload, `ETag` extraction on GET, `Idempotency-Key` on POST `/v1/transactions`, `If-Match` on PATCH / DELETE / POST `.../void`). When the spec changes, regenerate and the type-checker surfaces breakage at the call site.

## Quick Start

```bash
# 1. Start the backend (see backend repo)
# 2. Clone and run the frontend
git clone https://github.com/TINKPA/receipt-assistant-frontend.git
cd receipt-assistant-frontend
npm install
npm run dev
# Open https://localhost:5173 (note: https — see "HTTPS dev server" below)
```

The Vite dev server proxies `/api/*` to `localhost:3000` automatically.

### HTTPS dev server

`npm run dev` ships HTTPS by default via [`@vitejs/plugin-basic-ssl`](https://www.npmjs.com/package/@vitejs/plugin-basic-ssl). The reason is `getUserMedia` — browsers refuse the camera API on plain-HTTP non-localhost origins, and the Capture screen relies on it for the live receipt viewfinder. First visit shows a "self-signed cert" warning; click through once per device. Opt out for plain HTTP with:

```bash
VITE_DEV_HTTPS=false npm run dev
```

The Docker production build is unaffected — `basic-ssl` is dev-server-only and contributes nothing to the bundle.

### Environment variables

| Variable | When needed | Purpose |
|----------|-------------|---------|
| `VITE_GOOGLE_MAPS_API_KEY` | Receipt detail page | Enables the map + marker when the backend returns a non-null `transaction.place` (Google Places entry from the `places` table with `lat` / `lng` / `formatted_address`). Baked into the JS bundle at build time via Docker build arg `VITE_GOOGLE_MAPS_API_KEY`. Gated on key presence — without it the map block is simply not rendered. |
| `VITE_DEV_HTTPS` | Dev only | Set to `false` to disable the self-signed HTTPS cert. Default is HTTPS on. |

Set either in `.env.local` (for dev) or as build-time variables for Docker builds.

## Running with Docker

An independent nginx-based stack is provided for self-hosting. It does **not** share a network with the backend — the two stacks communicate at the HTTP level via the browser.

```bash
docker compose up -d --build
# frontend → http://localhost:8080
# expects backend at http://localhost:3000
```

The container proxies `/api/*` to the backend URL configured via `BACKEND_URL` (default `http://host.docker.internal:3000`, which resolves to the host on Docker Desktop and — thanks to the `extra_hosts: host-gateway` line — on Linux too). To point at a remote backend:

```bash
BACKEND_URL=https://receipts.example.com docker compose up -d --build
```

`npm run dev` / `npm run build` continue to work unchanged — the container is purely for production-style serving.

## Mobile, the camera, and HTTPS

The Capture screen uses `navigator.mediaDevices.getUserMedia` to show a live preview from the rear camera. **Two hard constraints** govern when this works:

1. **Secure context.** Browsers refuse `getUserMedia` outside HTTPS / localhost. There is no exception for LAN IPs, VPNs, or "trusted" networks — `http://192.168.x.x` is rejected the same as `http://malicious.example.com`. The browser only knows the URL scheme, not the underlying transport.
2. **User gesture + permission grant.** The browser pops a native permission dialog the first time a page calls `getUserMedia` in each session.

For a typical setup where you want to test on your phone against your laptop, you need an HTTPS URL the phone can reach.

### Option 1 — Tailscale Serve (recommended for personal use)

If both your laptop and your phone are on a [Tailscale](https://tailscale.com/) tailnet, this is one command. Tailscale auto-fetches a real Let's Encrypt cert for `*.<tailnet>.ts.net`:

```bash
# One-time, on whichever machine runs the app (Mac mini, laptop):
# Enable HTTPS in your tailnet admin once:
#   https://login.tailscale.com/admin/dns → "Enable HTTPS"
# Then:
tailscale serve --bg http://localhost:8080
# Reports: https://<your-machine>.<tailnet>.ts.net/
```

Open that URL on the phone (also on the tailnet). Real cert, zero warnings, **camera permission works**. The config is persisted by `tailscaled` — survives reboots and Docker rebuilds. Switch off with `tailscale serve --https=443 off`.

### Option 2 — `npm run dev` over LAN

The bundled `basic-ssl` plugin lets `npm run dev` listen on `0.0.0.0` over HTTPS. The phone hits `https://<laptop-LAN-IP>:5173` and clicks through a self-signed cert warning once per device. This is the path if you don't have Tailscale set up.

### Option 3 — Real TLS in front of nginx

For a public deploy, terminate TLS in a reverse proxy (Caddy / Cloudflare Tunnel / nginx with a real cert) in front of the Docker container's port 8080. Standard practice; nothing app-specific.

### Add to Home Screen (PWA mode)

The app ships full PWA metadata — manifest, apple-touch-icon, `apple-mobile-web-app-capable=yes`, theme color. From iOS Safari → Share → **Add to Home Screen** → an app icon appears on your home screen. Launching from the icon opens in **standalone mode** (no Safari URL bar / toolbar) and persists camera permission across the app's lifetime instead of per-tab-session.

### iOS Safari camera permission caveat

Apple has decided web apps don't earn truly persistent camera consent the way App Store apps do. **Expect to re-grant camera permission after a cold launch** (after iOS kills the standalone PWA from memory, after a phone reboot, or after the app's been backgrounded for a long time). Within a single launch session you only grant once. This is by Apple's design at the WebKit layer — there is **no manifest field, meta tag, or JavaScript API that overrides it**.

The closest workaround is global:

> Settings → Safari → **Camera** → set to **Allow** (default is **Ask**). Safari will stop prompting on all sites; iOS may still gate the cold-launch consent at the system layer. Note this affects every site in Safari.

The only path to true "one-time forever" camera consent on iOS is shipping a native app (e.g., wrap this PWA in Capacitor or Tauri Mobile so it gets a bundle ID).

## Project Structure

```
src/
├── main.tsx               # React entry: QueryClientProvider + RouterProvider (scrollRestoration)
├── routes/                # TanStack Router file-based routes (_shell layout, /transactions, /receipt/$id, /brand/$id, /add, …)
├── routeTree.gen.ts       # Generated route tree (do not edit by hand)
├── types.ts               # UI Transaction + Category types
├── constants.ts           # Static fixtures for as-yet-unwired sections
├── index.css              # Tailwind v4 @theme tokens (Variant B — Soft / Organic)
├── lib/
│   ├── api.ts             # ★ Type-safe backend client (openapi-fetch wrapper)
│   ├── api-types.ts       # Generated from backend OpenAPI spec
│   ├── queryClient.ts     # ★ TanStack Query client + invalidateLedgerSurfaces()
│   ├── appContext.tsx     # <AppProvider> — upload-job machinery
│   ├── appCtx.ts          # AppCtx + useAppCtx (kept out of the provider file for Fast Refresh)
│   ├── tombstones.ts      # localStorage cache of deleted document IDs
│   ├── transactionsFilterState.ts  # Filter shape + URL/state helpers
│   ├── useDebouncedValue.ts        # Debounced value hook
│   └── utils.ts                    # cn() utility (clsx + tailwind-merge)
└── components/
    ├── Layout.tsx                   # Cream-paper shell + floating dock slot
    ├── FloatingDock.tsx             # Bottom pill nav: Books · Add · Review
    ├── Dashboard.tsx                # ★ "Books" — month spend, categories, recent
    ├── Transactions.tsx             # ★ "Ledger" — week-grouped + filters
    ├── TransactionsFilters.tsx      # Filter chips + fine-tune panel
    ├── TransactionRowMenu.tsx       # Per-row context menu (delete / unreconcile)
    ├── ReceiptDetail.tsx            # ★ Single receipt: image, fields, items, map, OCR
    ├── EditReceiptModal.tsx         # Inline edit form (payee / date / total / category)
    ├── DeleteReceiptDialog.tsx      # Delete-vs-tombstone decision flow
    ├── UnreconcileDialog.tsx        # Unreconcile guard for reconciled rows
    ├── ConfirmActionDialog.tsx      # Generic destructive-action confirm
    ├── DeletedBadge.tsx             # Small "deleted" indicator
    ├── Capture.tsx                  # ★ Full-screen camera + upload (fig.04)
    ├── ProcessingToast.tsx          # ★ Persistent batch-polling toast
    ├── useProcessingJobs.ts         # localStorage-backed in-flight batches
    ├── Batches.tsx                  # Upload batch history
    ├── BatchDetail.tsx              # Single batch + per-ingest status
    ├── BuildInfoPanel.tsx           # Frontend + backend build SHA + timestamps
    ├── MonthlyReview.tsx            # Monthly analysis (partial wiring)
    └── YearlyReview.tsx             # Yearly review (partial wiring)
```

Components marked ★ are connected to the backend API.

## Data Flow

### Viewing transactions

```
Transactions.tsx
  └── useInfiniteQuery(['transactions','list', queryArgs])
        └── fetchTransactionsPage(...) → GET /api/v1/transactions?...&cursor=...
              └── Vite proxy → localhost:3000
                    └── PostgreSQL → transactions + postings + documents
```

Loaded pages live in the TanStack Query cache (keyed by the filter/sort args); the bottom IntersectionObserver sentinel calls `fetchNextPage()`. `src/lib/api.ts` maps the backend `Transaction` shape to the compact UI `Transaction` row (payee → description, signed minor-unit amount → float, metadata-derived category → `Dining` / `Travel` / …). Currency is never stored as a float — minor units are kept intact until the render boundary.

Rows are real `<Link>`s (TanStack Router file-based routes), so clicking one navigates to `/receipt/:id` and tapping **Back** restores the exact scroll position — the list stays mounted and its pages rehydrate from cache. `ReceiptDetail` calls `fetchReceiptDetail(id)` → `GET /v1/transactions/:id`; the response's `ETag` is captured for future PATCH / DELETE / void calls.

### Capturing a receipt

```
FloatingDock (Add pill clicked) → navigate to /add route
  └── Capture.tsx mounts (full-bleed, outside _shell so no dock)
        └── navigator.mediaDevices.getUserMedia(env camera)
              ├── success → <video> shows live preview
              │     └── shutter pressed → canvas.drawImage(video) → toBlob → File
              │           └── ingestBatch([file])  # POST /api/v1/ingest/batch
              │                 └── { batchId, items: [{ ingestId, filename }] }
              │                       └── onComplete → addJob + invalidateLedgerSurfaces + back to Books
              └── denied / unsupported → shutter falls back to <input capture="environment">

AppProvider → useProcessingJobs (job list in localStorage, survives refresh)
  └── ProcessingToast
        └── polls GET /v1/batches/:id every 2–3 s
              ├── status 'extracted' / 'reconciled' → produce transactionId
              ├── any error → surface in toast
              └── on completion → invalidateLedgerSurfaces() refetches the
                    ledger / dashboard / batches queries in place
```

The backend pipeline is **single-call**: one `claude -p` invocation reads the image, reasons in plain text, and writes the extracted fields directly via a `psql` tool call. There is no quick-done / processing-full split anymore.

## API client

`src/lib/api.ts` exports the full v1 surface. Highlights:

```typescript
// Transactions — double-entry ledger primitives
listTransactions(filters)         // GET /v1/transactions
fetchReceiptDetail(id)            // GET /v1/transactions/:id → ReceiptView with ETag
createTransaction(input)          // POST /v1/transactions (Idempotency-Key required)
patchTransaction(id, patch, etag) // PATCH /v1/transactions/:id (If-Match, merge-patch+json)
voidTransaction(id, reason, etag) // POST /v1/transactions/:id/void (If-Match)
deleteTransaction(id, etag)       // DELETE /v1/transactions/:id (draft/error only)

// Ingest batches — multi-file uploads with live stream
ingestBatch(files, { autoReconcile })  // POST /v1/ingest/batch
getBatch(id)                      // GET /v1/batches/:id
subscribeToBatch(id, onEvent)     // EventSource on /v1/batches/:id/stream

// Documents — receipt images + other attachments
uploadDocument(file, kind)        // POST /v1/documents (sha256-idempotent)
documentContentUrl(docId)         // URL for <img src>

// Reports
getSummaryReport({ from, to, groupBy })
getTrendsReport({ from, to, period, groupBy })
getNetWorthReport({ asOf })
getCashflowReport({ from, to })

// Errors — RFC 7807
extractProblemMessage(err)        // pull a human-readable string out of a Problem Details payload
```

Backend errors come back as `application/problem+json` per RFC 7807 — every helper funnels them through `extractProblemMessage` so callers only deal with readable strings.

## Data fetching & state

All **server state** goes through **TanStack Query** (React Query v5). There is no bespoke fetch-in-`useEffect` data layer — that pattern was fully removed (it lost scroll position, dropped loaded pages on navigation, and triggered cascading refetches on every mutation). Conventions for new code:

- **Reads** — call a `src/lib/api.ts` helper as the `queryFn` of a `useQuery` / `useInfiniteQuery` in the component. Do **not** fetch in a `useEffect` and stash the result in `useState`. The shared `queryClient` singleton and its defaults (`staleTime 30s`, `gcTime 5m`, no refetch-on-focus) live in `src/lib/queryClient.ts`.
- **Query-key namespaces** — `['transactions', …]` (ledger list + dashboard recent), `['summary', …]`, `['batches', …]`, `['brandRollup', id]`, `['monthlyReview', …]`, `['products', klass, search]`, `['tombstones']`. Invalidate by **prefix** so arg-tails don't have to match.
- **Writes** — after any mutation (edit / void / delete / restore / re-extract) or a completed upload, call **`invalidateLedgerSurfaces()`** (`src/lib/queryClient.ts`). It invalidates `transactions` + `summary` + `batches` so every list/summary surface refetches in place. This replaced the old `refreshKey` / `bumpRefresh` whole-tree remount counter — screens now stay **mounted** (no `key={…}` remount).
- **Scroll restoration** — enabled via `createRouter({ scrollRestoration: true })` in `src/main.tsx`. It works precisely *because* screens stay mounted and cached pages rehydrate the list to full height synchronously on Back.
- **Lint** — `react-refresh/only-export-components` is disabled for `src/routes/**` (file-based route modules must `export const Route` alongside their component). The `useAppCtx` hook + context live in `src/lib/appCtx.ts` so `appContext.tsx` exports only its provider component. `npm run lint` must stay at **0 problems**.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19.0 |
| Build | Vite | 6.2 |
| Routing | TanStack Router (file-based) | 1.17 |
| Server state | TanStack Query (React Query) | 5.x |
| Styling | Tailwind CSS | 4.1 (v4, `@theme` tokens) |
| HTTP client | openapi-fetch | 0.17 |
| Types | openapi-typescript (dev) | 7.13 |
| Charts | Recharts | 2.12 (currently only on MonthlyReview / YearlyReview) |
| Animations | Motion | 12.23 |
| Maps | @vis.gl/react-google-maps | 1.8 |
| Image compression | browser-image-compression | 2.0 |
| HTTPS dev (dev) | @vitejs/plugin-basic-ssl | 2.1 |
| Language | TypeScript | 5.8 |

The codebase is **icon-free** by design — color blobs, words, and CSS-drawn primitives stand in for the role icons usually play. `lucide-react` is no longer a runtime dependency.

## Design System — Variant B (Soft / Organic)

Locked 2026-05-10 after a four-variant mockup bake-off (editorial / soft / brutalist / retro-receipt). Design rationale and full token reference live in [`DESIGN.md`](https://github.com/TINKPA/receipt-assistant/blob/main/DESIGN.md) (root of the parent project) §9.

A warm "financial diary" voice — magazine-grade typography over cream paper, terracotta as the lone accent, **floating pill dock** instead of a sidebar.

### Type

| Family | Role | Notes |
|---|---|---|
| **Lora** (variable, italic axis) | Display — page titles, totals, merchant names | Always italic in primary display contexts; non-italic medium for the focal word ("Your **May**") |
| **Plus Jakarta Sans** (300–700) | Body — labels, navigation, paragraphs | Warm geometric sans with `font-variant-numeric: tabular-nums` enabled globally on `.tnum` |
| **Caveat** (handwritten) | "Your" voice — greetings, week labels, hints | Used only for first-person / conversational moments. Never for transactional data |

### Tokens

| Token | Color | Role |
|---|---|---|
| `--color-paper` | `#FAF6EC` | Page background |
| `--color-paper-deep` | `#F1E9D8` | Sunken / progress track |
| `--color-surface` | `#FFFFFF` | Cards |
| `--color-ink` | `#2D2520` | Primary text — warm dark brown, **not** pure black |
| `--color-ink-muted` | `#8B7E72` | Secondary text |
| `--color-rule` | `rgba(45,37,32,0.08)` | Borders — near-invisible (per `DESIGN.md` §3.3) |
| `--color-terracotta` | `#C97B5C` | The single accent — CTAs, today, active dock pill, ✦ receipt marker |
| `--color-terracotta-deep` | `#B8654A` | Hover / pressed |
| `--color-sage` | `#8B9D72` | Rare — positive deltas |
| `--color-butter` | `#F5E6C3` | Atmospheric only — radial blobs in big cards |
| `--color-stamp` | `#8A2828` | Errors / destructive only |

### Geometry

- Radii: 18 card / 16 input / 999 pill / 28 viewfinder / 14 thumb. No hard right angles.
- Spacing: Tailwind's 4 px grid; favor generous whitespace (DESIGN.md §2.3 — "when in doubt, double the whitespace").
- Numbers everywhere: `font-variant-numeric: tabular-nums` (DESIGN.md §1).

### Breakpoints

Canonical Tailwind v4 defaults — no overrides in `src/index.css`:

| Prefix | Min-width | Typical device |
|--------|-----------|----------------|
| `sm`   | 640 px    | Large phones (landscape) |
| `md`   | 768 px    | Tablets (portrait) |
| `lg`   | 1024 px   | Small laptops, iPad Pro (landscape) |
| `xl`   | 1280 px   | Standard laptops |
| `2xl`  | 1536 px   | Large desktops |

The redesign is **mobile-first** — desktop is the scaled-up version of mobile, not a separate layout (DESIGN.md §4.4). The main column widens via `max-w-*` at breakpoints; the floating dock stays the same shape.

## Development

```bash
npm run dev       # HTTPS dev server on :5173 (self-signed cert)
npm run build     # Type-check + production build
npm run preview   # Preview production build locally
npm run lint      # ESLint (--max-warnings 0)
npm run api:types # Regenerate lib/api-types.ts from the backend OpenAPI spec
```

## Roadmap

- [ ] Wire Monthly Review to real spending data (trends + cashflow + summary endpoints already in `api.ts`)
- [ ] Wire Yearly Review to real spending data
- [ ] Manual-entry path inside Capture ("Type it in" is currently disabled with a `soon` hint)
- [ ] Settings tab back on the dock (currently reachable only via internal state)
- [ ] Dark theme — CSS tokens are prepared in `index.css` aliases but no surface uses it yet

## Related

- [receipt-assistant](https://github.com/TINKPA/receipt-assistant) — Backend: Express + Claude Code CLI + PostgreSQL double-entry ledger + Langfuse monitoring
- [receipt-assistant-macos](https://github.com/TINKPA/receipt-assistant-macos) — Native macOS client (SwiftUI + swift-openapi-generator)

## License

MIT

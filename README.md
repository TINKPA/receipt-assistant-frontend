# Receipt Assistant Frontend

React dashboard for the [Receipt Assistant](https://github.com/TINKPA/receipt-assistant) — an open-source, AI-native personal finance system that parses receipt images with Claude, tracks spending in PostgreSQL, and monitors every AI call through self-hosted Langfuse.

> **Part of a larger project**: This frontend connects to a backend that uses Claude Code CLI to extract structured data from receipt photos. Every extraction is traced and monitored. See the [backend repo](https://github.com/TINKPA/receipt-assistant) for the full picture.

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (this repo)                     :5173         │
│  React 19 + Vite + Tailwind CSS v4                      │
│                                                         │
│  Dashboard ──── spending charts, recent activity        │
│  Transactions ─ full history, confidence badges         │
│  Upload Modal ─ drop receipt → real-time AI parsing     │
│                                                         │
│  All API calls go through Vite proxy:                   │
│    /api/* ──────────────────────────────┐                │
└─────────────────────────────────────────┼────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────┐
│  Backend (receipt-assistant)              :3000          │
│  Express + Claude Code CLI + PostgreSQL                  │
│                                                         │
│  POST /receipt ─── upload image, async two-step parse   │
│  GET  /receipts ── list with filters                    │
│  GET  /summary ─── spending by category                 │
│  DELETE /receipt/:id                                    │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Make sure the backend is running (see backend repo)
# 2. Clone and start frontend
git clone https://github.com/TINKPA/receipt-assistant-frontend.git
cd receipt-assistant-frontend
npm install
npm run dev
# Open http://localhost:5173
```

The Vite dev server proxies `/api/*` to `localhost:3000` automatically. No env vars needed for local dev.

## Project Structure

```
src/
├── App.tsx                          # Tab routing + modal state
├── main.tsx                         # React entry point
├── types.ts                         # Transaction, Category, Metric types
├── constants.ts                     # Static data (fallback / demo mode)
├── index.css                        # Tailwind v4 theme tokens + custom effects
├── lib/
│   ├── api.ts                       # Backend API client (fetch + type mapping)
│   └── utils.ts                     # cn() utility (clsx + tailwind-merge)
└── components/
    ├── Layout.tsx                   # Shell: sidebar + topbar + content area
    ├── Sidebar.tsx                  # Navigation tabs + user info + "Add" button
    ├── TopBar.tsx                   # Search bar + notifications + user menu
    ├── Dashboard.tsx                # ★ Spending overview, charts, recent activity
    ├── Transactions.tsx             # ★ Full transaction table with live API data
    ├── AddTransactionModal.tsx      # ★ Receipt upload → job polling → progress UI
    ├── MonthlyReview.tsx            # Monthly analysis (static, planned for API)
    └── YearlyReview.tsx             # Yearly review (static, planned for API)
```

Components marked ★ are connected to the backend API. Others are still using static data.

## Data Flow

### Viewing Transactions

```
Transactions.tsx
  └── useEffect → fetchTransactions({ limit: 50 })
        └── GET /api/receipts
              └── Vite proxy → localhost:3000/receipts
                    └── PostgreSQL → receipts table
```

Backend returns `ReceiptData[]`, the API client maps it to frontend `Transaction[]`:

| Frontend field | Backend field | Mapping |
|----------------|---------------|---------|
| `description` | `merchant` | Direct |
| `amount` | `total` | Negated (expenses are negative) |
| `category` | `category` | food→Dining, transport→Transport, shopping→Shopping, etc. |
| `paymentMethod` | `payment_method` | Direct |
| `status` | `extraction_meta.quality.confidence_score` | <0.7 → Pending, ≥0.7 → Verified, missing → New Charge |

### Uploading a Receipt

```
AddTransactionModal.tsx
  └── user drops image file
        └── uploadReceipt(file) → POST /api/receipt (FormData)
              └── backend returns { jobId }
                    └── pollJob(jobId) every 2s
                          ├── status: "quick_done" → show merchant + total
                          ├── status: "processing_full" → show spinner
                          └── status: "done" → close modal, refresh list
```

The backend runs a two-step AI pipeline:
1. **Phase 1** (3-5s): Quick extraction — merchant, date, total
2. **Phase 2** (30-60s): Full extraction with OCR reasoning + JSON structuring + quality flags

## API Client

`src/lib/api.ts` exports:

```typescript
fetchTransactions(opts?)       // GET /api/receipts — list with filters
fetchTransaction(id)           // GET /api/receipt/:id — single receipt + items
uploadReceipt(file)            // POST /api/receipt — returns { jobId, receiptId }
pollJob(jobId)                 // GET /api/jobs/:id — poll parsing status
deleteTransaction(id)          // DELETE /api/receipt/:id
fetchSummary()                 // GET /api/summary — spending by category
```

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19.0 |
| Build | Vite | 6.2 |
| Styling | Tailwind CSS | 4.1 (v4, using `@theme` tokens) |
| Charts | Recharts | 2.12 |
| Icons | Lucide React | 0.546 |
| Animations | Framer Motion | 12.23 |
| Language | TypeScript | 5.8 |

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
```

## Roadmap

- [ ] Connect filters on Transactions page to API query params ([#4](https://github.com/TINKPA/receipt-assistant/issues/4))
- [ ] Wire Monthly Review to real spending data
- [ ] Wire Yearly Review to real spending data
- [ ] Receipt image preview in transaction detail view
- [ ] Delete transaction from UI (API exists, needs UI button)
- [ ] Search functionality in TopBar

## Related

- [receipt-assistant](https://github.com/TINKPA/receipt-assistant) — Backend: Express API + Claude Code CLI parsing + PostgreSQL + Langfuse monitoring
- [Project Proposal](https://github.com/TINKPA/receipt-assistant/blob/main/02_Drafts/writing/PROJECT_PROPOSAL.md) — Full vision document for the open-source project

## License

MIT

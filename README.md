# Receipt Assistant Frontend

A premium dark-themed React dashboard for personal finance tracking, connected to the [Receipt Assistant](https://github.com/TINKPA/receipt-assistant) backend for AI-powered receipt parsing.

## Features

- **Dashboard** — Total spending, category breakdown charts, recent activity feed
- **Transactions** — Full transaction history with status badges (Verified/Pending based on AI confidence score)
- **Receipt Upload** — Drag-and-drop receipt images, real-time parsing progress (Phase 1 quick result → Phase 2 full extraction)
- **Monthly & Yearly Review** — Spending trends, category comparisons, financial insights

## Quick Start

### Prerequisites

- Node.js 22+
- [Receipt Assistant backend](https://github.com/TINKPA/receipt-assistant) running on `:3000`

### Setup

```bash
git clone https://github.com/TINKPA/receipt-assistant-frontend.git
cd receipt-assistant-frontend
npm install
npm run dev
```

Open http://localhost:5173 — the Vite dev server proxies `/api/*` to the backend at `:3000`.

### Backend Connection

The app uses a Vite proxy to avoid CORS issues in development:

```
Browser → localhost:5173/api/receipts → Vite proxy → localhost:3000/receipts
```

No environment variables needed for local dev. For production, set `VITE_API_URL`.

## Pages

| Tab | Data Source | Description |
|-----|-------------|-------------|
| Dashboard | `GET /api/receipts`, `GET /api/summary` | Spending overview, pie/bar charts, recent activity |
| Transactions | `GET /api/receipts` | Full list with category badges and confidence-based status |
| Upload (modal) | `POST /api/receipt`, `GET /api/jobs/:id` | Receipt image upload with real-time job polling |
| Monthly Review | Static (planned) | Monthly spending analysis |
| Yearly Review | Static (planned) | Annual financial summary |

## API Client

All backend calls go through `src/lib/api.ts`:

```typescript
import { fetchTransactions, fetchSummary, uploadReceipt, pollJob, deleteTransaction } from '@/lib/api';

// List transactions with filters
const txs = await fetchTransactions({ from: '2026-03-01', category: 'food', limit: 20 });

// Upload a receipt image
const { jobId } = await uploadReceipt(file);
const status = await pollJob(jobId); // poll until status === 'done'
```

### Type Mapping

The frontend `Transaction` type maps from the backend `ReceiptData`:

| Frontend | Backend | Notes |
|----------|---------|-------|
| `description` | `merchant` | Store/restaurant name |
| `amount` | `-total` | Negative for expenses |
| `category` | `category` | Mapped: food→Dining, transport→Transport, etc. |
| `paymentMethod` | `payment_method` | credit_card, debit_card, etc. |
| `status` | derived from `extraction_meta.quality.confidence_score` | <0.7 → Pending, ≥0.7 → Verified |

## Tech Stack

- **React** 19 with TypeScript
- **Vite** 6 (dev server + build + proxy)
- **Tailwind CSS** v4 with custom dark theme (Material Design 3 color system)
- **Recharts** for charts (bar, pie)
- **Lucide React** for icons
- **Framer Motion** for animations

## Design System

Dark theme with glass-panel effects and neon accents:

- Primary (teal): `#4edea3` — positive metrics, growth
- Secondary (purple): `#d0bcff` — categories, accents
- Tertiary (cyan): `#7bd0ff` — alternate emphasis
- Error (coral): `#ffb4ab` — warnings, losses
- Fonts: Manrope (headlines), Inter (body)

## Development

```bash
npm run dev       # Start dev server with HMR
npm run build     # Type check + production build
npm run preview   # Preview production build
npm run lint      # ESLint
```

## Related

- [receipt-assistant](https://github.com/TINKPA/receipt-assistant) — Backend API + AI parsing + Langfuse monitoring

## License

MIT

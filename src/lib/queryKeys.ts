/**
 * Central TanStack Query key factory.
 *
 * Every `useQuery` / `useInfiniteQuery` / `invalidateQueries` key in the app is
 * built here — no inline `['...']` literals scattered across components. This
 * is the single source of truth that keeps reads and their invalidators in
 * agreement (a typo'd literal silently never invalidates).
 *
 * Convention: each namespace exposes `.all` (the bare prefix, for broad
 * invalidation — TanStack matches by prefix) plus specific builders for the
 * exact keys queries register under. Single-entity namespaces are a function
 * `(id) => ['name', id]` whose `[0]` doubles as the prefix.
 */
export const qk = {
  transactions: {
    all: ['transactions'] as const,
    list: (args: unknown) => ['transactions', 'list', args] as const,
    recent: (args: { limit: number; status?: string }) =>
      ['transactions', 'recent', args] as const,
  },
  tombstones: ['tombstones'] as const,
  summary: {
    all: ['summary'] as const,
    range: (args: { from: string; to: string }) => ['summary', args] as const,
  },
  batches: {
    all: ['batches'] as const,
    list: (args: { limit: number }) => ['batches', args] as const,
  },
  /** A single ingest batch — shared by BatchDetail and the upload-job poller
   *  (ProcessingCardList) so both collapse onto one cache entry per batch. */
  batch: (id: string) => ['batch', id] as const,
  receipt: (id: string) => ['receipt', id] as const,
  merchant: (id: string) => ['merchant', id] as const,
  place: (id: string) => ['place', id] as const,
  brands: ['brands'] as const,
  brand: (id: string) => ['brand', id] as const,
  brandRollup: (id: string) => ['brandRollup', id] as const,
  products: (klass: string, search: string) => ['products', klass, search] as const,
  product: (id: string) => ['product', id] as const,
  monthlyReview: (now: string, prev: string) => ['monthlyReview', now, prev] as const,
  yearlyReview: (now: string, prev: string) => ['yearlyReview', now, prev] as const,
  buildInfo: ['buildInfo'] as const,
} as const;

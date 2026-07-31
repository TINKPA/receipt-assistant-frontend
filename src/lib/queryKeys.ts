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
  /** Retryable failed uploads (#158/#141) — the only problem category a human
   *  can resolve. Shared by the Uploads needs-attention panel and the Home
   *  badge so both read one cache entry and a retry invalidates them together. */
  ingestProblems: ['ingestProblems'] as const,
  /** The non-retryable remainder, queried per group. Kept apart from the above
   *  because these outnumber the actionable rows ~100:1 (a shared paginated
   *  call buries them), and apart from each other because `limit` applies to
   *  the combined set and would make each group's count wrong. */
  ingestProblemsUnreadable: ['ingestProblems', 'unsupported'] as const,
  ingestProblemsDupes: ['ingestProblems', 'dupes'] as const,
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
  /** A bare catalog row, exactly what `getProduct(id)` resolves. Read by
   *  the consumer product page (/product/$productId). */
  product: (id: string) => ['product', id] as const,
  /** The admin catalog's detail pane, which resolves the product AND its
   *  owned instances into one `{ product, owned }` object. It needs its
   *  own key: TanStack matches keys structurally, so when both queries
   *  used `['product', id]` they shared ONE cache entry and (within the
   *  30s staleTime) each screen could be served the other's shape —
   *  the product page then rendered an empty <h1> off the wrapper. The
   *  `['product', id]` prefix is kept deliberately so a broad
   *  invalidation of one product still refreshes both entries. */
  productWithOwned: (id: string) => ['product', id, 'withOwned'] as const,
  monthlyReview: (now: string, prev: string) => ['monthlyReview', now, prev] as const,
  yearlyReview: (now: string, prev: string) => ['yearlyReview', now, prev] as const,
  /** Leaf accounts a transaction can post to — the manual-entry pickers
   *  (#150). Its own key because the shape is a filtered subset, not the
   *  raw `GET /v1/accounts` tree any other caller would want. */
  postableAccounts: ['accounts', 'postable'] as const,
  /** The Things grid's expanded owned-item list. */
  ownedItemsExpanded: ['owned-items', 'expanded'] as const,
  buildInfo: ['buildInfo'] as const,
} as const;

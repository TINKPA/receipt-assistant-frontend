/**
 * API client for ReceiptAssistant backend (v1 surface).
 * Uses Vite proxy: /api/* → localhost:3000/*
 *
 * Types are codegen'd from the backend's OpenAPI spec — see
 * src/lib/api-types.ts (regenerate with `npm run api:types`).
 * Do not hand-write request/response shapes here; derive from `paths`.
 *
 * The old `/receipts*` and `/jobs/*` endpoints were removed from the
 * backend. Everything now lives under `/v1/*`:
 *   - "Receipt" = Transaction + Document(s). A "receipt image" is a
 *     Document whose `kind=receipt_image`, linked to a Transaction via
 *     the ledger.
 *   - Upload-one-receipt UX is wired to `/v1/ingest/batch` with a
 *     single file. Poll `/v1/batches/{id}` for the produced
 *     transaction_ids / document_ids (SSE also available).
 *   - Summary uses `/v1/reports/summary?group_by=category`.
 *
 * Error format is RFC 7807 (application/problem+json). Use
 * `extractProblemMessage(err)` to pull a user-visible string.
 */
import imageCompression from 'browser-image-compression';
import createClient from 'openapi-fetch';
import type { components, paths } from '@/lib/api-types';
import type { Transaction } from '@/types';

const client = createClient<paths>({ baseUrl: '/api' });

// ── Backend type aliases (derived from the OpenAPI spec) ────────

export type BackendTransaction = components['schemas']['Transaction'];
export type BackendPosting = components['schemas']['Posting'];
export type BackendDocument = components['schemas']['Document'];
export type BackendBatch = components['schemas']['Batch'];
export type BackendBatchSummary = components['schemas']['BatchSummary'];
export type BackendIngest = components['schemas']['Ingest'];
export type BackendAccount = components['schemas']['Account'];
export type BackendAccountBalance = components['schemas']['AccountBalance'];
export type BackendAccountRegister = components['schemas']['AccountRegister'];
export type BackendSummaryReport = components['schemas']['SummaryReport'];
export type BackendSummaryItem = components['schemas']['SummaryItem'];
export type BackendTrendsReport = components['schemas']['TrendsReport'];
export type BackendNetWorthReport = components['schemas']['NetWorthReport'];
export type BackendCashflowReport = components['schemas']['CashflowReport'];
export type BackendProblemDetails = components['schemas']['ProblemDetails'];
export type NewPosting = components['schemas']['NewPosting'];
export type UpdateTransactionRequest = components['schemas']['UpdateTransactionRequest'];
export type CreateTransactionRequest = components['schemas']['CreateTransactionRequest'];
export type DocumentKind = components['schemas']['DocumentKind'];
export type BatchStatus = components['schemas']['BatchStatus'];
export type IngestStatus = components['schemas']['IngestStatus'];

/** An ETag-aware wrapper. Keep the ETag alongside the resource so PATCH
 *  / POST-void / DELETE calls can fill in `If-Match`. */
export interface WithETag<T> {
  data: T;
  etag: string | null;
}

/**
 * UI-facing "receipt view" — a transaction with its expense posting,
 * primary document, and pre-computed display-friendly fields.
 * This is the shape the ReceiptDetail screen consumes.
 */
export interface ReceiptView {
  id: string;
  status: BackendTransaction['status'];
  version: number;
  occurred_on: string;
  payee: string | null;
  narration: string | null;
  currency: string;
  total_minor: number;
  total: number;
  /** Category derived from the expense account's subtype / name. */
  category: string | null;
  paymentMethod: string | null;
  /** Primary document (receipt image) if any. */
  documentId: string | null;
  documentKind: string | null;
  documents: BackendTransaction['documents'];
  postings: BackendPosting[];
  etag: string | null;
}

// ── Frontend display mapping ────────────────────────────────────

const CATEGORY_MAP: Record<string, Transaction['category']> = {
  food: 'Dining',
  dining: 'Dining',
  restaurants: 'Dining',
  groceries: 'Shopping',
  transport: 'Transport',
  shopping: 'Shopping',
  utilities: 'Utilities',
  entertainment: 'Entertainment',
  health: 'Shopping',
  education: 'Shopping',
  travel: 'Travel',
  other: 'Fun',
};

const ICON_MAP: Record<string, string> = {
  Dining: 'restaurant',
  Transport: 'directions_car',
  Shopping: 'shopping_bag',
  Utilities: 'bolt',
  Entertainment: 'theaters',
  Travel: 'flight',
  Fun: 'celebration',
  Income: 'account_balance',
  Housing: 'home',
  Investments: 'trending_up',
  'Real Estate': 'real_estate_agent',
};

function normalizeCategoryKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.toLowerCase().trim().replace(/[\s_-]+/g, '_');
}

function categoryFromTxn(t: BackendTransaction): string | null {
  // The backend doesn't attach a direct "category" field — infer from
  // metadata first (extractor often stashes one under `category_hint`
  // or `category`), fall back to null.
  const md = t.metadata ?? {};
  const raw =
    (md as Record<string, unknown>).category ??
    (md as Record<string, unknown>).category_hint ??
    (md as Record<string, unknown>).expense_category ??
    null;
  return typeof raw === 'string' ? raw : null;
}

function primaryDocument(t: BackendTransaction): BackendTransaction['documents'][number] | null {
  if (!t.documents || t.documents.length === 0) return null;
  const img = t.documents.find((d) => d.kind === 'receipt_image');
  return img ?? t.documents[0];
}

/** Sum the absolute value of expense-side postings (positive minor). */
function totalMinorFromPostings(postings: BackendPosting[]): { minor: number; currency: string } {
  if (!postings || postings.length === 0) return { minor: 0, currency: 'USD' };
  // Expense postings are positive; pick the largest-magnitude positive
  // one as the "total" (matches a typical receipt that credits asset/
  // liability for -X and debits expense for +X).
  const positives = postings.filter((p) => p.amount_minor > 0);
  if (positives.length === 0) {
    // All-credit edge case — use absolute max.
    const magnitudes = postings.map((p) => Math.abs(p.amount_minor));
    const max = Math.max(...magnitudes);
    return { minor: max, currency: postings[0].currency };
  }
  const total = positives.reduce((s, p) => s + p.amount_minor, 0);
  return { minor: total, currency: positives[0].currency };
}

export function toReceiptView(t: BackendTransaction, etag: string | null = null): ReceiptView {
  const { minor, currency } = totalMinorFromPostings(t.postings);
  const doc = primaryDocument(t);
  const md = t.metadata ?? {};
  const paymentMethod =
    (typeof (md as Record<string, unknown>).payment_method === 'string'
      ? ((md as Record<string, unknown>).payment_method as string)
      : null) ?? null;
  return {
    id: t.id,
    status: t.status,
    version: t.version,
    occurred_on: t.occurred_on,
    payee: t.payee,
    narration: t.narration,
    currency,
    total_minor: minor,
    total: minor / 100,
    category: categoryFromTxn(t),
    paymentMethod,
    documentId: doc?.id ?? null,
    documentKind: doc?.kind ?? null,
    documents: t.documents,
    postings: t.postings,
    etag,
  };
}

/** Map a backend Transaction to the compact UI Transaction row. */
export function mapTransaction(t: BackendTransaction): Transaction {
  const rv = toReceiptView(t);
  const rawCat = normalizeCategoryKey(rv.category);
  const category: Transaction['category'] =
    (rawCat ? CATEGORY_MAP[rawCat] : undefined) ?? 'Fun';
  const status: Transaction['status'] =
    t.status === 'draft' || t.status === 'error' ? 'Pending'
    : t.status === 'voided' ? 'Pending'
    : t.status === 'reconciled' ? 'Verified'
    : 'New Charge';
  return {
    id: t.id,
    description: rv.payee ?? rv.narration ?? 'Unknown',
    category,
    date: rv.occurred_on,
    paymentMethod: rv.paymentMethod ?? 'Unknown',
    // UI convention: expenses render as negative.
    amount: -rv.total,
    status,
    icon: ICON_MAP[category] ?? 'receipt',
    color: 'primary',
  };
}

// ── Image compression ──────────────────────────────────────────

async function compressImage(file: File): Promise<File> {
  if (file.size <= 500 * 1024) return file;
  return imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 2048,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });
}

// ── Error helpers (RFC 7807) ───────────────────────────────────

/** Extract a human-visible message from a Problem Details payload
 *  (or any unknown error shape we get handed back). */
export function extractProblemMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.detail === 'string') return e.detail;
    if (typeof e.title === 'string') return e.title;
    if (typeof e.error === 'string') return e.error;
    if (Array.isArray(e.violations) && e.violations.length > 0) {
      return e.violations
        .map((v: unknown) =>
          typeof v === 'object' && v !== null && 'message' in v
            ? String((v as { message: unknown }).message)
            : JSON.stringify(v),
        )
        .join('; ');
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function unwrap<T>(label: string, data: T | undefined, error: unknown, status: number): T {
  if (error || data === undefined) {
    const msg = extractProblemMessage(error ?? { title: `HTTP ${status}` });
    const e = new Error(`${label} failed (${status}): ${msg}`);
    // Attach the original problem for callers that want to introspect.
    (e as Error & { problem?: unknown }).problem = error;
    throw e;
  }
  return data;
}

function etagFrom(response: Response): string | null {
  return response.headers.get('ETag') ?? response.headers.get('etag');
}

function genIdempotencyKey(): string {
  // crypto.randomUUID is available in all modern browsers and Node 19+.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback — should never hit in supported targets.
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Transactions ────────────────────────────────────────────────

export interface ListTransactionsFilters {
  occurred_from?: string;
  occurred_to?: string;
  amount_min_minor?: number;
  amount_max_minor?: number;
  account_id?: string;
  payee_contains?: string;
  q?: string;
  status?: BackendTransaction['status'];
  trip_id?: string;
  has_document?: boolean;
  source_ingest_id?: string;
  sort?: 'occurred_on' | 'amount' | 'created_at';
  order?: 'asc' | 'desc';
  cursor?: string;
  limit?: number;
}

export interface ListTransactionsResult {
  items: BackendTransaction[];
  nextCursor: string | null;
}

export async function listTransactions(
  filters: ListTransactionsFilters = {},
): Promise<ListTransactionsResult> {
  const { data, error, response } = await client.GET('/v1/transactions', {
    params: { query: filters },
  });
  const body = unwrap('listTransactions', data, error, response.status);
  return { items: body.items, nextCursor: body.next_cursor ?? null };
}

/** High-level helper used by Transactions/Dashboard screens: returns
 *  the UI-row shape directly. */
export async function fetchTransactions(opts?: {
  from?: string;
  to?: string;
  limit?: number;
  has_document?: boolean;
}): Promise<Transaction[]> {
  const { items } = await listTransactions({
    occurred_from: opts?.from,
    occurred_to: opts?.to,
    limit: opts?.limit,
    has_document: opts?.has_document,
    sort: 'occurred_on',
    order: 'desc',
  });
  return items.map(mapTransaction);
}

export async function getTransaction(id: string): Promise<WithETag<BackendTransaction>> {
  const { data, error, response } = await client.GET('/v1/transactions/{id}', {
    params: { path: { id } },
  });
  return {
    data: unwrap('getTransaction', data, error, response.status),
    etag: etagFrom(response),
  };
}

/** Convenience for UI consumers: fetch a transaction and map to the
 *  ReceiptView shape. */
export async function fetchReceiptDetail(id: string): Promise<ReceiptView> {
  const { data, etag } = await getTransaction(id);
  return toReceiptView(data, etag);
}

export async function createTransaction(input: {
  payee?: string;
  narration?: string;
  occurred_on: string;
  occurred_at?: string;
  postings: NewPosting[];
  document_ids?: string[];
  trip_id?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<BackendTransaction> {
  const key = input.idempotencyKey ?? genIdempotencyKey();
  const body: CreateTransactionRequest = {
    occurred_on: input.occurred_on,
    postings: input.postings,
    // Always include metadata — OpenAPI marks it with a default, which
    // openapi-typescript renders as required even though the server
    // accepts empty.
    metadata: input.metadata ?? {},
  };
  if (input.occurred_at) body.occurred_at = input.occurred_at;
  if (input.payee != null) body.payee = input.payee;
  if (input.narration != null) body.narration = input.narration;
  if (input.document_ids) body.document_ids = input.document_ids;
  if (input.trip_id) body.trip_id = input.trip_id;
  const { data, error, response } = await client.POST('/v1/transactions', {
    params: { header: { 'Idempotency-Key': key } },
    body,
  });
  return unwrap('createTransaction', data, error, response.status);
}

export async function patchTransaction(
  id: string,
  patch: UpdateTransactionRequest,
  etag: string,
): Promise<WithETag<BackendTransaction>> {
  const { data, error, response } = await client.PATCH('/v1/transactions/{id}', {
    params: {
      path: { id },
      header: { 'If-Match': etag },
    },
    body: patch,
    // The endpoint expects application/merge-patch+json, not json.
    bodySerializer: (b) => JSON.stringify(b),
    headers: { 'Content-Type': 'application/merge-patch+json' },
  });
  return {
    data: unwrap('patchTransaction', data, error, response.status),
    etag: etagFrom(response),
  };
}

export async function voidTransaction(
  id: string,
  reason: string,
  etag: string,
): Promise<BackendTransaction> {
  const { data, error, response } = await client.POST('/v1/transactions/{id}/void', {
    params: {
      path: { id },
      header: { 'If-Match': etag },
    },
    body: { reason },
  });
  return unwrap('voidTransaction', data, error, response.status);
}

export async function deleteTransaction(id: string, etag: string): Promise<void> {
  const { error, response } = await client.DELETE('/v1/transactions/{id}', {
    params: {
      path: { id },
      header: { 'If-Match': etag },
    },
  });
  if (error) throw new Error(`deleteTransaction failed (${response.status}): ${extractProblemMessage(error)}`);
}

// ── Documents ───────────────────────────────────────────────────

export async function uploadDocument(
  file: File,
  kind: DocumentKind = 'receipt_image',
): Promise<BackendDocument> {
  const compressed = file.type.startsWith('image/') ? await compressImage(file) : file;
  const form = new FormData();
  form.append('file', compressed);
  form.append('kind', kind);
  const { data, error, response } = await client.POST('/v1/documents', {
    body: form as unknown as { file: string; kind?: DocumentKind },
    bodySerializer: (b) => b as unknown as FormData,
  });
  return unwrap('uploadDocument', data, error, response.status);
}

export async function getDocument(id: string): Promise<WithETag<BackendDocument>> {
  const { data, error, response } = await client.GET('/v1/documents/{id}', {
    params: { path: { id } },
  });
  return {
    data: unwrap('getDocument', data, error, response.status),
    etag: etagFrom(response),
  };
}

/** URL for `<img src="…">` / direct download. Goes through the Vite
 *  proxy in dev; in prod the app assumes a reverse proxy fronts both
 *  /api and the static bundle. */
export function documentContentUrl(docId: string): string {
  return `/api/v1/documents/${docId}/content`;
}

export async function linkDocument(docId: string, transactionId: string): Promise<void> {
  const { error, response } = await client.POST('/v1/documents/{id}/links', {
    params: { path: { id: docId } },
    body: { transaction_id: transactionId },
  });
  if (error) throw new Error(`linkDocument failed (${response.status}): ${extractProblemMessage(error)}`);
}

export async function unlinkDocument(docId: string, transactionId: string): Promise<void> {
  const { error, response } = await client.DELETE('/v1/documents/{id}/links/{txn_id}', {
    params: { path: { id: docId, txn_id: transactionId } },
  });
  if (error) throw new Error(`unlinkDocument failed (${response.status}): ${extractProblemMessage(error)}`);
}

// ── Ingest batches ─────────────────────────────────────────────

export interface IngestBatchResult {
  batchId: string;
  status: BatchStatus;
  items: Array<{ ingestId: string; filename: string; mime_type: string | null }>;
  poll: string;
}

/** Upload N files as a single ingest batch. Server handles
 *  classification + extraction; poll the returned batchId (or subscribe
 *  via SSE) for progress. */
export async function ingestBatch(
  files: File[],
  opts: { autoReconcile?: boolean } = {},
): Promise<IngestBatchResult> {
  const form = new FormData();
  for (const f of files) {
    // Compress images but leave PDFs / emails untouched.
    const payload = f.type.startsWith('image/') ? await compressImage(f) : f;
    form.append('files', payload, f.name);
  }
  if (opts.autoReconcile != null) {
    form.append('auto_reconcile', opts.autoReconcile ? 'true' : 'false');
  }
  const { data, error, response } = await client.POST('/v1/ingest/batch', {
    body: form as unknown as { files: string[] },
    bodySerializer: (b) => b as unknown as FormData,
  });
  const body = unwrap('ingestBatch', data, error, response.status);
  return {
    batchId: body.batchId,
    status: body.status,
    items: body.items,
    poll: body.poll,
  };
}

export async function getBatch(batchId: string): Promise<BackendBatch> {
  const { data, error, response } = await client.GET('/v1/batches/{id}', {
    params: { path: { id: batchId } },
  });
  return unwrap('getBatch', data, error, response.status);
}

export async function listBatches(opts: {
  cursor?: string;
  limit?: number;
  status?: BatchStatus;
} = {}): Promise<{ items: BackendBatchSummary[]; nextCursor: string | null }> {
  const { data, error, response } = await client.GET('/v1/batches', {
    params: { query: opts },
  });
  const body = unwrap('listBatches', data, error, response.status);
  return { items: body.items, nextCursor: body.next_cursor ?? null };
}

export async function getIngest(id: string): Promise<BackendIngest> {
  const { data, error, response } = await client.GET('/v1/ingests/{id}', {
    params: { path: { id } },
  });
  return unwrap('getIngest', data, error, response.status);
}

/** Server-Sent Events subscription to a batch stream.
 *
 *  Emits `hello`, `job.started|done|error`, `batch.extracted`, and
 *  `reconcile.*` events. Caller should handle `'error'` (the native
 *  EventSource error name) for reconnect/UX. Closes automatically when
 *  the server sends its terminal frame.
 *
 *  Returns an AbortController — call `.abort()` to close the stream. */
export function subscribeToBatch(
  batchId: string,
  onEvent: (eventName: string, payload: unknown) => void,
  onError?: (err: Event) => void,
): AbortController {
  const controller = new AbortController();
  const url = `/api/v1/batches/${batchId}/stream`;
  const es = new EventSource(url);

  const named = [
    'hello',
    'job.started',
    'job.done',
    'job.error',
    'batch.extracted',
    'reconcile.started',
    'reconcile.done',
    'reconcile.error',
  ];
  for (const name of named) {
    es.addEventListener(name, (e) => {
      const me = e as MessageEvent;
      let payload: unknown = me.data;
      try {
        payload = JSON.parse(me.data);
      } catch {
        /* keep as string */
      }
      onEvent(name, payload);
    });
  }
  es.onmessage = (me) => {
    // Frames without an explicit `event:` line land here.
    let payload: unknown = me.data;
    try {
      payload = JSON.parse(me.data);
    } catch {
      /* keep as string */
    }
    onEvent('message', payload);
  };
  es.onerror = (e) => {
    onError?.(e);
  };

  controller.signal.addEventListener('abort', () => {
    es.close();
  });
  return controller;
}

// ── Reports ─────────────────────────────────────────────────────

export async function getSummaryReport(opts: {
  from?: string;
  to?: string;
  groupBy?: 'category' | 'account' | 'payee';
  currency?: string;
} = {}): Promise<BackendSummaryReport> {
  const { data, error, response } = await client.GET('/v1/reports/summary', {
    params: {
      query: {
        from: opts.from,
        to: opts.to,
        group_by: opts.groupBy,
        currency: opts.currency,
      },
    },
  });
  return unwrap('getSummaryReport', data, error, response.status);
}

export async function getTrendsReport(opts: {
  from?: string;
  to?: string;
  period?: 'month' | 'year';
  groupBy?: 'category' | 'total';
  currency?: string;
} = {}): Promise<BackendTrendsReport> {
  const { data, error, response } = await client.GET('/v1/reports/trends', {
    params: {
      query: {
        from: opts.from,
        to: opts.to,
        period: opts.period,
        group_by: opts.groupBy,
        currency: opts.currency,
      },
    },
  });
  return unwrap('getTrendsReport', data, error, response.status);
}

export async function getNetWorthReport(opts: {
  asOf?: string;
  currency?: string;
} = {}): Promise<BackendNetWorthReport> {
  const { data, error, response } = await client.GET('/v1/reports/net_worth', {
    params: { query: { as_of: opts.asOf, currency: opts.currency } },
  });
  return unwrap('getNetWorthReport', data, error, response.status);
}

export async function getCashflowReport(opts: {
  from?: string;
  to?: string;
  currency?: string;
} = {}): Promise<BackendCashflowReport> {
  const { data, error, response } = await client.GET('/v1/reports/cashflow', {
    params: {
      query: { from: opts.from, to: opts.to, currency: opts.currency },
    },
  });
  return unwrap('getCashflowReport', data, error, response.status);
}

// ── Accounts ────────────────────────────────────────────────────

export async function listAccounts(opts: {
  flat?: boolean;
  includeClosed?: boolean;
} = {}): Promise<BackendAccount[]> {
  const { data, error, response } = await client.GET('/v1/accounts', {
    params: {
      query: {
        flat: opts.flat,
        include_closed: opts.includeClosed,
      },
    },
  });
  return unwrap('listAccounts', data, error, response.status);
}

export async function getAccountBalance(
  id: string,
  opts: { asOf?: string; currency?: string; includeChildren?: boolean } = {},
): Promise<BackendAccountBalance> {
  const { data, error, response } = await client.GET('/v1/accounts/{id}/balance', {
    params: {
      path: { id },
      query: {
        as_of: opts.asOf,
        currency: opts.currency,
        include_children: opts.includeChildren,
      },
    },
  });
  return unwrap('getAccountBalance', data, error, response.status);
}

export async function getAccountRegister(
  id: string,
  opts: {
    from?: string;
    to?: string;
    includeVoided?: boolean;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<BackendAccountRegister> {
  const { data, error, response } = await client.GET('/v1/accounts/{id}/register', {
    params: {
      path: { id },
      query: {
        from: opts.from,
        to: opts.to,
        include_voided: opts.includeVoided,
        cursor: opts.cursor,
        limit: opts.limit,
      },
    },
  });
  return unwrap('getAccountRegister', data, error, response.status);
}

// ── Summary shim for the existing Dashboard ────────────────────
//
// Old `/summary` returned an array of `{ category, count, total_spent }`.
// The new `/v1/reports/summary?group_by=category` returns
// `{ items: [{ key, count, total_minor, ... }], grand_total_minor }`.
// Shape the old consumer expects `Number(s.total_spent)` / `s.category` /
// `s.count`, so we remap.

export interface LegacySummaryItem {
  category: string;
  count: number;
  total_spent: number;
}

export async function fetchSummary(opts: {
  from?: string;
  to?: string;
} = {}): Promise<LegacySummaryItem[]> {
  const rep = await getSummaryReport({
    from: opts.from,
    to: opts.to,
    groupBy: 'category',
  });
  return rep.items.map((it) => ({
    category: it.key || 'other',
    count: it.count,
    total_spent: it.total_minor / 100,
  }));
}
export type SpendingSummary = LegacySummaryItem;

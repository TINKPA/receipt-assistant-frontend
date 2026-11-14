/**
 * Transactions resource — the ledger's core read/write surface.
 *
 * Imports all shared types, the openapi-fetch `client`, error helpers, and
 * the display mappers from `./core`. Never imports a sibling resource
 * module. Note `BackendTransaction.documents/.place/.items` are nested in
 * the `Backend*` aliases in core, so this file imports those types from
 * `./core`, not from `./documents` / `./places`.
 */
import type { Transaction } from '@/types';
import type { components } from '@/lib/api-types';
import {
  client,
  unwrap,
  etagFrom,
  genIdempotencyKey,
  mapTransaction,
  toReceiptView,
} from './core';
import type {
  BackendTransaction,
  WithETag,
  ReceiptView,
  NewPosting,
  CreateTransactionRequest,
  UpdateTransactionRequest,
} from './core';

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
  /** flagged=near_dup → only #134 branch-4 flagged transactions. */
  flagged?: 'near_dup';
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
 *  the UI-row shape directly.
 *
 *  Default sort is `created_at desc` so freshly-uploaded receipts show
 *  up at the top regardless of their `occurred_on` date — matches the
 *  user's mental model after upload. Reports / monthly views should
 *  call `listTransactions` directly with `sort: 'occurred_on'`. */
export interface FetchTransactionsOpts {
  from?: string;
  to?: string;
  limit?: number;
  has_document?: boolean;
  // Extended filter surface used by the Transactions tab UI.
  q?: string;
  status?: BackendTransaction['status'];
  payee_contains?: string;
  amount_min_minor?: number;
  amount_max_minor?: number;
  sort?: 'occurred_on' | 'amount' | 'created_at';
  order?: 'asc' | 'desc';
  // Opaque cursor from a previous page's nextCursor — for infinite scroll.
  cursor?: string;
}

export async function fetchTransactions(opts?: FetchTransactionsOpts): Promise<Transaction[]> {
  const { items } = await fetchTransactionsPage(opts);
  return items;
}

/** Like `fetchTransactions` but also returns the pagination cursor, so
 *  callers can keep loading the next page (infinite scroll). */
export async function fetchTransactionsPage(
  opts?: FetchTransactionsOpts,
): Promise<{ items: Transaction[]; nextCursor: string | null }> {
  const { items, nextCursor } = await listTransactions({
    occurred_from: opts?.from,
    occurred_to: opts?.to,
    limit: opts?.limit,
    has_document: opts?.has_document,
    q: opts?.q,
    status: opts?.status,
    payee_contains: opts?.payee_contains,
    amount_min_minor: opts?.amount_min_minor,
    amount_max_minor: opts?.amount_max_minor,
    cursor: opts?.cursor,
    sort: opts?.sort ?? 'created_at',
    order: opts?.order ?? 'desc',
  });
  return { items: items.map(mapTransaction), nextCursor };
}

/**
 * One transaction with its ETag, always read from the server.
 *
 * `cache: 'no-store'` is deliberate. The ETag exists for `If-Match` on
 * writes, and on the wave-0 backend it is the transaction's `version`
 * alone, which does not move when a linked document is soft-deleted,
 * restored or unlinked. The browser's own revalidation (`If-None-Match`)
 * then gets 304 and hands back the body it stored: the receipt page kept
 * listing a deleted document as live after "refetching". A backend that
 * folds the documents into the tag closes that, but TanStack Query is
 * the cache for this resource either way; the HTTP cache underneath it
 * can only make a refetch lie. Treat the tag as opaque.
 */
export async function getTransaction(id: string): Promise<WithETag<BackendTransaction>> {
  const { data, error, response } = await client.GET('/v1/transactions/{id}', {
    params: { path: { id } },
    cache: 'no-store',
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
  status?: CreateTransactionRequest['status'];
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
    // Always include metadata on this POST — the create schema gives it
    // `default: {}`, which openapi-typescript renders as required even
    // though the server accepts an absent one. (Only the create bodies
    // are like this. On PATCH `metadata` is optional and merged; see
    // `patchTransaction`.)
    metadata: input.metadata ?? {},
  };
  if (input.status) body.status = input.status;
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

/**
 * JSON Merge Patch on a transaction (`If-Match` required).
 *
 * Send only what changes. `metadata` is OPTIONAL and the server MERGES
 * it into the stored object (`null` removes a key, absent keys are kept,
 * `{}` changes nothing), so leave it out unless a metadata key is being
 * edited. The server owns the provenance keys (`extraction`, `fx`,
 * `points`, `user_edited`, …) and answers 422 to a patch that would
 * change one; it sets `metadata.user_edited.<field>` itself when
 * `payee`, `occurred_on` or `occurred_at` is patched.
 */
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

/** Restore a soft-deleted transaction (clears deleted_at). #171 */
export async function restoreTransaction(
  id: string,
  etag: string,
): Promise<BackendTransaction> {
  const { data, error, response } = await client.POST('/v1/transactions/{id}/restore', {
    params: {
      path: { id },
      header: { 'If-Match': etag },
    },
  });
  return unwrap('restoreTransaction', data, error, response.status);
}

export async function deleteTransaction(id: string, etag: string): Promise<void> {
  const { error, response } = await client.DELETE('/v1/transactions/{id}', {
    params: {
      path: { id },
      header: { 'If-Match': etag },
    },
  });
  if (error) unwrap('deleteTransaction', undefined, error, response.status);
}

/** Force a hard (physical) delete of a transaction — postings +
 *  document_links cascade via FK. The default deleteTransaction is a
 *  reversible soft delete; this is irreversible. Reconciled is still
 *  rejected with 409; caller must `unreconcileTransaction` first. */
export async function hardDeleteTransaction(id: string, etag: string): Promise<void> {
  const { error, response } = await client.DELETE('/v1/transactions/{id}', {
    params: {
      path: { id },
      header: { 'If-Match': etag },
      query: { hard: 'true' },
    },
  });
  if (error) unwrap('hardDeleteTransaction', undefined, error, response.status);
}

/** Pure state flip `reconciled → posted`. Required before any hard
 *  delete on a reconciled row.
 *
 *  The flip bumps the transaction's version, so any ETag read before it
 *  is now stale. The response carries the new one: a caller that goes
 *  on to write (the delete an unreconcile was for) must send that, not
 *  the tag it held before. */
export async function unreconcileTransaction(
  id: string,
  reason: string | undefined,
  etag: string,
): Promise<WithETag<BackendTransaction>> {
  const { data, error, response } = await client.POST(
    '/v1/transactions/{id}/unreconcile',
    {
      params: {
        path: { id },
        header: { 'If-Match': etag },
      },
      body: reason ? { reason } : {},
    },
  );
  return {
    data: unwrap('unreconcileTransaction', data, error, response.status),
    etag: etagFrom(response),
  };
}

export type NewTransactionItem = components['schemas']['NewTransactionItem'];
export type AddTransactionItemsResponse =
  components['schemas']['AddTransactionItemsResponse'];

/**
 * Attach line items to an existing transaction (#183 Phase 2) — the only
 * write path into `transaction_items` that isn't the ingest agent's SQL.
 *
 * Rows created here are stamped `source='manual'` by the server with a
 * NULL `extraction_version`; don't send a `'manual'` sentinel yourself.
 * `effective_total_minor` (`line_total + tax + tip − discount`) is
 * server-computed — render it from the response, never recompute it here.
 *
 * Pass an explicit `line_no` on every item: it makes a retry idempotent
 * (a repeat 409s rather than appending the line twice), which matters
 * because manual entry over a flaky phone connection is exactly where a
 * double-post happens. Omitting it appends instead.
 *
 * Note the response nests the `TransactionItem` projection, which carries
 * no row `id`. To link an owned-item you need the id, so follow this with
 * `listTransactionItems` and join on `line_no`.
 */
export async function addTransactionItems(
  transactionId: string,
  items: NewTransactionItem[],
): Promise<AddTransactionItemsResponse> {
  const { data, error, response } = await client.POST('/v1/transactions/{id}/items', {
    params: { path: { id: transactionId } },
    body: { items },
  });
  return unwrap('addTransactionItems', data, error, response.status);
}

export type ListedTransactionItem = components['schemas']['ListedTransactionItem'];

/** Transaction items carrying their own row `id`.
 *
 *  `GET /v1/transactions/{id}` nests the `TransactionItem` projection, which
 *  has no `id` — so the owned-item join (`owned_item.transaction_item_id`)
 *  cannot be made from the receipt payload alone. `/v1/items` returns the
 *  `ListedTransactionItem` projection, which does carry `id`, and is the only
 *  source for it. Note it is a *partial* serialization (no `product_id`,
 *  `line_type`, `parent_line_no`, `tax_minor`, `effective_total_minor`): use
 *  it for the `line_no → id` join only, never as an item source. */
export async function listTransactionItems(opts: {
  transaction_id: string;
  limit?: number;
}): Promise<ListedTransactionItem[]> {
  const { data, error, response } = await client.GET('/v1/items', {
    params: {
      query: { transaction_id: opts.transaction_id, limit: opts.limit ?? 200 },
    },
  });
  return unwrap('listTransactionItems', data, error, response.status).items;
}

/** Resolve a #134 branch-4 near-dup review flag (v1: dismiss only). */
export async function dismissNearDupFlag(id: string): Promise<void> {
  const { data, error, response } = await client.POST(
    '/v1/transactions/{id}/near-dup-review',
    {
      params: { path: { id } },
      body: { action: 'dismiss' },
    },
  );
  unwrap('dismissNearDupFlag', data, error, response.status);
}

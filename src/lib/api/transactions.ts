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
import {
  client,
  unwrap,
  etagFrom,
  genIdempotencyKey,
  mapTransaction,
  toReceiptView,
  extractProblemMessage,
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
  if (error) {
    const e = new Error(
      `deleteTransaction failed (${response.status}): ${extractProblemMessage(error)}`,
    );
    (e as Error & { problem?: unknown }).problem = error;
    throw e;
  }
}

/** Force a hard delete of a posted/voided/draft/error transaction
 *  (postings + document_links cascade via FK). Reconciled is still
 *  rejected with 409; caller must `unreconcileTransaction` first. */
export async function hardDeleteTransaction(id: string, etag: string): Promise<void> {
  const { error, response } = await client.DELETE('/v1/transactions/{id}', {
    params: {
      path: { id },
      header: { 'If-Match': etag },
      query: { hard: 'true' },
    },
  });
  if (error) {
    const e = new Error(
      `hardDeleteTransaction failed (${response.status}): ${extractProblemMessage(error)}`,
    );
    (e as Error & { problem?: unknown }).problem = error;
    throw e;
  }
}

/** Pure state flip `reconciled → posted`. Required before any hard
 *  delete on a reconciled row. */
export async function unreconcileTransaction(
  id: string,
  reason: string | undefined,
  etag: string,
): Promise<BackendTransaction> {
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
  return unwrap('unreconcileTransaction', data, error, response.status);
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

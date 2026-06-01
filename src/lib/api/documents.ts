/**
 * Documents resource — upload, fetch, (soft/cascade/hard) delete, restore,
 * link/unlink, content URLs, and re-extract.
 *
 * Imports shared things from `./core` only.
 */
import type { components } from '@/lib/api-types';
import {
  client,
  unwrap,
  etagFrom,
  compressImage,
  extractProblemMessage,
} from './core';
import type {
  BackendDocument,
  WithETag,
  DocumentKind,
} from './core';

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

export async function getDocument(
  id: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<WithETag<BackendDocument>> {
  const { data, error, response } = await client.GET('/v1/documents/{id}', {
    params: {
      path: { id },
      query: opts.includeDeleted ? { include_deleted: 'true' } : undefined,
    },
  });
  return {
    data: unwrap('getDocument', data, error, response.status),
    etag: etagFrom(response),
  };
}

/** Soft-delete a document. Sets `deleted_at`. Hidden from default
 *  GETs and link creation. Reversible via `restoreDocument`. */
export async function softDeleteDocument(id: string): Promise<void> {
  const { error, response } = await client.DELETE('/v1/documents/{id}', {
    params: { path: { id } },
  });
  if (error) {
    const e = new Error(
      `softDeleteDocument failed (${response.status}): ${extractProblemMessage(error)}`,
    );
    (e as Error & { problem?: unknown }).problem = error;
    throw e;
  }
}

/** Cascade delete: also handles linked transactions (posted → voided
 *  mirror, draft/error → hard-deleted, voided → left alone). Reconciled
 *  links abort the whole op with 409 `errors/cascade-blocked-reconciled`.
 *  With `hard=true`, every linked txn is hard-deleted (postings cascade)
 *  and the document file is removed too. */
export async function cascadeDeleteDocument(
  id: string,
  opts: { hard?: boolean } = {},
): Promise<void> {
  const query: Record<string, 'true'> = { cascade: 'true' };
  if (opts.hard) query.hard = 'true';
  const { error, response } = await client.DELETE('/v1/documents/{id}', {
    params: { path: { id }, query },
  });
  if (error) {
    const e = new Error(
      `cascadeDeleteDocument failed (${response.status}): ${extractProblemMessage(error)}`,
    );
    (e as Error & { problem?: unknown }).problem = error;
    throw e;
  }
}

/** Hard-delete a document with no linked transactions (file + row gone).
 *  Returns 409 `errors/document-has-links` if links exist — caller should
 *  switch to `cascadeDeleteDocument`. */
export async function hardDeleteDocument(id: string): Promise<void> {
  const { error, response } = await client.DELETE('/v1/documents/{id}', {
    params: { path: { id }, query: { hard: 'true' } },
  });
  if (error) {
    const e = new Error(
      `hardDeleteDocument failed (${response.status}): ${extractProblemMessage(error)}`,
    );
    (e as Error & { problem?: unknown }).problem = error;
    throw e;
  }
}

/** Clear `deleted_at` on a soft-deleted document. */
export async function restoreDocument(id: string): Promise<BackendDocument> {
  const { data, error, response } = await client.POST(
    '/v1/documents/{id}/restore',
    { params: { path: { id } } },
  );
  return unwrap('restoreDocument', data, error, response.status);
}

/** URL for `<img src="…">` / direct download. Goes through the Vite
 *  proxy in dev; in prod the app assumes a reverse proxy fronts both
 *  /api and the static bundle. */
export function documentContentUrl(docId: string): string {
  return `/api/v1/documents/${docId}/content`;
}

/** URL for the decoded + sanitized HTML body of a receipt_email
 *  document (#122). Intended as the `src` of a sandboxed `<iframe>` in
 *  the "Original email" fold. Served with a strict CSP by the backend. */
export function documentRenderedUrl(docId: string): string {
  return `/api/v1/documents/${docId}/rendered`;
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

export type ReExtractDocumentResult =
  components['schemas']['ReExtractDocumentResponse'];

/**
 * Re-OCR a document and UPDATE the linked transaction in place (Phase
 * 4c / #91). Wall-time ~30-60s — callers should show a pending state.
 *
 * Layer-3 protections inherited from the backend:
 *  - HARD fields (status, void state, narration, trip_id) never touched
 *  - SOFT fields (payee, occurred_on, occurred_at) preserved if the user
 *    PATCHed them via `patchTransaction` (the `metadata.user_edited`
 *    flag is set automatically by that path)
 *
 * Errors surface as RFC 7807 problem+json:
 *  - 404 — document not found or soft-deleted
 *  - 422 — zero or >1 linked transactions, or document has no file_path
 */
export async function postReExtractDocument(
  id: string,
): Promise<ReExtractDocumentResult> {
  const { data, error, response } = await client.POST(
    '/v1/documents/{id}/re-extract',
    { params: { path: { id } } },
  );
  return unwrap('postReExtractDocument', data, error, response.status);
}

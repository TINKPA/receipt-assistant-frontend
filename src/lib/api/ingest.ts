/**
 * Ingest batches resource — multi-file upload, batch/ingest reads, and the
 * SSE batch-stream subscription.
 *
 * Imports shared things from `./core` only.
 */
import { client, unwrap, compressImage } from './core';
import type {
  BackendBatch,
  BackendBatchSummary,
  BackendIngest,
  BatchStatus,
} from './core';

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

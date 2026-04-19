/**
 * API client for ReceiptAssistant backend.
 * Uses Vite proxy: /api/* → localhost:3000/*
 *
 * Types are codegen'd from the backend's OpenAPI spec — see
 * src/lib/api-types.ts (regenerate with `npm run api:types`).
 * Do not hand-write request/response shapes here; derive from `paths`.
 */
import imageCompression from 'browser-image-compression';
import createClient from 'openapi-fetch';
import type { components, paths } from '@/lib/api-types';
import type { Transaction } from '@/types';

const client = createClient<paths>({ baseUrl: '/api' });

// ── Backend type aliases (derived from the OpenAPI spec) ────────

type BackendReceipt = components['schemas']['Receipt'];
type BackendReceiptWithItems = components['schemas']['ReceiptWithItems'];
type BackendSpendingSummary = components['schemas']['SpendingSummary'];

export type ReceiptDetail = BackendReceiptWithItems;
export type JobStatus = components['schemas']['JobStatusResponse'];
export type UploadResult = components['schemas']['JobUploadResponse'];
export type SpendingSummary = BackendSpendingSummary[number];

// ── Frontend display mapping (unchanged from before) ────────────

const CATEGORY_MAP: Record<string, Transaction['category']> = {
  food: 'Dining',
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

function mapReceipt(r: BackendReceipt): Transaction {
  if (r.status === 'processing') {
    return {
      id: r.id,
      description: 'Processing...',
      category: 'Fun',
      date: r.date,
      paymentMethod: 'Unknown',
      amount: 0,
      status: 'Processing',
      icon: 'hourglass_empty',
      color: 'tertiary',
    };
  }

  if (r.status === 'error') {
    return {
      id: r.id,
      description: r.merchant || 'Failed',
      category: 'Fun',
      date: r.date,
      paymentMethod: 'Unknown',
      amount: 0,
      status: 'Pending',
      icon: 'error',
      color: 'error',
    };
  }

  const category = CATEGORY_MAP[r.category ?? 'other'] ?? 'Fun';
  const confidence = r.extraction_meta?.quality?.confidence_score;
  const status: Transaction['status'] =
    confidence != null && confidence < 0.7 ? 'Pending'
    : confidence != null ? 'Verified'
    : 'New Charge';

  return {
    id: r.id,
    description: r.merchant,
    category,
    date: r.date,
    paymentMethod: r.payment_method ?? 'Unknown',
    amount: -(r.total ?? 0),
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

// ── API functions ───────────────────────────────────────────────

function unwrap<T>(label: string, data: T | undefined, error: unknown, status: number): T {
  if (error || data === undefined) {
    throw new Error(`${label} failed: ${status}${error ? ' — ' + JSON.stringify(error) : ''}`);
  }
  return data;
}

export async function fetchTransactions(opts?: {
  from?: string;
  to?: string;
  category?: string;
  limit?: number;
}): Promise<Transaction[]> {
  const { data, error, response } = await client.GET('/receipts', {
    params: { query: opts ?? {} },
  });
  return unwrap('fetchTransactions', data, error, response.status).map(mapReceipt);
}

export async function fetchTransaction(id: string): Promise<Transaction> {
  const { data, error, response } = await client.GET('/receipt/{id}', {
    params: { path: { id } },
  });
  return mapReceipt(unwrap('fetchTransaction', data, error, response.status));
}

export async function fetchReceiptDetail(id: string): Promise<ReceiptDetail> {
  const { data, error, response } = await client.GET('/receipt/{id}', {
    params: { path: { id } },
  });
  return unwrap('fetchReceiptDetail', data, error, response.status);
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error, response } = await client.DELETE('/receipt/{id}', {
    params: { path: { id } },
  });
  if (error) throw new Error(`Delete failed: ${response.status}`);
}

export async function uploadReceipt(file: File): Promise<UploadResult> {
  const compressed = await compressImage(file);
  // openapi-fetch handles multipart when body is FormData and bodySerializer is set.
  const form = new FormData();
  form.append('image', compressed);
  const { data, error, response } = await client.POST('/receipt', {
    body: form as unknown as { image: string },
    bodySerializer: (b) => b as unknown as FormData,
  });
  return unwrap('uploadReceipt', data, error, response.status);
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const { data, error, response } = await client.GET('/jobs/{id}', {
    params: { path: { id: jobId } },
  });
  return unwrap('pollJob', data, error, response.status);
}

export async function fetchSummary(): Promise<SpendingSummary[]> {
  const { data, error, response } = await client.GET('/summary', { params: { query: {} } });
  return unwrap('fetchSummary', data, error, response.status);
}

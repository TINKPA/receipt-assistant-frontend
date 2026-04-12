/**
 * API client for ReceiptAssistant backend.
 * Uses Vite proxy: /api/* → localhost:3000/*
 */
import imageCompression from 'browser-image-compression';
import type { Transaction } from '@/types';

const API = '/api';

// ── Backend → Frontend type mapping ─────────────────────────────

interface BackendReceipt {
  id: string;
  merchant: string;
  date: string;
  total: number;
  currency?: string;
  category?: string;
  payment_method?: string;
  tax?: number;
  tip?: number;
  notes?: string;
  image_path?: string;
  status?: string;
  extraction_meta?: {
    quality?: {
      confidence_score?: number;
      warnings?: string[];
    };
  };
  items?: { name: string; quantity?: number; unit_price?: number; total_price?: number }[];
}

export interface ReceiptDetail extends BackendReceipt {
  raw_text?: string;
  items: { name: string; quantity?: number; unit_price?: number; total_price?: number; category?: string }[];
  created_at?: string;
  updated_at?: string;
}

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
  // Processing receipts show as "Processing" status
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
  if (file.size <= 500 * 1024) return file; // skip if already small
  return imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 2048,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });
}

// ── API functions ───────────────────────────────────────────────

export async function fetchTransactions(opts?: {
  from?: string;
  to?: string;
  category?: string;
  limit?: number;
}): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (opts?.from) params.set('from', opts.from);
  if (opts?.to) params.set('to', opts.to);
  if (opts?.category) params.set('category', opts.category);
  if (opts?.limit) params.set('limit', String(opts.limit));

  const qs = params.toString();
  const res = await fetch(`${API}/receipts${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.status}`);
  const data: BackendReceipt[] = await res.json();
  return data.map(mapReceipt);
}

export async function fetchTransaction(id: string): Promise<Transaction> {
  const res = await fetch(`${API}/receipt/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch transaction: ${res.status}`);
  const data: BackendReceipt = await res.json();
  return mapReceipt(data);
}

export async function fetchReceiptDetail(id: string): Promise<ReceiptDetail> {
  const res = await fetch(`${API}/receipt/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch receipt: ${res.status}`);
  return res.json();
}

export async function deleteTransaction(id: string): Promise<void> {
  const res = await fetch(`${API}/receipt/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export interface UploadResult {
  jobId: string;
  receiptId: string;
  status: string;
}

export async function uploadReceipt(file: File): Promise<UploadResult> {
  const compressed = await compressImage(file);
  const form = new FormData();
  form.append('image', compressed);
  const res = await fetch(`${API}/receipt`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export interface JobStatus {
  jobId: string;
  receiptId: string;
  status: 'queued' | 'done' | 'error';
  error?: string;
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API}/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Job poll failed: ${res.status}`);
  return res.json();
}

export interface SpendingSummary {
  category: string;
  count: number;
  total_spent: number;
  avg_per_receipt: number;
}

export async function fetchSummary(): Promise<SpendingSummary[]> {
  const res = await fetch(`${API}/summary`);
  if (!res.ok) throw new Error(`Failed to fetch summary: ${res.status}`);
  return res.json();
}

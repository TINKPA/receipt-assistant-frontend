/**
 * localStorage-backed tracker for soft-deleted document IDs.
 *
 * Why this exists: the backend has no `GET /v1/documents` list endpoint
 * (only per-row `GET /v1/documents/{id}?include_deleted=true`), so the
 * UI has no way to enumerate the tombstones server-side. We snapshot
 * the IDs as the user soft-deletes them in this browser, then re-fetch
 * each on demand to render the "Recently Deleted" panel.
 *
 * Cap entries to keep storage bounded; FIFO eviction (oldest first).
 */

const KEY = 'receipt-assistant.deleted-document-ids';
const MAX = 200;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Quota exceeded / private mode — silently drop.
  }
}

export function listTombstones(): string[] {
  return read();
}

export function addTombstone(id: string): void {
  const current = read();
  const filtered = current.filter((x) => x !== id);
  filtered.push(id);
  if (filtered.length > MAX) filtered.splice(0, filtered.length - MAX);
  write(filtered);
}

export function removeTombstone(id: string): void {
  const current = read();
  const filtered = current.filter((x) => x !== id);
  if (filtered.length !== current.length) write(filtered);
}

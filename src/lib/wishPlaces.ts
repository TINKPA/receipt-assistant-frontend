/**
 * Place wishes: reading what a capture found, and arranging the list.
 *
 * `WishItem.capture` is an open object in the contract (the server writes
 * it, and its shape differs between a finished reading and a failed one),
 * so everything here narrows by hand and treats a missing key as absent.
 */
import type { WishItem } from './api/things';
import { formatMoney } from './money';

export interface WishReading {
  category: string | null;
  locality: string | null;
  address: string | null;
  nameLocal: string | null;
  highlights: string[];
  note: string | null;
  recommendedBy: string | null;
  sourceApp: string | null;
  sourceUrl: string | null;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

/** What the reading of a captured image found, or null when the wish was
 *  typed by hand, is still being read, or failed. */
export function wishReading(w: WishItem): WishReading | null {
  const r = w.capture?.reading;
  if (!r || typeof r !== 'object') return null;
  const rec = r as Record<string, unknown>;
  return {
    category: str(rec.category),
    locality: str(rec.locality),
    address: str(rec.address),
    nameLocal: str(rec.name_local),
    highlights: Array.isArray(rec.highlights)
      ? rec.highlights.map(str).filter((h): h is string => h !== null)
      : [],
    note: str(rec.note),
    recommendedBy: str(rec.recommended_by),
    sourceApp: str(rec.source_app),
    sourceUrl: str(rec.source_url),
  };
}

export const isReading = (w: WishItem): boolean => w.capture_status === 'reading';

/**
 * A failed capture nobody has dealt with yet. The server resolves one the
 * moment the person names it (or gives it a kind or a place):
 * `capture_status` becomes `done` with `capture.resolved_by: user`, so
 * `failed` alone says it still needs them.
 */
export const isFailed = (w: WishItem): boolean => w.capture_status === 'failed';

/** Why a capture failed, in words for the person who uploaded it. */
export function captureFailureMessage(w: WishItem): string {
  const code = str(w.capture?.error);
  if (code === 'nothing_to_save') return "Couldn't find a place or product in this image";
  if (code === 'interrupted') return 'Reading was interrupted';
  return "Couldn't read this image";
}

/** `sushi_restaurant` → `Sushi restaurant`. */
export function humanizePlaceType(t: string | null | undefined): string | null {
  const s = str(t);
  if (!s) return null;
  const words = s.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const CJK = /[぀-ヿ㐀-鿿가-힯豈-﫿]/;
const LATIN = /[A-Za-z]/;

/**
 * The reading's category as a label: sentence case like the place types
 * (`restaurant` → `Restaurant`), and in one language. A reading of a
 * Chinese or Japanese image often gives the category twice, `日料 /
 * Japanese sashimi restaurant` or `粤菜 (Cantonese restaurant)`; the half
 * in the title's script is kept, so an English title gets the English one.
 */
export function categoryLabel(category: string, title: string): string {
  let label = category.trim();
  const halves =
    /^(.+?)\s*[/／]\s*(.+)$/.exec(label) ?? /^(.+?)\s*[(（]\s*(.+?)\s*[)）]$/.exec(label);
  if (halves) {
    const [a, b] = [halves[1].trim(), halves[2].trim()];
    const aCjk = CJK.test(a) && !LATIN.test(a);
    const bCjk = CJK.test(b) && !LATIN.test(b);
    if (aCjk !== bCjk) {
      const wantCjk = CJK.test(title);
      label = aCjk === wantCjk ? a : b;
    }
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function wishCategory(w: WishItem): string | null {
  const read = wishReading(w)?.category;
  if (read) return categoryLabel(read, w.title);
  return humanizePlaceType(w.place?.primary_type);
}

/**
 * What the place search starts from: the name, then whatever of the area
 * the name does not already say. `Sushi Gen (Little Tokyo)` in `Little
 * Tokyo, Los Angeles` searches `Sushi Gen (Little Tokyo) Los Angeles`.
 */
export function placeSearchPrefill(name: string, area: string | null): string {
  const n = name.trim();
  if (!area) return n;
  const lower = n.toLowerCase();
  const rest = area
    .split(/[,，·]/)
    .map((part) => part.trim())
    .filter((part) => part !== '' && !lower.includes(part.toLowerCase()));
  return [n, ...rest].filter(Boolean).join(' ');
}

/** A second name to show beside the title (the Chinese name of a place
 *  titled in English, say), or null when there is none or it repeats it. */
export function wishAltName(w: WishItem): string | null {
  const alt = str(w.place?.name_zh) ?? wishReading(w)?.nameLocal ?? null;
  if (!alt) return null;
  return alt.toLowerCase() === w.title.trim().toLowerCase() ? null : alt;
}

export const UNPLACED_AREA = 'Somewhere';

/** The area a place wish is filed under: the matched place's
 *  neighbourhood, else its city, else where the reading said it was. */
export function wishArea(w: WishItem): string {
  return (
    str(w.place?.neighborhood) ??
    str(w.place?.locality) ??
    wishReading(w)?.locality ??
    UNPLACED_AREA
  );
}

export interface WishAreaGroup {
  area: string;
  wishes: WishItem[];
}

/** Group by area: biggest group first, ties by name, `Somewhere` last.
 *  Inside a group the server's order (newest first) is kept. */
export function groupWishesByArea(wishes: WishItem[]): WishAreaGroup[] {
  const groups = new Map<string, WishItem[]>();
  for (const w of wishes) {
    const area = wishArea(w);
    const list = groups.get(area);
    if (list) list.push(w);
    else groups.set(area, [w]);
  }
  return [...groups.entries()]
    .map(([area, list]) => ({ area, wishes: list }))
    .sort((a, b) => {
      if (a.area === UNPLACED_AREA) return 1;
      if (b.area === UNPLACED_AREA) return -1;
      return b.wishes.length - a.wishes.length || a.area.localeCompare(b.area);
    });
}

/**
 * The sentence to show for a failed wish request.
 *
 * `extractProblemMessage` returns the wrapper's `"<fn> failed (422):
 * Request failed validation"`; the part a person can act on ("The file is
 * not a JPEG, PNG, WebP or GIF image") is in `violations[0].message` of the
 * problem document the wrapper attached.
 */
export function wishProblemMessage(err: unknown): string {
  const problem =
    err && typeof err === 'object' ? (err as { problem?: unknown }).problem : undefined;
  if (problem && typeof problem === 'object') {
    const body = problem as Record<string, unknown>;
    if (Array.isArray(body.violations)) {
      const first: unknown = body.violations[0];
      if (first && typeof first === 'object') {
        const message = str((first as Record<string, unknown>).message);
        if (message) return message;
      }
    }
    const detail = str(body.detail) ?? str(body.title);
    if (detail) return detail;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Query key for a wish list; every wish query starts with `wish-items`,
 *  so invalidating that prefix refreshes lists and detail pages alike. */
export const wishListKey = (kind: WishItem['kind'], status: WishItem['status']) =>
  ['wish-items', 'list', { kind, status }] as const;
export const wishDetailKey = (id: string) => ['wish-items', 'detail', id] as const;

const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

/** `2026-11-20` → `Nov 20, 2026`: a calendar date, read as written. */
function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', DAY);
}

/** An instant, as the viewer's calendar day. */
const fmtInstantDay = (iso: string): string => new Date(iso).toLocaleDateString('en-US', DAY);

/**
 * How a converted wish was closed.
 *
 * `receipt`: a purchase at the place (or of the product) was booked after
 * the wish was made, and that transaction closed it; `transactionId` is
 * the receipt page to link. `user`: the person said so ("Been there",
 * "Convert to purchase"). A wish converted before the server recorded who
 * did it reads as the person's, dated by `converted_at` when there is one.
 */
export type WishClosure =
  | {
      by: 'receipt';
      date: string;
      payee: string | null;
      amount: string;
      transactionId: string;
    }
  | { by: 'user'; date: string | null };

export function wishClosure(w: WishItem): WishClosure | null {
  if (w.status !== 'converted') return null;
  const tx = w.converted_transaction;
  if (w.converted_by === 'receipt' && tx) {
    return {
      by: 'receipt',
      date: fmtDay(tx.occurred_on),
      payee: str(tx.payee),
      amount: formatMoney(tx.total_minor, tx.currency),
      transactionId: tx.id,
    };
  }
  return { by: 'user', date: w.converted_at ? fmtInstantDay(w.converted_at) : null };
}

/**
 * API client core — shared foundation for the per-resource modules.
 *
 * Holds the openapi-fetch `client`, the `Backend*` type aliases derived
 * from the OpenAPI spec, RFC 7807 error helpers, image compression, and
 * the frontend display mappers (`toReceiptView`, `mapTransaction`, …).
 *
 * Resource modules (transactions, documents, ingest, …) import everything
 * they share from here. They never import each other — all common helpers,
 * types, and mappers live in this file to avoid import cycles.
 *
 * Types are codegen'd from the backend's OpenAPI spec — see
 * src/lib/api-types.ts (regenerate with `npm run api:types`).
 * Do not hand-write request/response shapes here; derive from `paths`.
 *
 * Error format is RFC 7807 (application/problem+json). Use
 * `extractProblemMessage(err)` to pull a user-visible string.
 */
import imageCompression from 'browser-image-compression';
import createClient from 'openapi-fetch';
import type { components, paths } from '@/lib/api-types';
import type { Category, Transaction } from '@/types';
import { CATEGORIES } from '@/types';

export const client = createClient<paths>({ baseUrl: '/api' });

export interface BuildInfo {
  service: string;
  version: string;
  gitSha: string;
  gitShortSha: string;
  gitBranch: string;
  builtAt: string;
}

// ── Backend type aliases (derived from the OpenAPI spec) ────────

export type BackendTransaction = components['schemas']['Transaction'];
export type BackendPosting = components['schemas']['Posting'];
export type BackendPlace = components['schemas']['Place'];
export type BackendDocument = components['schemas']['Document'];
export type BackendTransactionItem = components['schemas']['TransactionItem'];
export type BackendProduct = components['schemas']['Product'];
export type BackendOwnedItem = components['schemas']['OwnedItem'];
export type BackendBrand = components['schemas']['Brand'];
export type BackendBrandAsset = components['schemas']['BrandAsset'];
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
/** Why an upload didn't become a transaction, in the shape a client can
 *  switch on. Drive affordances off this, never off the `error` string. */
export type IngestCategory = components['schemas']['IngestCategory'];

export async function fetchBackendBuildInfo(): Promise<BuildInfo> {
  const response = await fetch('/api/version');
  if (!response.ok) {
    throw new Error(`fetchBackendBuildInfo failed (${response.status})`);
  }
  return response.json() as Promise<BuildInfo>;
}

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
  /** Workspace base currency — the unit `total_minor` / `total` are in,
   *  and the only unit it is valid to sum across transactions (#184). */
  currency: string;
  total_minor: number;
  total: number;
  /** The receipt's own total, in its own currency, when it differs from
   *  the base currency. Null otherwise. Display only — never summed. */
  originalTotalMinor: number | null;
  originalCurrency: string | null;
  /** Rate applied (original → base) and the publication date it came
   *  from, for the disclosure line under a converted amount. */
  fxRate: number | null;
  fxAsOfActual: string | null;
  /** Category derived from the expense account's subtype / name. */
  category: string | null;
  paymentMethod: string | null;
  /** Primary document (receipt image) if any. */
  documentId: string | null;
  documentKind: string | null;
  documents: BackendTransaction['documents'];
  postings: BackendPosting[];
  /** Google Places entry for the merchant location, if geocoded. */
  place: BackendPlace | null;
  /** Canonical merchant brand id (kebab-case). Drives ReceiptDetail's
   *  merchant-name link → BrandPage (one brand across all stores). */
  merchantBrandId: string | null;
  /** Specific merchant UUID. Drives ReceiptDetail's location card
   *  link → MerchantDetail (one physical store, all visits there).
   *  Null when the row's `merchant_id` FK isn't populated. */
  merchantId: string | null;
  /** Line items lifted from transaction_items (#81). Empty array
   *  for transactions without extracted lines. */
  items: BackendTransactionItem[];
  /** The transaction's own `metadata` blob, verbatim. This is where the
   *  extractor stashes everything that has no column of its own —
   *  `raw_text`, the legacy `items` JSON, the `extraction` provenance
   *  block, `category_hint`, `ocr_audit`, and per-merchant oddments. It
   *  is carried through untouched (and untyped beyond `unknown` values)
   *  because the key set is open-ended by design: readers pick out the
   *  keys they know and ignore the rest. Postings and documents do NOT
   *  carry a metadata blob — this transaction-level one is the only
   *  source, so screens wanting extractor output must read it here. */
  metadata: Record<string, unknown>;
  etag: string | null;
}

// ── Frontend display mapping ────────────────────────────────────

export interface CategoryClassification {
  category: Transaction['category'];
  transactionType: Transaction['transactionType'];
}

/** Classify a backend category string into our 7-category model.
 *
 *  Post-cleanup, the backend writes canonical 7-class names exclusively
 *  to `metadata.merchant.category` (mandated by the extractor prompt and
 *  guaranteed for legacy rows by migration 0008). The summary endpoint
 *  groups by expense account name, which is also canonical (#68 / 0007).
 *  So this function only has to recognize the 7 canonical strings.
 *
 *  Unknown input returns `{category: null, transactionType: 'spending'}`.
 *  Callers MUST NOT render `transactionType` as a category label; the UI
 *  shows "no category" instead. */
export function classifyBackendCategory(raw: string | null | undefined): CategoryClassification {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if ((CATEGORIES as readonly string[]).includes(trimmed)) {
      return { category: trimmed as Category, transactionType: 'spending' };
    }
  }
  return { category: null, transactionType: 'spending' };
}

function categoryFromTxn(t: BackendTransaction): string | null {
  // Phase 2.5 merchant block. Required by the extractor prompt; legacy
  // rows backfilled by drizzle/0008. Anything else is genuinely missing
  // (e.g. an income transaction with no merchant context) and surfaces
  // as the uncategorized fallback in the UI.
  const md = t.metadata ?? {};
  const m = (md as Record<string, unknown>).merchant;
  if (m && typeof m === 'object') {
    const cat = (m as Record<string, unknown>).category;
    if (typeof cat === 'string') return cat;
  }
  return null;
}

/** Pull the merchant block for a transaction. Prefers the top-level
 *  `merchant` field (#79 Phase C — joined from `merchants` so the row
 *  carries `custom_name`, the brand-level Layer-3 override). Falls back
 *  to the extractor's `metadata.merchant` block (Phase 2.5) for legacy
 *  rows whose `merchant_id` FK isn't populated yet. Returns null when
 *  neither source exposes a brand_id. */
function merchantFromTxn(
  t: BackendTransaction,
): { id: string | null; brand_id: string; canonical_name: string; custom_name: string | null } | null {
  const joined = (t as Record<string, unknown>).merchant;
  if (joined && typeof joined === 'object') {
    const rec = joined as Record<string, unknown>;
    const brandId = typeof rec.brand_id === 'string' ? rec.brand_id : null;
    if (brandId) {
      const canonical = typeof rec.canonical_name === 'string' ? rec.canonical_name : null;
      const custom = typeof rec.custom_name === 'string' ? rec.custom_name : null;
      const id = typeof rec.id === 'string' ? rec.id : null;
      return {
        id,
        brand_id: brandId,
        canonical_name: canonical ?? brandId,
        custom_name: custom,
      };
    }
  }
  // Legacy fallback: extractor's metadata.merchant block (Phase 2.5).
  // Lacks the `id` (UUID) since that's only known after the FK is
  // populated; consumers must handle `merchantId === null`.
  const md = t.metadata ?? {};
  const m = (md as Record<string, unknown>).merchant;
  if (!m || typeof m !== 'object') return null;
  const rec = m as Record<string, unknown>;
  const brandId = typeof rec.brand_id === 'string' ? rec.brand_id : null;
  const canonical = typeof rec.canonical_name === 'string' ? rec.canonical_name : null;
  if (!brandId) return null;
  return {
    id: null,
    brand_id: brandId,
    canonical_name: canonical ?? brandId,
    custom_name: null,
  };
}

// Match any CJK Unified Ideograph block, including extensions and
// the small punctuation/symbols that legitimately appear inside a
// store name (e.g. "·", "・", "（…）" parentheses around a branch
// label that the picker still needs to step over).
const CJK_RUN_RE =
  /[㐀-䶿一-鿿豈-﫿\u{20000}-\u{2FFFF}]+/gu;

/**
 * Return the longest contiguous CJK substring in `s`, or null when
 * `s` has no CJK at all. Used to defend the Chinese-name subtitle
 * against (a) Google returning mixed strings like
 * "Wing Hop Fung(永合豐)Monterey Park Store" under a zh locale,
 * and (b) Latin-only strings stored as display_name_zh because
 * Google tagged a pure Latin name with locale="zh".
 */
export function pickCjk(s: string | null | undefined): string | null {
  if (!s) return null;
  const runs = s.match(CJK_RUN_RE);
  if (!runs || runs.length === 0) return null;
  return runs.reduce((a, b) => (b.length > a.length ? b : a));
}

/**
 * Pick the single best display name for a place, given an ordered
 * list of languages the user reads. One name only — list views
 * don't show alternates, this is the *primary* identity for the row.
 *
 * Ordered rules:
 *   1. Custom override (user typed it) — always wins.
 *   2. For each lang in `userLangs`, in order:
 *        - if lang === "zh" and the place has a native CJK name,
 *          return its CJK substring (longest contiguous run).
 *        - if lang === "en" and the place has an English name,
 *          return it.
 *   3. Whatever Chinese name exists, even if marked non-native
 *      (gloss like 好市多). Better than nothing if zh is in langs.
 *   4. Google's English string as a last resort.
 *   5. `fallback` (typically the receipt's payee from OCR).
 *
 * Note on `formatted_address`: Google's `formatted_address` is by
 * design a pure street address, never a business name. It is
 * deliberately NOT in the cascade — showing "1757 W Carson St" as
 * the row title misleads the user into thinking that *is* the
 * merchant name. When no business name resolves, fall back to the
 * receipt's OCR-extracted payee (which at least came from the
 * receipt itself), and only then to the literal "Unknown".
 *
 * `userLangs` is currently hard-coded to ["zh","en"] at the
 * call site, but the function takes it as a parameter so a
 * per-user setting can be wired in without changing this logic.
 */
export function displayName(
  place:
    | {
        custom_name?: string | null;
        /** @deprecated Use `custom_name`. Read as a fallback for one
         *  release while the backend dual-emits both keys. */
        custom_name_zh?: string | null;
        display_name_zh?: string | null;
        display_name_zh_is_native?: boolean | null;
        display_name_en?: string | null;
        formatted_address?: string | null;
      }
    | null
    | undefined,
  fallbackOrMerchant:
    | string
    | null
    | { custom_name?: string | null; canonical_name?: string | null }
    | undefined,
  fallbackOrLangs?: string | null | readonly ('zh' | 'en')[],
  userLangsArg: readonly ('zh' | 'en')[] = ['zh', 'en'],
): string {
  // Backward-compat: original signature was (place, fallback, userLangs).
  // Phase C of #79 adds an optional merchant arg ahead of fallback for
  // brand-level overrides.
  //
  // Disambiguate on BOTH arg positions, not just the second. Keying only on
  // "is arg2 an object" silently mis-read the modern form whenever the
  // transaction had no merchant row: arg2 is then `null`, which is falsy, so
  // the legacy branch ran, took `null` as the fallback, and discarded the
  // payee sitting in arg3 — every merchant-less transaction rendered as
  // "Unknown" in list surfaces while its detail page showed the payee fine.
  // A string in arg3 can only ever be the modern `fallback` (the legacy form
  // puts a `userLangs` array there), so it disambiguates the null-merchant
  // case on its own.
  let merchant:
    | { custom_name?: string | null; canonical_name?: string | null }
    | null
    | undefined;
  let fallback: string | null;
  const arg2IsMerchant =
    !!fallbackOrMerchant &&
    typeof fallbackOrMerchant === 'object' &&
    !Array.isArray(fallbackOrMerchant);
  const arg3IsFallback = typeof fallbackOrLangs === 'string';
  // Independent of the disambiguation below: the languages only ever come
  // from arg3 (legacy call form) or the defaulted arg4, never from arg2.
  const userLangs: readonly ('zh' | 'en')[] = Array.isArray(fallbackOrLangs)
    ? fallbackOrLangs
    : userLangsArg;
  if (arg2IsMerchant || arg3IsFallback) {
    merchant = arg2IsMerchant
      ? (fallbackOrMerchant as { custom_name?: string | null; canonical_name?: string | null })
      : null;
    fallback = arg3IsFallback ? (fallbackOrLangs as string) : null;
  } else {
    merchant = null;
    fallback = typeof fallbackOrMerchant === 'string' ? fallbackOrMerchant : null;
  }

  // Layer-3 cascade per #79: per-place override → brand-level override
  // → derived (Google/OCR) → fallback.
  if (place?.custom_name) return place.custom_name;
  // Backward-compat fallback while the deprecated alias is still
  // emitted by the backend (#79 transition window).
  if (place?.custom_name_zh) return place.custom_name_zh;
  if (merchant?.custom_name) return merchant.custom_name;
  for (const lang of userLangs) {
    if (lang === 'zh') {
      const zh =
        place?.display_name_zh_is_native === true
          ? pickCjk(place.display_name_zh)
          : null;
      if (zh) return zh;
    } else if (lang === 'en') {
      const en = place?.display_name_en;
      // Skip pure-address fallbacks from Google geocode (e.g.
      // "1635 S San Gabriel Blvd") — they're not really names.
      // A "name" must contain at least one letter and NOT start
      // with a digit-then-space pattern.
      if (en && !/^\d+\s/.test(en)) return en;
    }
  }
  // No native CJK and no usable English. Try whatever zh we have
  // even if marked gloss — better than showing an address.
  if (userLangs.includes('zh')) {
    const anyZh = pickCjk(place?.display_name_zh);
    if (anyZh) return anyZh;
  }
  // Final fallback: the receipt's own payee string (OCR-extracted
  // from the receipt itself), then the literal "Unknown".
  //
  // Deliberately NOT falling back to `place.display_name_en` again
  // (it was already given its chance at step 2 with the address-
  // shape filter) nor to `place.formatted_address` (a pure street
  // address by design). Reintroducing either here just smuggles
  // the "1757 W Carson St" output back into a row title.
  return fallback ?? 'Unknown';
}

/**
 * Parse a "City, ST" subtitle out of a Google `formatted_address`
 * (e.g. "1757 W Carson St, Torrance, CA 90501, USA" → "Torrance, CA").
 *
 * Indexed from the *end* of the comma-split so address lines with
 * extra components (suites, building names) still find the city /
 * state-zip pair. US-only — for non-US places, falls back to the
 * second-to-last component (typically a region/prefecture name),
 * which is good enough for an Apple-Wallet-style row subtitle.
 *
 * Returns null when there's no place, no formatted_address, or the
 * address is too short to parse — caller decides the next fallback.
 */
export function formatPlaceCity(
  place:
    | { formatted_address?: string | null; country_code?: string | null }
    | null
    | undefined,
): string | null {
  const addr = place?.formatted_address?.trim();
  if (!addr) return null;
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  if (place?.country_code === 'US' && parts.length >= 4) {
    const city = parts[parts.length - 3];
    const stateZip = parts[parts.length - 2];
    const state = stateZip.split(/\s+/)[0];
    if (city && state) return `${city}, ${state}`;
  }
  return parts[parts.length - 2] || null;
}

function primaryDocument(t: BackendTransaction): BackendTransaction['documents'][number] | null {
  if (!t.documents || t.documents.length === 0) return null;
  const img = t.documents.find((d) => d.kind === 'receipt_image');
  return img ?? t.documents[0];
}

/**
 * The transaction's total, in BOTH the workspace base currency (what the
 * app does arithmetic on) and the currency printed on the receipt (what
 * the app shows next to it). #184.
 *
 * `amount_base_minor` is the field to sum. The backend converts every
 * foreign-currency posting at the receipt's own date and persists the
 * result there, so base amounts across different currencies and different
 * months are directly addable. `amount_minor` is the receipt's own number
 * and must never enter a sum — this used to be the field the whole UI
 * read, which is why a ¥13,948.80 receipt contributed $13,948.80 to the
 * monthly total.
 *
 * `original` is null whenever there is nothing to disclose: the receipt
 * was already in the base currency, so base and original are the same
 * number and showing it twice is noise.
 */
interface PostingsTotal {
  /** Base-currency minor units. Safe to add across transactions. */
  minor: number;
  /** The base currency the `minor` figure is expressed in. */
  currency: string;
  /** As printed on the receipt, when that differs from the base. */
  original: { minor: number; currency: string } | null;
  /** Rate actually applied, for the disclosure line. */
  fxRate: number | null;
}

function totalMinorFromPostings(
  postings: BackendPosting[],
  baseCurrency: string,
): PostingsTotal {
  const none: PostingsTotal = { minor: 0, currency: baseCurrency, original: null, fxRate: null };
  if (!postings || postings.length === 0) return none;

  // Expense postings are positive; the total is the positive side
  // (matches a typical receipt that credits asset/liability for -X and
  // debits expense for +X). Fall back to the absolute max on the
  // all-credit edge case.
  //
  // `amount_base_minor` is nullable in the schema (the app fills it
  // before commit), so fall back to `amount_minor` when it is missing —
  // a same-currency posting has them equal anyway, and a foreign one
  // that somehow got here unconverted is better shown at face value than
  // as zero.
  const base = (p: BackendPosting): number => p.amount_base_minor ?? p.amount_minor;
  const positives = postings.filter((p) => base(p) > 0);
  const chosen = positives.length > 0 ? positives : null;

  const minor = chosen
    ? chosen.reduce((s, p) => s + base(p), 0)
    : Math.max(...postings.map((p) => Math.abs(base(p))));

  // A posting carries the currency it was *recorded* in, so the base
  // currency has to come from outside it (caller resolves it — see
  // `fxFromMetadata`). `fx_rate` being set is the signal that a
  // conversion happened and there is an original worth disclosing.
  const leg = (chosen ?? postings)[0];

  if (leg.fx_rate == null) {
    return { minor, currency: leg.currency, original: null, fxRate: null };
  }
  const originalMinor = chosen
    ? chosen.reduce((s, p) => s + p.amount_minor, 0)
    : Math.max(...postings.map((p) => Math.abs(p.amount_minor)));
  return {
    minor,
    currency: baseCurrency,
    original: { minor: originalMinor, currency: leg.currency },
    fxRate: Number(leg.fx_rate),
  };
}

/**
 * Workspace base currency, as recorded by the backend's FX pass (#184).
 *
 * `metadata.fx` is written whenever a transaction actually needed
 * conversion, and it names the base currency it converted *into* — which
 * is exactly the case where the frontend can't infer it from the posting.
 * Everything else is already in the base currency, so the posting's own
 * currency is the right answer and this fallback never fires for them.
 */
const DEFAULT_BASE_CURRENCY = 'USD';

interface FxProvenance {
  baseCurrency: string;
  rate: number | null;
  asOfActual: string | null;
}

function fxFromMetadata(md: Record<string, unknown>): FxProvenance | null {
  const fx = md.fx;
  if (!fx || typeof fx !== 'object') return null;
  const rec = fx as Record<string, unknown>;
  const rates = Array.isArray(rec.rates) ? (rec.rates as Record<string, unknown>[]) : [];
  const first = rates[0];
  return {
    baseCurrency:
      typeof rec.base_currency === 'string' ? rec.base_currency : DEFAULT_BASE_CURRENCY,
    rate: typeof first?.rate === 'number' ? first.rate : null,
    asOfActual: typeof first?.as_of_actual === 'string' ? first.as_of_actual : null,
  };
}

export function toReceiptView(t: BackendTransaction, etag: string | null = null): ReceiptView {
  const md = (t.metadata ?? {}) as Record<string, unknown>;
  const fx = fxFromMetadata(md);
  const { minor, currency, original, fxRate } = totalMinorFromPostings(
    t.postings,
    fx?.baseCurrency ?? DEFAULT_BASE_CURRENCY,
  );
  const doc = primaryDocument(t);
  const merchant = merchantFromTxn(t);
  const paymentMethod = typeof md.payment_method === 'string' ? md.payment_method : null;
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
    // #184 — what the receipt itself says, when that differs from the
    // base-currency figure above. Null for same-currency receipts.
    originalTotalMinor: original?.minor ?? null,
    originalCurrency: original?.currency ?? null,
    fxRate: fxRate ?? fx?.rate ?? null,
    fxAsOfActual: fx?.asOfActual ?? null,
    category: categoryFromTxn(t),
    paymentMethod,
    documentId: doc?.id ?? null,
    documentKind: doc?.kind ?? null,
    documents: t.documents,
    postings: t.postings,
    place: t.place ?? null,
    merchantBrandId: merchant?.brand_id ?? null,
    merchantId: merchant?.id ?? null,
    items: t.items ?? [],
    metadata: md,
    etag,
  };
}

/** Map a backend Transaction to the compact UI Transaction row. */
export function mapTransaction(t: BackendTransaction): Transaction {
  const rv = toReceiptView(t);
  const classification = classifyBackendCategory(rv.category);
  const m = merchantFromTxn(t);
  // Single-name policy (see receipt-assistant-frontend#?): list
  // rows show ONE name, picked by displayName(). No subtitle, no
  // pinyin alongside. The cascade is: place.custom_name →
  // merchant.custom_name (#79 Phase C) → native CJK → English →
  // glossed CJK → address → receipt payee.
  return {
    id: t.id,
    description: displayName(t.place, m, rv.payee ?? rv.narration ?? null),
    placeCity: formatPlaceCity(t.place),
    category: classification.category,
    transactionType: classification.transactionType,
    date: rv.occurred_on,
    paymentMethod: rv.paymentMethod ?? null,
    // UI convention: expenses render as negative; income stays positive.
    // Always the BASE-currency figure — this is what every total, group
    // subtotal and rollup in the app sums (#184).
    amount: classification.transactionType === 'income' ? rv.total : -rv.total,
    currency: rv.currency,
    originalTotalMinor: rv.originalTotalMinor,
    originalCurrency: rv.originalCurrency,
    fxRate: rv.fxRate,
    fxAsOfActual: rv.fxAsOfActual,
    rawStatus: t.status,
    documentId: rv.documentId,
    documentKind: rv.documentKind,
    merchantBrandId: m?.brand_id ?? null,
    merchantId: m?.id ?? null,
  };
}

// ── Image compression ──────────────────────────────────────────
//
// Exported so the document / ingest resource modules can compress
// uploads before POSTing. It was module-private in the monolithic
// api.ts; the split forces it across a module boundary, so it's
// exported from core here (every resource module imports shared
// helpers from `./core` only — never from each other).
export async function compressImage(file: File): Promise<File> {
  if (file.size <= 500 * 1024) return file;
  return imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 2048,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });
}

// ── Error helpers (RFC 7807) ───────────────────────────────────

/** Known backend problem types — extend as the backend adds more.
 *  Code consuming `parseProblem` should switch on `.type` so unknown
 *  values fall through to a generic error path. */
export type ProblemErrorType =
  | 'errors/cascade-blocked-reconciled'
  | 'errors/cannot-delete-reconciled'
  | 'errors/document-has-links'
  | 'errors/precondition-failed'
  | (string & {});

export interface ParsedProblem {
  type?: ProblemErrorType;
  title?: string;
  detail?: string;
  status?: number;
  /** Any non-canonical fields the server attached
   *  (e.g. `reconciled_transaction_ids`, `link_count`). */
  extensions: Record<string, unknown>;
}

/** Parse an error thrown by the api wrappers into a typed problem-details
 *  shape. The thrown Error already carries `.problem` (see `unwrap`); this
 *  walks that body and the canonical RFC 7807 fields. */
export function parseProblem(err: unknown): ParsedProblem {
  const empty: ParsedProblem = { extensions: {} };
  if (!err || typeof err !== 'object') return empty;
  const candidate =
    (err as { problem?: unknown }).problem ?? err;
  if (!candidate || typeof candidate !== 'object') return empty;
  const body = candidate as Record<string, unknown>;
  const out: ParsedProblem = { extensions: {} };
  if (typeof body.type === 'string') out.type = body.type as ProblemErrorType;
  if (typeof body.title === 'string') out.title = body.title;
  if (typeof body.detail === 'string') out.detail = body.detail;
  if (typeof body.status === 'number') out.status = body.status;
  for (const [k, v] of Object.entries(body)) {
    if (k === 'type' || k === 'title' || k === 'detail' || k === 'status') continue;
    out.extensions[k] = v;
  }
  return out;
}

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

export function unwrap<T>(label: string, data: T | undefined, error: unknown, status: number): T {
  if (error || data === undefined) {
    const msg = extractProblemMessage(error ?? { title: `HTTP ${status}` });
    const e = new Error(`${label} failed (${status}): ${msg}`);
    // Attach the original problem for callers that want to introspect.
    (e as Error & { problem?: unknown }).problem = error;
    throw e;
  }
  return data;
}

export function etagFrom(response: Response): string | null {
  return response.headers.get('ETag') ?? response.headers.get('etag');
}

export function genIdempotencyKey(): string {
  // crypto.randomUUID is available in all modern browsers and Node 19+.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback — should never hit in supported targets.
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Accounts ────────────────────────────────────────────────────
//
// Account read endpoints. These have no dedicated resource module in the
// split layout, and they depend only on `client` / `unwrap` / the
// BackendAccount* aliases above, so they live in core to preserve the
// exported surface without introducing a new module.

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
    includeDeleted?: boolean;
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
        include_deleted: opts.includeDeleted,
        cursor: opts.cursor,
        limit: opts.limit,
      },
    },
  });
  return unwrap('getAccountRegister', data, error, response.status);
}

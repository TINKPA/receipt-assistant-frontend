/**
 * Manual purchase entry (#150) — the call chain that records a purchase
 * with no receipt, and the small pure helpers the form needs.
 *
 * This is the one place the ordering lives, because the ordering is not
 * obvious and getting it wrong degrades silently rather than erroring:
 *
 *   1. `POST /v1/transactions`          head + the two balanced postings
 *   2. `POST /v1/products`              catalog row (durables only)
 *   3. `POST /v1/transactions/:id/items` the line, linked to the product
 *   4. `GET  /v1/items`                 resolve the line's row id
 *   5. `POST /v1/owned-items`           the Things shelf entry
 *   6. `POST /v1/products/:id/recompute` refresh catalog aggregates
 *
 * Step 4 exists because step 3's response nests the `TransactionItem`
 * projection, which has no `id`; `/v1/items` returns the only projection
 * that carries one, so the id is recovered by joining on `line_no`.
 *
 * Step 5 must carry that id. `paid_minor` — the numerator of the $/day
 * on the Things grid — is derived by the backend from
 * `COALESCE(ti.effective_total_minor, ti.line_total_minor)` over a LEFT
 * JOIN on `owned_items.transaction_item_id`. An owned item created with
 * only a `product_id` therefore shows "—" for $/day permanently, which
 * is precisely the outcome #183 was filed to prevent. There is no
 * `acquisition_cost_minor` field to fall back on; the join is the price.
 *
 * Everything here composes the thin wrappers in `lib/api/` — no `fetch`.
 */
import {
  createTransaction,
  addTransactionItems,
  listTransactionItems,
  createProduct,
  recomputeProduct,
  type NewTransactionItem,
} from './api';
import { createOwnedItem } from './api/things';

export type ItemClass = 'durable' | 'consumable' | 'food_drink' | 'service' | 'other';

/** The single line a manual entry may carry. One line, not a repeatable
 *  grid: the motivating case is backfilling one durable good, and a
 *  full line-item editor is a different (much larger) feature. */
export interface ManualEntryItem {
  name: string;
  lineTotalMinor: number;
  taxMinor: number | null;
  /** Drives product + owned-item creation, and forces `item_class`
   *  to `durable`. This checkbox is what puts the purchase in Things. */
  durable: boolean;
}

export interface ManualEntryInput {
  occurredOn: string;
  payee: string;
  totalMinor: number;
  expenseAccountId: string;
  paymentAccountId: string;
  /** Name of the chosen expense account, used only to pick a sensible
   *  `item_class` for non-durables. */
  expenseAccountName?: string;
  item?: ManualEntryItem;
}

export interface ManualEntryResult {
  transactionId: string;
  productId: string | null;
  /** True when `POST /v1/products` matched an existing row (200) rather
   *  than inserting one (201). Both are success. */
  productAlreadyExisted: boolean;
  transactionItemId: string | null;
  ownedItemId: string | null;
  /** Server-computed `line_total + tax + tip − discount`. Read from the
   *  response; never recomputed client-side. */
  effectiveTotalMinor: number | null;
}

/**
 * Thrown when the chain fails part-way. Carries what *did* get written so
 * the UI can tell the user "the transaction exists, the line item didn't"
 * and link to it — rather than implying the whole thing was rolled back,
 * which it was not (these are separate requests, not one transaction).
 */
export class ManualEntryError extends Error {
  readonly partial: Partial<ManualEntryResult>;
  readonly step: string;
  constructor(step: string, cause: unknown, partial: Partial<ManualEntryResult>) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'ManualEntryError';
    this.step = step;
    this.partial = partial;
    this.cause = cause;
  }
}

/** The line number every manual entry's single item uses. Explicit
 *  (rather than append-by-omission) so a retry after a dropped response
 *  409s instead of writing the line a second time. */
const LINE_NO = 1;

/**
 * `item_class` for a line the user did NOT mark durable.
 *
 * The form deliberately has no class picker — the mockup's one checkbox
 * is the whole taxonomy question a person can answer without thinking
 * about the schema. For everything else the expense account is the best
 * signal available, and the value only affects a glyph and catalog
 * filtering for non-durables, so a wrong guess here is cosmetic.
 */
export function defaultItemClass(expenseAccountName?: string): ItemClass {
  switch (expenseAccountName) {
    case 'Food & Drinks':
      return 'food_drink';
    case 'Services':
      return 'service';
    case 'Shopping':
      return 'consumable';
    default:
      return 'other';
  }
}

/**
 * Stable catalog key from a product name — the field
 * `(workspace_id, merchant_id, product_key)` is unique on, and therefore
 * what makes a repeat create idempotent rather than a duplicate.
 */
export function toProductKey(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || 'item';
}

/**
 * Parse a typed money string into minor units.
 *
 * Accepts what a person actually types on a phone — `$208.04`, `1,299`,
 * ` 45.5 ` — and rejects anything else rather than coercing it, because
 * `Number('12abc')` is NaN but `Number('')` is 0 and a silent zero-dollar
 * transaction is worse than an error message. Returns null on junk.
 */
export function parseMoneyToMinor(raw: string): number | null {
  const s = raw.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // Round rather than truncate: 208.04 * 100 is 20803.999… in binary
  // floating point, and truncation would book $208.03.
  return Math.round(n * 100);
}

/** Records the purchase. See the module comment for why the order matters. */
export async function submitManualEntry(
  input: ManualEntryInput,
): Promise<ManualEntryResult> {
  const result: ManualEntryResult = {
    transactionId: '',
    productId: null,
    productAlreadyExisted: false,
    transactionItemId: null,
    ownedItemId: null,
    effectiveTotalMinor: null,
  };

  // 1 — head + postings. Expense is debited (+), the funding account is
  // credited (−); the two must sum to zero or the ledger's deferred
  // balance trigger rejects the write.
  let transactionId: string;
  try {
    const txn = await createTransaction({
      occurred_on: input.occurredOn,
      payee: input.payee,
      status: 'posted',
      postings: [
        { account_id: input.expenseAccountId, amount_minor: input.totalMinor },
        { account_id: input.paymentAccountId, amount_minor: -input.totalMinor },
      ],
      // `transactions` has no `source` column (only `transaction_items`
      // and `products` got one in #183 Phase 3), so metadata is the only
      // channel for head-level provenance. The "read the column, don't
      // string-match metadata" rule applies to items and products, where
      // a real column exists to read.
      metadata: { source: 'manual' },
    });
    transactionId = txn.id;
    result.transactionId = txn.id;
  } catch (err) {
    throw new ManualEntryError('transaction', err, result);
  }

  const item = input.item;
  if (!item) return result;

  // 2 — catalog row, durables only. A non-durable line doesn't need a
  // product: nothing downstream (Things, $/day, catalog aggregates)
  // consumes one, so creating it would just grow the catalog with rows
  // no screen reads.
  let productId: string | null = null;
  if (item.durable) {
    try {
      const { product, created } = await createProduct({
        product_key: toProductKey(item.name),
        canonical_name: item.name,
        item_class: 'durable',
        // Empty, not `{source:'manual'}` — the server stamps a real
        // `source` column and #183 Phase 3 says read that, not a metadata
        // sentinel. Sent explicitly because OpenAPI's `default: {}` comes
        // through openapi-typescript as required (same as createTransaction).
        metadata: {},
      });
      productId = product.id;
      result.productId = product.id;
      result.productAlreadyExisted = !created;
    } catch (err) {
      throw new ManualEntryError('product', err, result);
    }
  }

  // 3 — the line itself.
  const line: NewTransactionItem = {
    line_no: LINE_NO,
    raw_name: item.name,
    line_total_minor: item.lineTotalMinor,
    item_class: item.durable ? 'durable' : defaultItemClass(input.expenseAccountName),
    line_type: 'product',
    quantity: 1,
    unit_price_minor: item.lineTotalMinor,
    confidence: 'high',
    // See the createProduct call above — `default: {}` renders as required.
    metadata: {},
  };
  if (item.taxMinor != null) line.tax_minor = item.taxMinor;
  if (productId) line.product_id = productId;

  try {
    const added = await addTransactionItems(transactionId, [line]);
    result.effectiveTotalMinor = added.items[0]?.effective_total_minor ?? null;
  } catch (err) {
    throw new ManualEntryError('items', err, result);
  }

  if (!productId) return result;

  // 4 — recover the line's row id (the add response has no `id`).
  try {
    const rows = await listTransactionItems({ transaction_id: transactionId });
    result.transactionItemId = rows.find((r) => r.line_no === LINE_NO)?.id ?? null;
  } catch (err) {
    throw new ManualEntryError('resolve-item-id', err, result);
  }

  // 5 — the Things shelf entry. `transaction_item_id` is what gives it a
  // price, and `acquired_on` the elapsed days; without both the $/day is
  // "—". Backfilled purchases use the purchase date, which is the whole
  // point of the feature: a 2021 router should amortize over 2021→today.
  try {
    const owned = await createOwnedItem({
      product_id: productId,
      ...(result.transactionItemId
        ? { transaction_item_id: result.transactionItemId }
        : {}),
      acquired_on: input.occurredOn,
    });
    result.ownedItemId = owned.id;
  } catch (err) {
    throw new ManualEntryError('owned-item', err, result);
  }

  // 6 — catalog aggregates (`purchase_count`, `total_spent_minor`).
  // Deliberately not fatal: the purchase, the line, and the shelf entry
  // are all already written, and a stale count is a cosmetic problem on
  // one screen. Failing the whole submit here would tell the user their
  // entry didn't work when it did.
  try {
    await recomputeProduct(productId);
  } catch {
    /* aggregates refresh on the next recompute; nothing user-visible is wrong */
  }

  return result;
}

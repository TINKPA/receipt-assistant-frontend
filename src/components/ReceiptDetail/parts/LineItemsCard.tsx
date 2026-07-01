import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { BackendTransactionItem } from '../../../lib/api';

// Subtle background per item class — keeps the badge informative
// without screaming. Matches the paper palette.
const ITEM_CLASS_STYLE: Record<BackendTransactionItem['item_class'], string> = {
  durable: 'bg-[var(--color-paper-deep)] text-[var(--color-ink)]',
  consumable: 'bg-amber-50 text-amber-900',
  food_drink: 'bg-rose-50 text-rose-900',
  service: 'bg-sky-50 text-sky-900',
  other: 'bg-stone-100 text-stone-700',
};

const ITEM_CLASS_LABEL: Record<BackendTransactionItem['item_class'], string> = {
  durable: 'durable',
  consumable: 'consumable',
  food_drink: 'food',
  service: 'service',
  other: 'other',
};

// Above this many top-level product lines a receipt counts as "large":
// the analytical breakdown never bulk-expands (#162 / FE#135 large-receipt
// guard). Individual lines can still be tapped open.
const LARGE_RECEIPT_THRESHOLD = 12;

function formatMinor(minor: number | null | undefined, currency: string): string {
  if (minor == null) return '—';
  const sym = currency === 'USD' ? '$' : '';
  const neg = minor < 0;
  const abs = (Math.abs(minor) / 100).toFixed(2);
  // U+2212 MINUS SIGN reads better than hyphen for signed money.
  return `${neg ? '−' : ''}${sym}${abs}`;
}

/** All-in per-line amount actually charged: effective_total when the backend
 *  distributed tax/tip/discount, else the printed line total. */
function allInMinor(item: BackendTransactionItem): number {
  return item.effective_total_minor ?? item.line_total_minor;
}

type BreakdownRow = { label: string; minor: number | null; kind: 'base' | 'add' | 'sub' };

/** Analytical level-2: how the printed list price becomes the all-in charge.
 *  Returns null when there is nothing to disclose (no tax/tip/discount share
 *  and the effective total equals the list price). */
function breakdown(item: BackendTransactionItem): BreakdownRow[] | null {
  const tax = item.tax_minor ?? 0;
  const tip = item.tip_share_minor ?? 0;
  const discount = item.discount_share_minor ?? 0;
  const effective = allInMinor(item);
  const nothing =
    tax === 0 &&
    tip === 0 &&
    discount === 0 &&
    effective === item.line_total_minor;
  if (nothing) return null;
  const rows: BreakdownRow[] = [
    { label: 'List price', minor: item.line_total_minor, kind: 'base' },
  ];
  if (tax !== 0) rows.push({ label: 'Tax share', minor: item.tax_minor, kind: 'add' });
  if (tip !== 0) rows.push({ label: 'Tip share', minor: item.tip_share_minor, kind: 'add' });
  if (discount !== 0)
    rows.push({ label: 'Discount share', minor: item.discount_share_minor, kind: 'sub' });
  return rows;
}

function ItemClassPill({ item }: { item: BackendTransactionItem }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none',
        ITEM_CLASS_STYLE[item.item_class],
      )}
    >
      {ITEM_CLASS_LABEL[item.item_class]}
    </span>
  );
}

function ProductLine({
  item,
  currency,
  isChild,
  open,
  onToggle,
}: {
  item: BackendTransactionItem;
  currency: string;
  isChild: boolean;
  open: boolean;
  onToggle: (() => void) | null;
}) {
  const name = item.normalized_name?.trim() || item.raw_name;
  const cur = item.currency || currency;
  const rows = breakdown(item);
  const disclosable = rows != null && onToggle != null;
  const variant = item.product_variant?.trim();
  const unresolved = item.tags?.includes('variant-price-unresolved') ?? false;
  const showQty =
    item.unit_price_minor != null && item.quantity != null && item.quantity !== 1;

  const RowInner = (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto] items-start gap-4 px-5 py-3',
        // Semantic hierarchy is expressed with indentation + a hairline
        // ledger rule, never a chevron (#162 semantic level-2).
        isChild && 'pl-11 pr-5',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {isChild && (
            <span
              aria-hidden
              className="text-[var(--color-ink-faint)] -ml-4 mr-0.5 select-none"
            >
              &#8627;
            </span>
          )}
          <span
            className={cn(
              'truncate',
              isChild
                ? 'text-[13px] text-[var(--color-ink-soft)]'
                : 'text-sm font-medium text-[var(--color-ink)]',
            )}
          >
            {name}
          </span>
          {!isChild && <ItemClassPill item={item} />}
        </div>

        {/* Semantic level-2: free customizations, printed inline & muted. */}
        {variant && (
          <div className="mt-0.5 text-[11.5px] leading-snug text-[var(--color-ink-muted)] italic">
            {variant}
          </div>
        )}
        {unresolved && (
          <div className="mt-0.5 text-[10px] tracking-[0.06em] uppercase text-[var(--color-ink-faint)]">
            add-on price not itemized on receipt
          </div>
        )}
        {showQty && (
          <div className="mt-0.5 text-[11px] text-[var(--color-ink-muted)] tnum">
            {item.quantity} &times; {formatMinor(item.unit_price_minor, cur)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'font-mono tracking-tight tnum',
            isChild ? 'text-[12.5px] text-[var(--color-ink-soft)]' : 'text-[13.5px] font-semibold',
          )}
        >
          {formatMinor(allInMinor(item), cur)}
        </span>
        {disclosable &&
          (open ? (
            <ChevronDown size={15} className="text-[var(--color-ink-faint)]" />
          ) : (
            <ChevronRight size={15} className="text-[var(--color-ink-faint)]" />
          ))}
      </div>
    </div>
  );

  return (
    <li>
      {disclosable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="w-full text-left hover:bg-[var(--color-paper-deep)]/25 transition-colors"
        >
          {RowInner}
        </button>
      ) : (
        RowInner
      )}

      {/* Analytical level-2: list price → tax / tip / discount share →
          all-in. Collapsed until tapped; suppressed in bulk on large
          receipts (#162 adaptive disclosure). */}
      {disclosable && open && rows && (
        <div
          className={cn(
            'bg-[var(--color-paper)] border-t border-[var(--color-rule-soft)] px-5 py-2.5',
            isChild ? 'pl-11' : '',
          )}
        >
          <dl className="space-y-1">
            {rows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-[11.5px] text-[var(--color-ink-muted)]">{r.label}</dt>
                <dd
                  className={cn(
                    'font-mono text-[11.5px] tnum',
                    r.kind === 'add' && 'text-[var(--color-ink-soft)]',
                    r.kind === 'sub' && 'text-[var(--color-accent)]',
                  )}
                >
                  {r.kind === 'add' ? '+ ' : ''}
                  {formatMinor(r.minor, cur)}
                </dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 pt-1 mt-1 border-t border-[var(--color-rule-soft)]">
              <dt className="text-[11.5px] font-medium text-[var(--color-ink)]">All-in</dt>
              <dd className="font-mono text-[12px] font-semibold tnum">
                {formatMinor(allInMinor(item), cur)}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </li>
  );
}

export function LineItemsCard({
  items,
  currency,
}: {
  items: BackendTransactionItem[];
  currency: string;
}) {
  const { topLevel, childrenOf, adjustments } = useMemo(() => {
    const isProduct = (i: BackendTransactionItem) =>
      (i.line_type ?? 'product') === 'product';
    const products = items.filter(isProduct);
    const productLineNos = new Set(products.map((p) => p.line_no));

    const childrenOf = new Map<number, BackendTransactionItem[]>();
    const topLevel: BackendTransactionItem[] = [];
    for (const p of products) {
      const parent = p.parent_line_no;
      // Attach to a parent only when the parent is a real product line in
      // this receipt; orphans (and flat legacy rows) render top-level.
      if (parent != null && parent !== p.line_no && productLineNos.has(parent)) {
        const arr = childrenOf.get(parent) ?? [];
        arr.push(p);
        childrenOf.set(parent, arr);
      } else {
        topLevel.push(p);
      }
    }
    const adjustments = items.filter((i) => !isProduct(i));
    return { topLevel, childrenOf, adjustments };
  }, [items]);

  const isLarge = topLevel.length > LARGE_RECEIPT_THRESHOLD;

  // Per-line analytical disclosure state (set of open line_nos).
  const [openLines, setOpenLines] = useState<Set<number>>(new Set());
  const toggleLine = (lineNo: number) =>
    setOpenLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineNo)) next.delete(lineNo);
      else next.add(lineNo);
      return next;
    });

  // Which product lines actually have a breakdown to disclose.
  const disclosableLineNos = useMemo(() => {
    const s = new Set<number>();
    for (const p of items) {
      if ((p.line_type ?? 'product') === 'product' && breakdown(p) != null) {
        s.add(p.line_no);
      }
    }
    return s;
  }, [items]);

  const allOpen =
    disclosableLineNos.size > 0 &&
    [...disclosableLineNos].every((n) => openLines.has(n));

  const toggleAll = () =>
    setOpenLines(allOpen ? new Set() : new Set(disclosableLineNos));

  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-rule)] flex items-baseline justify-between gap-3">
        <h3 className="font-display font-medium text-lg leading-none">
          Items <span className="text-[var(--color-ink-muted)]">({topLevel.length})</span>
        </h3>
        {/* Bulk breakdown toggle — collapsed by default, and withheld
            entirely on large receipts so the analytical layer stays
            per-line-tap only (large-receipt guard). */}
        {!isLarge && disclosableLineNos.size > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            aria-pressed={allOpen}
            className="flex items-center gap-1 text-[10px] tracking-[0.14em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            {allOpen ? 'Hide breakdown' : 'Show breakdown'}
            {allOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}
      </div>

      <ul className="divide-y divide-[var(--color-rule-soft)]">
        {topLevel.map((parent) => {
          const kids = childrenOf.get(parent.line_no) ?? [];
          return (
            <li key={parent.line_no} className="p-0">
              <ul>
                <ProductLine
                  item={parent}
                  currency={currency}
                  isChild={false}
                  open={openLines.has(parent.line_no)}
                  onToggle={
                    disclosableLineNos.has(parent.line_no)
                      ? () => toggleLine(parent.line_no)
                      : null
                  }
                />
                {kids.map((kid) => (
                  <div
                    key={kid.line_no}
                    className="border-t border-[var(--color-rule-soft)]"
                  >
                    <ProductLine
                      item={kid}
                      currency={currency}
                      isChild
                      open={openLines.has(kid.line_no)}
                      onToggle={
                        disclosableLineNos.has(kid.line_no)
                          ? () => toggleLine(kid.line_no)
                          : null
                      }
                    />
                  </div>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      {/* Adjustments / Totals — tax, discounts, fees. Excluded from the
          Items (N) count above (#162). */}
      {adjustments.length > 0 && (
        <div className="border-t border-[var(--color-rule)] bg-[var(--color-paper)]/40">
          <div className="px-5 pt-3 pb-1.5">
            <span className="text-[10px] tracking-[0.16em] uppercase text-[var(--color-ink-muted)]">
              Adjustments &amp; Totals
            </span>
          </div>
          <ul className="divide-y divide-[var(--color-rule-soft)]">
            {adjustments.map((adj) => {
              const name = adj.normalized_name?.trim() || adj.raw_name;
              const cur = adj.currency || currency;
              return (
                <li
                  key={`adj-${adj.line_no}`}
                  className="grid grid-cols-[1fr_auto] items-baseline gap-4 px-5 py-2.5"
                >
                  <span className="text-[13px] text-[var(--color-ink-soft)] flex items-center gap-2">
                    {name}
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                      {adj.line_type}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'font-mono text-[13px] tnum',
                      adj.line_total_minor < 0 && 'text-[var(--color-accent)]',
                    )}
                  >
                    {formatMinor(adj.line_total_minor, cur)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

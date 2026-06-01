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

function formatMinor(minor: number | null, currency: string): string {
  if (minor == null) return '—';
  const sym = currency === 'USD' ? '$' : '';
  return `${sym}${(minor / 100).toFixed(2)}`;
}

export function LineItemsCard({
  items,
  currency,
}: {
  items: BackendTransactionItem[];
  currency: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--color-rule)] bg-[var(--color-surface)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-rule)] flex items-baseline justify-between">
        <h3 className="font-display italic font-medium text-lg leading-none">
          Items <span className="text-[var(--color-ink-muted)]">({items.length})</span>
        </h3>
        <span className="text-[10px] tracking-[0.16em] uppercase text-[var(--color-ink-muted)]">
          from transaction_items
        </span>
      </div>
      <ul className="divide-y divide-[var(--color-rule-soft)]">
        {items.map((item) => {
          const name = item.normalized_name?.trim() || item.raw_name;
          return (
            <li
              key={item.line_no}
              className="grid grid-cols-[1fr_auto] items-start gap-4 px-5 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{name}</span>
                  <span
                    className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none',
                      ITEM_CLASS_STYLE[item.item_class],
                    )}
                  >
                    {ITEM_CLASS_LABEL[item.item_class]}
                  </span>
                  {item.line_type !== 'product' && (
                    <span className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wider">
                      {item.line_type}
                    </span>
                  )}
                </div>
                {item.unit_price_minor != null && item.quantity !== 1 && (
                  <div className="mt-0.5 text-[11px] text-[var(--color-ink-muted)] tnum">
                    {item.quantity} × {formatMinor(item.unit_price_minor, item.currency || currency)}
                  </div>
                )}
              </div>
              <span className="font-display italic font-medium text-base tnum">
                {formatMinor(item.line_total_minor, item.currency || currency)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

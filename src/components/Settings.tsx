import { useQuery } from '@tanstack/react-query';
import BuildInfoPanel from './BuildInfoPanel';
import { fetchBackendBuildInfo, fetchTransactions } from '../lib/api';
import { listProducts } from '../lib/api/products';
import { listBrands } from '../lib/api/brands';
import { listBatches } from '../lib/api/ingest';
import { qk } from '../lib/queryKeys';
import { cn } from '../lib/utils';

interface SettingsProps {
  /** Open the Products catalog screen (route: /settings/products). */
  onOpenProducts: () => void;
  /** Open the Brands registry screen (route: /settings/brands). */
  onOpenBrands: () => void;
  /** Open the upload/batch history screen (route: /batches). FE#80 —
   *  this is the sole UI entry point for the Batches surface. */
  onOpenUploads: () => void;
}

/**
 * Settings — the engine-room stack behind the Home gear (board screen
 * 24): profile row, three registry cards with live counts, and the
 * ink-dark Build & Deploy receipt. Each card drives a real route via
 * the injected callbacks.
 */
export default function Settings({ onOpenProducts, onOpenBrands, onOpenUploads }: SettingsProps) {
  const { data: backendBuildInfo = null } = useQuery({
    queryKey: qk.buildInfo,
    queryFn: fetchBackendBuildInfo,
  });
  // Counts: the registries are small (< 500 rows), so a single page is
  // the whole set — length is the count.
  const { data: products } = useQuery({
    queryKey: ['settings', 'count', 'products'],
    queryFn: () => listProducts({ limit: 500 }),
  });
  const { data: brands } = useQuery({
    queryKey: ['settings', 'count', 'brands'],
    queryFn: () => listBrands(),
  });
  const { data: batches } = useQuery({
    queryKey: ['settings', 'count', 'batches'],
    queryFn: () => listBatches({ limit: 200 }),
  });
  const { data: earliest } = useQuery({
    queryKey: ['settings', 'earliest-tx'],
    queryFn: () => fetchTransactions({ sort: 'occurred_on', order: 'asc', limit: 1 }),
  });

  const tenure = (() => {
    const first = earliest?.[0]?.date;
    if (!first) return 'your ledger';
    const start = new Date(first + 'T00:00:00');
    const weeks = Math.max(1, Math.round((Date.now() - start.getTime()) / (7 * 86400000)));
    const since = start.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit' });
    return `${weeks} weeks of receipts · since ${since}`;
  })();

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="font-display text-3xl tracking-tight">Settings</h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          the stack behind the gear
        </p>
      </header>

      {/* profile row */}
      <div className="flex items-center gap-3 pt-1">
        <div
          aria-hidden="true"
          className="h-11 w-11 rounded-full border-[1.5px] border-[var(--color-paper-warm)] shadow-[0_2px_8px_rgba(26,22,18,0.18)]"
          style={{ background: 'radial-gradient(circle at 30% 30%, var(--color-amber), var(--color-accent) 70%)' }}
        />
        <div>
          <p className="font-display text-[17px] font-medium leading-tight">Daniel</p>
          <p className="font-mono text-[8.5px] tracking-[0.04em] text-[var(--color-ink-muted)]">
            {tenure}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <SettingsCard
          glyph="▦"
          title="Products"
          subtitle="Catalog SSOT · merge duplicates · recompute"
          count={products?.length}
          onClick={onOpenProducts}
        />
        <SettingsCard
          glyph="◉"
          title="Brands"
          subtitle="Registry + icon asset picker · your pick locks"
          count={brands?.length}
          onClick={onOpenBrands}
        />
        <SettingsCard
          glyph="⇪"
          title="Uploads"
          subtitle="Batch history · near-dup review · dedup skips"
          count={batches?.items?.length}
          onClick={onOpenUploads}
        />
      </div>

      <BuildInfoPanel backendBuildInfo={backendBuildInfo} />

      <p className="px-1 pt-1 font-display italic text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
        Settings is not preferences. It's the engine room — three registries and a deploy receipt.
      </p>
    </div>
  );
}

function SettingsCard({
  glyph,
  title,
  subtitle,
  count,
  onClick,
}: {
  glyph: string;
  title: string;
  subtitle: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left',
        'border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)]',
        'transition-colors hover:border-[var(--color-rule)]',
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)] text-[16px]"
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[14px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-ink-muted)]">
          {subtitle}
        </span>
      </span>
      {count != null && (
        <span className="flex-shrink-0 rounded-full bg-[var(--color-paper-deep)] px-2 py-0.5 font-mono text-[9px] text-[var(--color-ink-muted)]">
          {count}
        </span>
      )}
      <span aria-hidden="true" className="flex-shrink-0 text-[14px] text-[var(--color-ink-faint)]">
        ›
      </span>
    </button>
  );
}

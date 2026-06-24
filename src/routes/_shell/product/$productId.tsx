import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getProduct } from '../../../lib/api/products';
import { listOwnedItemsExpanded } from '../../../lib/api/things';
import { daysHeld, perDay, fmtPerDay } from '../../../lib/things';
import { ProductImage } from '../../../components/ProductImage';
import { brandLink } from '../../../lib/navLinks';
import { useBack } from '../../../lib/useBack';
import { cn } from '../../../lib/utils';

export const Route = createFileRoute('/_shell/product/$productId')({
  component: ProductRoute,
});

/**
 * /product/$productId — the consumer-grade product page (board screen
 * 04), distinct from the admin catalog at /settings/products. SKU
 * identity (product_key, variant chips), lifetime stats, the maker
 * card linking into the Brand page, and this product's owned
 * instances. Product imagery + variant siblings arrive with the
 * image-extraction work; the glyph placeholder is deliberate.
 */
function ProductRoute() {
  const { productId } = Route.useParams();
  const back = useBack('/owned');

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProduct(productId),
  });
  const { data: owned = [] } = useQuery({
    queryKey: ['owned-items', 'expanded'],
    queryFn: () => listOwnedItemsExpanded({ include_retired: true }),
  });
  const instances = owned.filter((o) => o.product_id === productId);

  if (isLoading) {
    return (
      <p className="py-16 text-center font-display italic text-[var(--color-ink-muted)]">
        loading…
      </p>
    );
  }
  if (!product) {
    return (
      <p className="py-16 text-center font-display italic text-[var(--color-ink-muted)]">
        Product not found.
      </p>
    );
  }

  const name = product.custom_name ?? product.canonical_name;
  const variants = [
    product.model && { k: 'model', v: product.model },
    product.color && { k: 'color', v: product.color },
    product.size && { k: 'size', v: product.size },
    product.variant && { k: 'variant', v: product.variant },
    product.sku && { k: 'sku', v: product.sku },
  ].filter(Boolean) as Array<{ k: string; v: string }>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={back}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-accent)]"
        >
          ← Back
        </button>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          sku catalog · portable across sellers
        </span>
      </div>

      {/* hero */}
      <div className="flex aspect-[5/3] items-center justify-center overflow-hidden rounded-[18px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)]">
        <ProductImage productId={product.id} itemClass={product.item_class} />
      </div>

      <div>
        <h1 className="font-display text-[22px] font-medium leading-tight tracking-tight">{name}</h1>
        <p className="mt-1 break-all font-mono text-[9px] tracking-[0.02em] text-[var(--color-ink-faint)]">
          {product.product_key}
        </p>
        {variants.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {variants.map((v) => (
              <span
                key={v.k}
                className="rounded-full border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-2.5 py-1 font-mono text-[8.5px] text-[var(--color-ink-soft)]"
              >
                <span className="uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">{v.k}</span>{' '}
                {v.v}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* stats */}
      <div className="grid grid-cols-3 divide-x divide-[var(--color-rule-soft)] rounded-[12px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] py-3 text-center">
        <Stat label="Buys" value={`${product.purchase_count ?? 0}×`} />
        <Stat
          label="Spent"
          value={`$${Math.round((product.total_spent_minor ?? 0) / 100).toLocaleString()}`}
        />
        <Stat label="Owned" value={String(instances.filter((i) => !i.retired_at).length)} />
      </div>

      {/* maker card */}
      {product.brand_id && (
        <Link
          {...brandLink(product.brand_id)}
          className="flex items-center gap-3 rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[var(--color-rule)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--color-ink)] font-display text-[13px] text-[var(--color-paper)]">
            {(product.brand_id[0] ?? '?').toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[7.5px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
              maker · brand_id
            </span>
            <span className="block font-display text-[14.5px] font-medium">{product.brand_id}</span>
          </span>
          <span aria-hidden="true" className="text-[14px] text-[var(--color-ink-faint)]">
            ›
          </span>
        </Link>
      )}

      {/* owned instances */}
      {instances.length > 0 && (
        <section>
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            Owned instances
          </p>
          <ul className="rounded-[14px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4">
            {instances.map((it, idx) => (
              <li key={it.id} className={cn(idx > 0 && 'border-t border-[var(--color-rule-soft)]')}>
                <Link
                  to="/owned/$ownedItemId"
                  params={{ ownedItemId: it.id }}
                  className="flex items-baseline gap-3 py-2.5"
                >
                  <span className="font-mono text-[9px] text-[var(--color-ink-faint)]">
                    #{it.instance_index}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-ink-soft)]">
                    {it.acquired_on ?? '—'}
                    {it.payee ? ` · ${it.payee}` : ''}
                    {it.retired_at ? ' · retired' : ''}
                  </span>
                  <span className="font-mono text-[10.5px] font-semibold text-[var(--color-accent)] tnum">
                    {fmtPerDay(perDay(it))}
                  </span>
                  <span className="font-mono text-[9px] text-[var(--color-ink-muted)] tnum">
                    {daysHeld(it)?.toLocaleString() ?? '—'} d
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p className="mt-0.5 font-display text-[17px] tnum">{value}</p>
    </div>
  );
}

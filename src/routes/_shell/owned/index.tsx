import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_shell/owned/')({
  component: OwnedRoute,
});

/**
 * /owned — the Things tab landing (v2 IA, board screens 09–13).
 *
 * P0b scope: a designed placeholder. The owned_items / wish_items backend
 * (P3) brings the real grid: $/day amortization, lifecycle badges, wish
 * funding plans. Per the redesign ground rules we ship an honest empty
 * state rather than fake data.
 */
function OwnedRoute() {
  return (
    <div className="space-y-5">
      <header className="pt-2">
        <h1 className="font-display text-3xl tracking-tight">My things</h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          derived from owned_items
        </p>
      </header>

      <section className="rounded-[var(--radius-card)] border-[0.5px] border-dashed border-[var(--color-rule)] px-5 py-7">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          Things you have &amp; things you want
        </p>
        <p className="mt-2 font-display italic text-[15px] leading-snug text-[var(--color-ink-soft)]">
          Every durable purchase becomes an owned item — amortized to a
          cost per day. Wishes get the same math, run forward. Arriving
          with the Things release; your ledger history will seed it
          automatically.
        </p>
      </section>
    </div>
  );
}

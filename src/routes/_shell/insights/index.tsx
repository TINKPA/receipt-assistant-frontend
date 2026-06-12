import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/_shell/insights/')({
  component: InsightsRoute,
});

/**
 * /insights — the Insights tab landing (v2 IA, board screens 18–19 + 22–23).
 *
 * P0b scope: hosts the two review rituals that used to live behind the
 * dock's Review pill. The discovered-cards feed and natural-language Q&A
 * (board screens 18–19) arrive with the P5 backend; until then a quiet
 * placeholder marks the territory honestly instead of faking data.
 */
function InsightsRoute() {
  return (
    <div className="space-y-5">
      <header className="pt-2">
        <h1 className="font-display text-3xl tracking-tight">Insights</h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          the questions a list can't answer
        </p>
      </header>

      <section aria-label="Reviews" className="space-y-2.5">
        <ReviewCard
          to="/review/monthly"
          title="Monthly review"
          sub="The monthly close — totals, categories, vs. last month"
          glyph="◔"
        />
        <ReviewCard
          to="/review/yearly"
          title="Yearly review"
          sub="Net worth snapshot, quarters, the long arc"
          glyph="◎"
        />
      </section>

      <section
        aria-label="Discovered for you"
        className="rounded-[var(--radius-card)] border-[0.5px] border-dashed border-[var(--color-rule)] px-5 py-6"
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          Discovered for you
        </p>
        <p className="mt-2 font-display italic text-[15px] leading-snug text-[var(--color-ink-soft)]">
          Anomalies, trends, milestones — and a question box that answers
          against your whole ledger. Arriving with the Insights release.
        </p>
      </section>
    </div>
  );
}

function ReviewCard({
  to,
  title,
  sub,
  glyph,
}: {
  to: string;
  title: string;
  sub: string;
  glyph: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3.5 rounded-[var(--radius-card)] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 py-3.5 transition-colors hover:border-[var(--color-rule)]"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-[10px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)] text-[15px] text-[var(--color-ink-soft)]"
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15px] font-medium leading-tight">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-ink-muted)]">
          {sub}
        </span>
      </span>
      <span aria-hidden="true" className="text-[14px] text-[var(--color-ink-faint)]">
        ›
      </span>
    </Link>
  );
}

import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  askLedger,
  dismissInsight,
  listInsights,
  refreshInsights,
  type Insight,
} from '../../../lib/api/insights';
import { cn } from '../../../lib/utils';

export const Route = createFileRoute('/_shell/insights/')({
  component: InsightsRoute,
});

const KIND_STYLE: Record<string, { border: string; tag: string; glyph: string; bar: string }> = {
  anomaly: { border: 'border-l-[var(--color-amber)]', tag: 'text-[var(--color-amber)]', glyph: '⚠', bar: 'var(--color-amber)' },
  trend: { border: 'border-l-[var(--color-accent)]', tag: 'text-[var(--color-accent)]', glyph: '↯', bar: 'var(--color-accent)' },
  milestone: { border: 'border-l-[var(--color-olive)]', tag: 'text-[var(--color-olive)]', glyph: '★', bar: 'var(--color-olive)' },
  opportunity: { border: 'border-l-[var(--color-slate)]', tag: 'text-[var(--color-slate)]', glyph: '◇', bar: 'var(--color-slate)' },
};

/** Numeric figures the rule engine attaches per kind (`payload.figures`). */
interface Figures {
  current?: number;
  previous?: number;
  pct?: number;
  days?: number;
  mark?: number;
}

function readFigures(payload: Insight['payload']): Figures | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const f = (payload as Record<string, unknown>).figures;
  if (typeof f !== 'object' || f === null) return null;
  const out: Figures = {};
  for (const k of ['current', 'previous', 'pct', 'days', 'mark'] as const) {
    const v = (f as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** anomaly figures are dollar amounts; trend figures are visit counts. */
function fmtFigure(kind: string, n: number): string {
  if (kind === 'anomaly') return `$${Math.round(n).toLocaleString()}`;
  return n.toLocaleString();
}

/**
 * /insights — board screens 18-19: the ask bar, the discovered-cards
 * feed (rule engine, refresh-on-visit), and the two review rituals.
 * Answers render inline (screen 19's answer view) — the question stays
 * editable, the response leads with its figure.
 */
function InsightsRoute() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState<{ q: string; answer: string } | null>(null);

  const { data: cards = [] } = useQuery({
    queryKey: ['insights'],
    queryFn: listInsights,
  });
  // Refresh the rule engine quietly on visit; the list invalidates after.
  useQuery({
    queryKey: ['insights', 'refresh'],
    queryFn: async () => {
      const n = await refreshInsights();
      qc.invalidateQueries({ queryKey: ['insights'] });
      return n;
    },
    staleTime: 5 * 60 * 1000,
  });

  const askMut = useMutation({
    mutationFn: (q: string) => askLedger(q),
    onSuccess: (res, q) => setConversation({ q, answer: res.answer }),
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => dismissInsight(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  });

  const submit = () => {
    const q = question.trim();
    if (q.length >= 3 && !askMut.isPending) askMut.mutate(q);
  };

  return (
    <div className="space-y-5">
      <header className="pt-2">
        <h1 className="font-display text-3xl tracking-tight">Insights</h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          the questions a list can't answer
        </p>
      </header>

      {/* ask bar (board screen 18) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2.5 rounded-[14px] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] px-3.5 py-2.5 focus-within:border-[var(--color-ink-muted)]"
      >
        <span aria-hidden="true" className="text-[14px] text-[var(--color-accent)]">
          ✦
        </span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='Ask anything — "how much on dining in May?"'
          disabled={askMut.isPending}
          className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:font-mono placeholder:text-[10.5px] placeholder:text-[var(--color-ink-faint)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={askMut.isPending || question.trim().length < 3}
          aria-label="Ask"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-ink)] text-[11px] text-[var(--color-paper)] disabled:opacity-30"
        >
          ↵
        </button>
      </form>

      {/* thinking / answer (board screen 19) */}
      {askMut.isPending && (
        <div className="rounded-[var(--radius-card)] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-5 py-6 text-center">
          <p className="font-display italic text-[15px] text-[var(--color-ink-soft)]">
            reading your whole ledger…
          </p>
          <p className="mt-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
            sql, not vibes · typically 10–30s
          </p>
        </div>
      )}
      {askMut.isError && (
        <p className="text-center text-xs text-[var(--color-stamp)]">
          {askMut.error instanceof Error ? askMut.error.message : 'Something went wrong.'}
        </p>
      )}
      {conversation && !askMut.isPending && (
        <section className="rounded-[var(--radius-card)] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
              {conversation.q}
            </p>
            <button
              type="button"
              onClick={() => setConversation(null)}
              className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]"
            >
              clear
            </button>
          </div>
          <div className="mt-3 whitespace-pre-wrap text-[13px] leading-[1.55] text-[var(--color-ink)] [&>*:first-line]:font-display">
            {conversation.answer}
          </div>
        </section>
      )}

      {/* discovered cards */}
      {cards.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
              Discovered for you
            </p>
            <p className="font-mono text-[8.5px] text-[var(--color-ink-faint)]">
              {cards.length} active
            </p>
          </div>
          {cards.map((c) => (
            <InsightCard
              key={c.id}
              card={c}
              onDismiss={() => dismissMut.mutate(c.id)}
              onOpen={(link) => {
                // deep_link is an in-app path emitted by the rule engine.
                navigate({ to: link as never });
              }}
            />
          ))}
        </section>
      )}

      {/* reviews */}
      <section aria-label="Reviews" className="space-y-2.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          Rituals
        </p>
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
    </div>
  );
}

function InsightCard({
  card,
  onDismiss,
  onOpen,
}: {
  card: Insight;
  onDismiss: () => void;
  onOpen: (link: string) => void;
}) {
  const style = KIND_STYLE[card.kind] ?? KIND_STYLE.opportunity;
  const deepLink =
    typeof card.payload === 'object' && card.payload !== null
      ? ((card.payload as Record<string, unknown>).deep_link as string | undefined)
      : undefined;
  return (
    <article
      className={cn(
        'rounded-[14px] border-[0.5px] border-l-[3px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-4 py-3.5',
        style.border,
      )}
    >
      <div className="flex items-baseline justify-between">
        <p className={cn('font-mono text-[8px] uppercase tracking-[0.16em]', style.tag)}>
          {style.glyph} {card.kind}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="font-mono text-[10px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]"
        >
          ✕
        </button>
      </div>
      <h3 className="mt-1.5 font-display text-[15.5px] font-medium leading-snug tracking-tight">
        {card.title}
      </h3>
      <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-ink-muted)]">{card.body}</p>
      <CardFigures kind={card.kind} figures={readFigures(card.payload)} bar={style.bar} />
      {deepLink && (
        <button
          type="button"
          onClick={() => onOpen(deepLink)}
          className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          Open {deepLink.startsWith('/owned') ? 'in Things' : 'in Ledger'} ›
        </button>
      )}
    </article>
  );
}

/**
 * Board screens 18.4/18.5 — the emphatic figure + mini bar-viz on each
 * card. `compare` kinds (anomaly/trend) get two stacked bars (this vs
 * prior, the active one kind-colored); `milestone` gets a day-count
 * figure with a thin progress line crossing its mark. Pure CSS, no chart
 * lib — the data is one or two numbers.
 */
function CardFigures({
  kind,
  figures,
  bar,
}: {
  kind: string;
  figures: Figures | null;
  bar: string;
}) {
  if (!figures) return null;

  // milestone: days held past a round mark
  if (figures.days != null) {
    const mark = figures.mark ?? figures.days;
    const frac = mark > 0 ? Math.min(1, mark / figures.days) : 1;
    return (
      <div className="mt-3 flex items-end gap-3">
        <div className="leading-none">
          <span className="font-mono text-[22px] font-semibold tnum text-[var(--color-ink)]">
            {figures.days.toLocaleString()}
          </span>
          <span className="ml-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
            days
          </span>
        </div>
        <div className="mb-1 min-w-0 flex-1">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--color-paper-fold)]">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: '100%', background: bar, opacity: 0.85 }} />
            {/* the round-number mark, as a tick along the filled bar */}
            <span className="absolute inset-y-0 w-px bg-[var(--color-paper)]" style={{ left: `${frac * 100}%` }} />
          </div>
          <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
            past {mark.toLocaleString()} mark
          </p>
        </div>
      </div>
    );
  }

  // anomaly / trend: this month vs prior, two mini bars
  if (figures.current != null && figures.previous != null) {
    const max = Math.max(figures.current, figures.previous, 1);
    return (
      <div className="mt-3 flex items-center gap-3.5">
        {figures.pct != null && (
          <div className="flex-shrink-0 leading-none">
            <span className="font-mono text-[20px] font-semibold tnum" style={{ color: bar }}>
              {figures.pct > 0 ? '+' : ''}
              {figures.pct}%
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <MiniBar label="now" value={figures.current} max={max} text={fmtFigure(kind, figures.current)} color={bar} />
          <MiniBar label="prior" value={figures.previous} max={max} text={fmtFigure(kind, figures.previous)} color="var(--color-ink-faint)" />
        </div>
      </div>
    );
  }

  return null;
}

function MiniBar({
  label,
  value,
  max,
  text,
  color,
}: {
  label: string;
  value: number;
  max: number;
  text: string;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 flex-shrink-0 font-mono text-[7.5px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
        {label}
      </span>
      <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-[2px] bg-[var(--color-paper-fold)]">
        <span className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%`, background: color }} />
      </span>
      <span className="w-12 flex-shrink-0 text-right font-mono text-[9px] tnum text-[var(--color-ink-soft)]">
        {text}
      </span>
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

import type { WishItem } from '../lib/api/things';
import {
  captureFailureMessage,
  captureReadAt,
  fmtWhen,
  isFailed,
  isRereading,
  namedByHand,
} from '../lib/wishPlaces';
import { cn } from '../lib/utils';

/**
 * How the reading of a captured image stands, for a wish's page: shared by
 * the place page and the thing page, so a thing whose image could not be
 * read says so as a place does.
 */

const SMALL_ACTION =
  'rounded-full border-[0.5px] border-[var(--color-rule)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-50';
const CARD =
  'rounded-[13px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] px-3.5 py-3';

/** The image is being read now. */
export function ReadingNotice({ wish }: { wish: WishItem }) {
  return (
    <div aria-busy="true">
      <h1 className="font-display text-[22px] font-medium italic leading-tight text-[var(--color-ink-muted)]">
        {isRereading(wish) ? 'Reading again…' : 'Reading…'}
      </h1>
      <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-ink-muted)]">
        Working out what this is and where. It usually takes under a minute; this page fills in by
        itself.
      </p>
    </div>
  );
}

/** The reading failed and nobody has named the wish yet. `retried`: it was
 *  read again in this tab (here or on the list) and failed again. */
export function NotReadBanner({
  wish,
  now,
  retried,
  hint,
}: {
  wish: WishItem;
  now: number;
  retried: boolean;
  /** What the person can do about it, after the reason. */
  hint: string;
}) {
  const readAt = captureReadAt(wish);
  return (
    <div role="status" className={cn(CARD, 'border-[color:rgba(139,38,19,0.35)]')}>
      <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-stamp)]">
        {retried ? 'still not read' : 'not read'}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-[var(--color-ink-soft)]">
        {captureFailureMessage(wish)}. {hint}
      </p>
      {readAt && (
        <p className="mt-1 font-mono text-[9px] text-[var(--color-ink-muted)]">
          {retried ? 'tried again' : 'tried'} {fmtWhen(readAt, now)}
        </p>
      )}
    </div>
  );
}

/** "Read again", under a wish that was captured from an image. */
export function ReadAgainRow({
  wish,
  busy,
  starting,
  onRetry,
}: {
  wish: WishItem;
  busy: boolean;
  starting: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-0.5">
      <p className="font-mono text-[9px] text-[var(--color-ink-muted)]">
        {isFailed(wish)
          ? 'The image was not read.'
          : namedByHand(wish)
            ? 'The image was not read; named by hand.'
            : 'Read from the image.'}
      </p>
      <button type="button" disabled={busy} onClick={onRetry} className={SMALL_ACTION}>
        {starting ? 'Starting…' : 'Read again'}
      </button>
    </div>
  );
}

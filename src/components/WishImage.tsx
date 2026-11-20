import type { ReactNode } from 'react';
import { wishImageUrl, type WishItem } from '../lib/api/things';
import { cn } from '../lib/utils';

/** The image a wish was captured from, as a card thumbnail. The box is
 *  the caller's (`className` sets its size and shape). */
export function WishThumb({
  wish,
  dimmed,
  className,
}: {
  wish: WishItem;
  dimmed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative shrink-0 overflow-hidden bg-[var(--color-paper-deep)]', className)}>
      <img
        src={wishImageUrl(wish.id)}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn('h-full w-full object-cover', dimmed && 'opacity-60')}
      />
    </div>
  );
}

/** The image a wish was captured from, whole, opening full size. */
export function WishHeroImage({
  wish,
  alt,
  pulsing,
  children,
}: {
  wish: WishItem;
  alt: string;
  pulsing?: boolean;
  /** Overlays (badges) placed inside the frame. */
  children?: ReactNode;
}) {
  return (
    <a
      href={wishImageUrl(wish.id)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open the captured image full size"
      className="relative block overflow-hidden rounded-[18px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)]"
    >
      <img
        src={wishImageUrl(wish.id)}
        alt={alt}
        className={cn(
          'mx-auto max-h-[56vh] w-auto max-w-full object-contain',
          pulsing && 'animate-pulse',
        )}
      />
      {children}
      <span className="absolute bottom-2.5 right-2.5 rounded-full bg-[color:rgba(251,247,238,0.92)] px-2.5 py-1 font-mono text-[8.5px] text-[var(--color-ink-soft)]">
        full size ↗
      </span>
    </a>
  );
}

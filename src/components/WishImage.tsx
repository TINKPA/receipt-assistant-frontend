import { useState, type ReactNode } from 'react';
import { wishImageUrl, type WishItem } from '../lib/api/things';
import { cn } from '../lib/utils';

/** The image a wish was captured from, as a card thumbnail. The box is
 *  the caller's (`className` sets its size and shape). An image that
 *  cannot load leaves the box blank. */
export function WishThumb({
  wish,
  dimmed,
  className,
}: {
  wish: WishItem;
  dimmed?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={cn('relative shrink-0 overflow-hidden bg-[var(--color-paper-deep)]', className)}>
      {!broken && (
        <img
          src={wishImageUrl(wish.id)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className={cn('h-full w-full object-cover', dimmed && 'opacity-60')}
        />
      )}
    </div>
  );
}

/** The hatched frame shown where a wish has no image to show. */
export function WishImagePlaceholder({ children }: { children?: ReactNode }) {
  return (
    <div className="relative flex aspect-[5/3] items-center justify-center overflow-hidden rounded-[18px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper-deep)]">
      <span
        aria-hidden="true"
        className="flex h-full w-full items-center justify-center text-[64px] text-[var(--color-ink-faint)]"
        style={{
          background:
            'repeating-linear-gradient(45deg, transparent 0 7px, rgba(140,130,115,0.07) 7px 9px)',
        }}
      >
        ◇
      </span>
      {children}
    </div>
  );
}

/** The image a wish was captured from, whole, opening full size. When
 *  the file cannot be loaded (the server answers 404 for a missing file)
 *  `fallback` is drawn instead and `onBroken` is called. */
export function WishHeroImage({
  wish,
  alt,
  pulsing,
  fallback = null,
  onBroken,
  children,
}: {
  wish: WishItem;
  alt: string;
  pulsing?: boolean;
  fallback?: ReactNode;
  onBroken?: () => void;
  /** Overlays (badges) placed inside the frame. */
  children?: ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) return <>{fallback}</>;
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
        onError={() => {
          setBroken(true);
          onBroken?.();
        }}
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

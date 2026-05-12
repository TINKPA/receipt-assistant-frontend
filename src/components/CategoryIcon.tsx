import { ArrowDownLeft, ArrowLeftRight, TrendingUp, Circle } from 'lucide-react';
import { CATEGORY_META } from '../categoryMeta';
import type { Category, TransactionType } from '../types';

interface CategoryIconProps {
  category: Category | null;
  transactionType?: TransactionType;
  size?: number;
}

const NON_SPENDING_META: Record<Exclude<TransactionType, 'spending'>, { color: string; glyph: typeof Circle }> = {
  income: { color: '#34C759', glyph: ArrowDownLeft },
  transfer: { color: '#8E8E93', glyph: ArrowLeftRight },
  investment: { color: '#5856D6', glyph: TrendingUp },
};

export function CategoryIcon({ category, transactionType, size = 44 }: CategoryIconProps) {
  const radius = Math.round(size * 0.32);
  const glyphSize = Math.round(size * 0.55);

  let color: string;
  let Glyph: typeof Circle;
  let label: string;

  if (category) {
    const meta = CATEGORY_META[category];
    color = meta.color;
    Glyph = meta.glyph;
    label = category;
  } else if (transactionType && transactionType !== 'spending') {
    const meta = NON_SPENDING_META[transactionType];
    color = meta.color;
    Glyph = meta.glyph;
    label = transactionType;
  } else {
    color = '#C7C7CC';
    Glyph = Circle;
    label = 'Uncategorized';
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
      aria-label={label}
    >
      <Glyph size={glyphSize} strokeWidth={2} color="#fff" />
    </div>
  );
}

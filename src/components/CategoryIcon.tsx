import { CATEGORY_META } from '../categoryMeta';
import type { Category } from '../types';

interface CategoryIconProps {
  category: Category;
  size?: number;
}

export function CategoryIcon({ category, size = 44 }: CategoryIconProps) {
  const meta = CATEGORY_META[category];
  const Glyph = meta.glyph;
  const radius = Math.round(size * 0.32);
  const glyphSize = Math.round(size * 0.55);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: meta.color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
      aria-label={category}
    >
      <Glyph size={glyphSize} strokeWidth={2} color="#fff" />
    </div>
  );
}

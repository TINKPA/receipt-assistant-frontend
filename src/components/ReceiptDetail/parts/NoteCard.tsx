import { cn } from '../../../lib/utils';

export function NoteCard({ text }: { text: string }) {
  return (
    <div
      className="relative rounded-[16px] px-4 py-4 leading-snug"
      style={{ background: 'var(--color-butter)' }}
    >
      <span
        className={cn(
          'absolute -top-2 left-4 inline-block rounded-full px-2 py-[3px]',
          'bg-[var(--color-terracotta)] text-white',
          'text-[10px] font-medium tracking-[0.16em] uppercase',
        )}
      >
        your note
      </span>
      <p className="font-hand text-lg text-[var(--color-ink)]">{text}</p>
    </div>
  );
}

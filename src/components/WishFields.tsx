import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../lib/utils';

/** Inline editors on the wish pages. Each saves on blur (and on Enter for a
 *  single line), as the money fields on the owned page do, and calls
 *  `onSave` only when the value changed. A parent remounts a field (by
 *  `key`) when the server's value changes, so the field shows it. */

export const FIELD_LABEL =
  'font-mono text-[8.5px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]';

const UNDERLINE =
  'w-full min-w-0 rounded-none border-b-[0.5px] border-transparent bg-transparent pb-0.5 outline-none transition-colors placeholder:text-[var(--color-ink-faint)] hover:border-[var(--color-rule)] focus:border-[var(--color-ink-muted)]';

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

/** Text the user types. An empty optional field clears the value; an
 *  empty required field is put back as it was.
 *
 *  A single-line field is still a textarea, so a long name (a product
 *  title) wraps instead of running off the edge; it grows with the text up
 *  to a few lines, takes no line breaks, and Enter saves it. */
export function TextField({
  label,
  value,
  placeholder,
  disabled,
  multiline,
  required,
  onSave,
  className,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  multiline?: boolean;
  required?: boolean;
  onSave: (next: string | null) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const lineRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  const commit = () => {
    const next = text.trim();
    if (next === value.trim()) return;
    if (next === '' && required) {
      setText(value);
      return;
    }
    onSave(next === '' ? null : next);
  };
  const shared = {
    value: text,
    placeholder,
    disabled,
    'aria-label': label,
    onBlur: commit,
    className: cn(UNDERLINE, className),
  };
  return (
    <label className="block">
      <span className={FIELD_LABEL}>{label}</span>
      {multiline ? (
        <textarea
          {...shared}
          rows={Math.min(6, Math.max(2, Math.ceil(text.length / 44)))}
          onChange={(e) => setText(e.target.value)}
          className={cn(shared.className, 'mt-1 block resize-none')}
        />
      ) : (
        <textarea
          {...shared}
          ref={lineRef}
          rows={1}
          onChange={(e) => setText(e.target.value.replace(/[\r\n]+/g, ' '))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className={cn(
            shared.className,
            'mt-1 block max-h-[5.5em] resize-none overflow-y-auto [overflow-wrap:anywhere]',
          )}
        />
      )}
    </label>
  );
}

/**
 * A positive number the user types, shown with a unit (`$` before, `years`
 * after). `toText` / `fromText` convert between the stored value and what
 * is typed; empty clears it. Anything that does not parse is marked and not
 * saved.
 */
export function NumberField({
  label,
  value,
  disabled,
  prefix,
  suffix,
  placeholder = '—',
  toText,
  fromText,
  onSave,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  toText: (v: number) => string;
  /** null when the text is not a valid value. */
  fromText: (t: string) => number | null;
  onSave: (next: number | null) => void;
}) {
  const [text, setText] = useState(value != null ? toText(value) : '');
  const trimmed = text.trim();
  const parsed = trimmed === '' ? null : fromText(trimmed);
  const valid = trimmed === '' || parsed !== null;
  const commit = () => {
    if (!valid || parsed === value) return;
    onSave(parsed);
  };
  return (
    <label className="block">
      <span className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span
        className={cn(
          'mt-1 flex items-baseline gap-1 border-b-[0.5px] pb-1',
          valid ? 'border-[var(--color-rule)]' : 'border-[var(--color-stamp)]',
        )}
      >
        {prefix && (
          <span className="font-display text-[14px] text-[var(--color-ink-muted)]">{prefix}</span>
        )}
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={!valid}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={blurOnEnter}
          className="w-full min-w-0 bg-transparent font-display text-[16px] tnum outline-none placeholder:text-[var(--color-ink-faint)]"
        />
        {suffix && (
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

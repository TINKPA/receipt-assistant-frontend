import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, Eye, EyeOff, Filter, Tag, X } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  DATE_PRESET_LABEL,
  STATUS_OPTIONS,
  type DatePreset,
  type FilterState,
} from '../lib/transactionsFilterState';
import { CATEGORIES, type Category, type RawTransactionStatus } from '../types';

/** Closes the popover when a click lands outside the wrapped element. */
function useClickAway(onAway: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onAway();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onAway]);
  return ref;
}

interface TransactionsFiltersProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  hasActiveFilter: boolean;
  onClear: () => void;
  showDeleted: boolean;
  onToggleShowDeleted: () => void;
}

export default function TransactionsFilters({
  filters,
  onChange,
  hasActiveFilter,
  onClear,
  showDeleted,
  onToggleShowDeleted,
}: TransactionsFiltersProps) {
  const [openPopover, setOpenPopover] = useState<'date' | 'category' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const dateRef = useClickAway(() => setOpenPopover((p) => (p === 'date' ? null : p)));
  const categoryRef = useClickAway(() => setOpenPopover((p) => (p === 'category' ? null : p)));

  const dateLabel =
    filters.datePreset === 'custom'
      ? filters.customFrom || filters.customTo
        ? `${filters.customFrom || '…'} → ${filters.customTo || '…'}`
        : 'Custom range'
      : DATE_PRESET_LABEL[filters.datePreset];

  const categoryLabel =
    filters.categories.length === 0
      ? 'All'
      : filters.categories.length === 1
        ? filters.categories[0]
        : `${filters.categories.length} selected`;

  const toggleCategory = (c: Category) => {
    onChange({
      ...filters,
      categories: filters.categories.includes(c)
        ? filters.categories.filter((x) => x !== c)
        : [...filters.categories, c],
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center">
        {/* Date chip */}
        <div ref={dateRef} className="relative">
          <button
            type="button"
            data-testid="filter-date"
            onClick={() => setOpenPopover((p) => (p === 'date' ? null : 'date'))}
            className={cn(
              'px-4 py-2 rounded-xl flex items-center gap-2 border text-sm font-medium transition-colors',
              filters.datePreset !== 'all'
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-surface-container-high border-outline-variant/15 text-white hover:border-outline-variant/30',
            )}
          >
            <Calendar size={16} />
            <span className="text-on-surface-variant">Date:</span> {dateLabel}
            <ChevronDown size={14} />
          </button>
          {openPopover === 'date' && (
            <div
              data-testid="filter-date-popover"
              className="absolute z-30 mt-2 left-0 min-w-[240px] bg-surface-container-highest border border-outline-variant/20 rounded-xl shadow-2xl p-2"
            >
              {(Object.keys(DATE_PRESET_LABEL) as DatePreset[]).map((preset) => (
                <button
                  type="button"
                  key={preset}
                  data-testid={`filter-date-${preset}`}
                  onClick={() => {
                    onChange({ ...filters, datePreset: preset });
                    if (preset !== 'custom') setOpenPopover(null);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                    filters.datePreset === preset
                      ? 'bg-primary/15 text-primary font-bold'
                      : 'text-white hover:bg-surface-container-high',
                  )}
                >
                  {DATE_PRESET_LABEL[preset]}
                </button>
              ))}
              {filters.datePreset === 'custom' && (
                <div className="mt-2 pt-3 border-t border-outline-variant/15 px-1 space-y-2">
                  <label className="block text-xs text-on-surface-variant">
                    From
                    <input
                      type="date"
                      data-testid="filter-date-custom-from"
                      value={filters.customFrom}
                      onChange={(e) => onChange({ ...filters, customFrom: e.target.value })}
                      className="mt-1 w-full bg-surface-container-low border border-outline-variant/15 rounded-lg px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="block text-xs text-on-surface-variant">
                    To
                    <input
                      type="date"
                      data-testid="filter-date-custom-to"
                      value={filters.customTo}
                      onChange={(e) => onChange({ ...filters, customTo: e.target.value })}
                      className="mt-1 w-full bg-surface-container-low border border-outline-variant/15 rounded-lg px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category chip */}
        <div ref={categoryRef} className="relative">
          <button
            type="button"
            data-testid="filter-category"
            onClick={() => setOpenPopover((p) => (p === 'category' ? null : 'category'))}
            className={cn(
              'px-4 py-2 rounded-xl flex items-center gap-2 border text-sm font-medium transition-colors',
              filters.categories.length > 0
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-surface-container-high border-outline-variant/15 text-white hover:border-outline-variant/30',
            )}
          >
            <Tag size={16} />
            <span className="text-on-surface-variant">Category:</span> {categoryLabel}
            <ChevronDown size={14} />
          </button>
          {openPopover === 'category' && (
            <div
              data-testid="filter-category-popover"
              className="absolute z-30 mt-2 left-0 min-w-[220px] max-h-72 overflow-y-auto bg-surface-container-highest border border-outline-variant/20 rounded-xl shadow-2xl p-2"
            >
              {CATEGORIES.map((c) => {
                const checked = filters.categories.includes(c);
                return (
                  <label
                    key={c}
                    data-testid={`filter-category-${c}`}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors',
                      checked ? 'bg-primary/10 text-primary' : 'text-white hover:bg-surface-container-high',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCategory(c)}
                      className="accent-primary"
                    />
                    {c}
                  </label>
                );
              })}
              {filters.categories.length > 0 && (
                <button
                  type="button"
                  data-testid="filter-category-clear"
                  onClick={() => onChange({ ...filters, categories: [] })}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-xs text-on-surface-variant hover:text-white hover:bg-surface-container-high transition-colors"
                >
                  Clear category selection
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          data-testid="toggle-show-deleted"
          onClick={onToggleShowDeleted}
          className={cn(
            'px-4 py-2 rounded-xl flex items-center gap-2 border text-sm font-medium transition-colors',
            showDeleted
              ? 'bg-error/10 border-error/30 text-error'
              : 'bg-surface-container-high border-outline-variant/15 text-white hover:border-outline-variant/30',
          )}
        >
          {showDeleted ? <EyeOff size={16} /> : <Eye size={16} />}
          {showDeleted ? 'Hide deleted' : 'Show deleted'}
        </button>

        {hasActiveFilter && (
          <button
            type="button"
            data-testid="filter-clear-all"
            onClick={onClear}
            className="px-3 py-2 rounded-xl flex items-center gap-1 text-sm text-on-surface-variant hover:text-white transition-colors"
          >
            <X size={14} />
            Clear filters
          </button>
        )}

        <button
          type="button"
          data-testid="filter-more-toggle"
          onClick={() => setMoreOpen((s) => !s)}
          className={cn(
            'ml-auto flex items-center gap-2 font-bold text-sm transition-opacity',
            moreOpen ? 'text-white' : 'text-primary hover:opacity-80',
          )}
        >
          <Filter size={16} />
          {moreOpen ? 'Hide filters' : 'More Filters'}
        </button>
      </div>

      {moreOpen && (
        <div
          data-testid="filter-more-panel"
          className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-surface-container-low border border-outline-variant/10"
        >
          <label className="block text-xs text-on-surface-variant">
            Status
            <select
              data-testid="filter-status"
              value={filters.status ?? ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  status: e.target.value === '' ? undefined : (e.target.value as RawTransactionStatus),
                })
              }
              className="mt-1 w-full bg-surface-container-low border border-outline-variant/15 rounded-lg px-2 py-1.5 text-sm text-white"
            >
              <option value="">Any status</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-on-surface-variant">
            Payee contains
            <input
              type="text"
              data-testid="filter-payee"
              value={filters.payeeContains}
              onChange={(e) => onChange({ ...filters, payeeContains: e.target.value })}
              placeholder="e.g. Costco"
              className="mt-1 w-full bg-surface-container-low border border-outline-variant/15 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>

          <label className="block text-xs text-on-surface-variant">
            Min amount ($)
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              data-testid="filter-amount-min"
              value={filters.amountMinDollars}
              onChange={(e) => onChange({ ...filters, amountMinDollars: e.target.value })}
              placeholder="0.00"
              className="mt-1 w-full bg-surface-container-low border border-outline-variant/15 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>

          <label className="block text-xs text-on-surface-variant">
            Max amount ($)
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              data-testid="filter-amount-max"
              value={filters.amountMaxDollars}
              onChange={(e) => onChange({ ...filters, amountMaxDollars: e.target.value })}
              placeholder="0.00"
              className="mt-1 w-full bg-surface-container-low border border-outline-variant/15 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>
      )}
    </>
  );
}

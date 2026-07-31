import { useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listPostableAccounts, extractProblemMessage, type BackendAccount } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { invalidateLedgerSurfaces } from '../lib/queryClient';
import {
  ManualEntryError,
  parseMoneyToMinor,
  submitManualEntry,
  type ManualEntryResult,
} from '../lib/manualEntry';
import { cn } from '../lib/utils';

interface AddManuallyProps {
  onCancel: () => void;
  onComplete: (result: ManualEntryResult) => void;
}

/** Today in the user's own timezone. `toISOString()` would be UTC and
 *  shows tomorrow's date to anyone east of Greenwich in the evening. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Record a purchase that has no receipt (#150) — the counterpart to
 * Capture's camera path, reached from the entry beneath its shutter row.
 *
 * Two stages on one screen: the transaction head is always visible, the
 * line item is collapsed behind a disclosure because most entries won't
 * want it. The item half is not decoration — it is what makes a
 * backfilled durable reachable from Things and its $/day amortization,
 * which was the entire motivating case in receipt-assistant#183 (a 2021
 * router reconstructed from a bank statement).
 */
export default function AddManually({ onCancel, onComplete }: AddManuallyProps) {
  const qc = useQueryClient();
  const uid = useId();

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: qk.postableAccounts,
    queryFn: listPostableAccounts,
  });

  const [payee, setPayee] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayLocal);
  const [amount, setAmount] = useState('');
  const [expenseIdRaw, setExpenseIdRaw] = useState('');
  const [paymentIdRaw, setPaymentIdRaw] = useState('');

  const [itemOpen, setItemOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemTax, setItemTax] = useState('');
  const [durable, setDurable] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Expense accounts are the "category"; assets and liabilities are the
  // "account" money left. Splitting on `type` rather than a name list
  // means a new account added in the backend shows up here for free.
  const { expenseAccounts, fundingAccounts } = useMemo(() => {
    const by = (t: BackendAccount['type'][]) =>
      accounts.filter((a) => t.includes(a.type));
    return {
      expenseAccounts: by(['expense']),
      fundingAccounts: by(['asset', 'liability']),
    };
  }, [accounts]);

  const expenseId =
    expenseIdRaw ||
    expenseAccounts.find((a) => a.name === 'Shopping')?.id ||
    expenseAccounts[0]?.id ||
    '';
  const paymentId =
    paymentIdRaw ||
    fundingAccounts.find((a) => a.name === 'Credit Card')?.id ||
    fundingAccounts[0]?.id ||
    '';

  const mutation = useMutation({
    mutationFn: submitManualEntry,
    onSuccess: (result) => {
      invalidateLedgerSurfaces();
      // A durable adds a Things row and moves catalog aggregates, neither
      // of which the ledger fan-out covers.
      qc.invalidateQueries({ queryKey: qk.ownedItemsExpanded });
      qc.invalidateQueries({ queryKey: ['products'] });
      onComplete(result);
    },
  });

  const submit = () => {
    const errs: Record<string, string> = {};

    if (!payee.trim()) errs.payee = 'Who did you pay?';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) errs.date = 'Pick a date.';

    const totalMinor = parseMoneyToMinor(amount);
    if (totalMinor === null) errs.amount = 'Enter an amount, like 208.04';
    else if (totalMinor <= 0) errs.amount = 'Must be more than zero.';

    if (!expenseId) errs.expense = 'Pick a category.';
    if (!paymentId) errs.payment = 'Pick an account.';

    // The item section only has to validate when the user actually put
    // something in it — an expanded-but-empty section is just an
    // abandoned disclosure and shouldn't block a head-only entry.
    let item: Parameters<typeof submitManualEntry>[0]['item'];
    const itemTouched =
      itemOpen &&
      Boolean(itemName.trim() || itemAmount.trim() || itemTax.trim() || durable);
    if (itemTouched) {
      const lineTotalMinor = parseMoneyToMinor(itemAmount);
      const taxMinor = itemTax.trim() ? parseMoneyToMinor(itemTax) : null;
      if (!itemName.trim()) errs.itemName = 'Name the item.';
      if (lineTotalMinor === null || lineTotalMinor <= 0) {
        errs.itemAmount = 'Enter the item amount.';
      }
      if (itemTax.trim() && taxMinor === null) errs.itemTax = "That's not a number.";
      if (!errs.itemName && !errs.itemAmount && !errs.itemTax) {
        item = {
          name: itemName.trim(),
          lineTotalMinor: lineTotalMinor as number,
          taxMinor,
          durable,
        };
      }
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    mutation.mutate({
      occurredOn,
      payee: payee.trim(),
      totalMinor: totalMinor as number,
      expenseAccountId: expenseId,
      paymentAccountId: paymentId,
      expenseAccountName: expenseAccounts.find((a) => a.id === expenseId)?.name,
      item,
    });
  };

  const failure = mutation.error;
  const partialTxnId =
    failure instanceof ManualEntryError ? failure.partial.transactionId : undefined;

  return (
    // Plain padding, no `-mx-4 … px-4` cancellation. That pattern assumes an
    // ancestor with matching padding, and this route (like /add) hangs off
    // the root, not `_shell` — so the negative margin has nothing to cancel:
    // it just pushes the box 16px wider than the viewport (a real 430-vs-414
    // horizontal overscroll) and leaves the text flush against the edge.
    <div className="flex min-h-[100dvh] flex-col bg-[var(--color-paper)] px-4 pt-4 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col pb-10">
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-surface)] text-[15px]"
          >
            ←
          </button>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] leading-none text-[var(--color-ink-muted)]">
            manual entry
          </span>
          <span aria-hidden="true" className="w-9" />
        </div>

        <header className="pt-7 pb-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] leading-none text-[var(--color-accent)]">
            no receipt needed
          </p>
          <h1 className="mt-2 font-display text-3xl font-medium leading-none tracking-tight">
            Record a purchase
          </h1>
          <p className="mt-2 font-display text-[13px] italic leading-snug text-[var(--color-ink-soft)]">
            For the ones the paper is long gone on.
          </p>
        </header>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <fieldset
            disabled={mutation.isPending}
            className="space-y-3 rounded-[var(--radius-card)] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] p-4 disabled:opacity-60"
          >
            <Field label="merchant" htmlFor={`${uid}-payee`} error={errors.payee}>
              <input
                id={`${uid}-payee`}
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="Newegg"
                autoComplete="off"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="date" htmlFor={`${uid}-date`} error={errors.date}>
                <input
                  id={`${uid}-date`}
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  className={cn(inputCls, 'font-mono text-[13px]')}
                />
              </Field>
              <Field label="amount" htmlFor={`${uid}-amount`} error={errors.amount}>
                <MoneyInput
                  id={`${uid}-amount`}
                  value={amount}
                  onChange={setAmount}
                  placeholder="208.04"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="category" htmlFor={`${uid}-expense`} error={errors.expense}>
                <Select
                  id={`${uid}-expense`}
                  value={expenseId}
                  onChange={setExpenseIdRaw}
                  options={expenseAccounts}
                  loading={accountsLoading}
                />
              </Field>
              <Field label="account" htmlFor={`${uid}-payment`} error={errors.payment}>
                <Select
                  id={`${uid}-payment`}
                  value={paymentId}
                  onChange={setPaymentIdRaw}
                  options={fundingAccounts}
                  loading={accountsLoading}
                />
              </Field>
            </div>
          </fieldset>

          {/* ── Optional line item ─────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setItemOpen((v) => !v)}
            aria-expanded={itemOpen}
            className="flex w-full items-center gap-2 px-1 py-1 text-left"
          >
            <span
              aria-hidden="true"
              className={cn(
                'font-mono text-[10px] text-[var(--color-accent)] transition-transform duration-150',
                itemOpen && 'rotate-90',
              )}
            >
              ▸
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
              add line item
            </span>
            <span className="font-display text-[12px] italic text-[var(--color-ink-faint)]">
              optional
            </span>
          </button>

          {itemOpen && (
            <fieldset
              disabled={mutation.isPending}
              className="space-y-3 rounded-[var(--radius-card)] border-[0.5px] border-[var(--color-rule)] bg-[var(--color-surface)] p-4 disabled:opacity-60"
            >
              <Field label="item" htmlFor={`${uid}-item`} error={errors.itemName}>
                <input
                  id={`${uid}-item`}
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="ASUS RT-AX92U"
                  autoComplete="off"
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="item amount"
                  htmlFor={`${uid}-item-amount`}
                  error={errors.itemAmount}
                >
                  <MoneyInput
                    id={`${uid}-item-amount`}
                    value={itemAmount}
                    onChange={setItemAmount}
                    placeholder="189.99"
                  />
                </Field>
                <Field label="tax" htmlFor={`${uid}-item-tax`} error={errors.itemTax}>
                  <MoneyInput
                    id={`${uid}-item-tax`}
                    value={itemTax}
                    onChange={setItemTax}
                    placeholder="18.05"
                  />
                </Field>
              </div>

              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-[10px] border-[0.5px] p-3 transition-colors',
                  durable
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-rule-soft)] bg-[var(--color-paper)]',
                )}
              >
                <input
                  type="checkbox"
                  checked={durable}
                  onChange={(e) => setDurable(e.target.checked)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[0.5px] font-mono text-[11px] leading-none',
                    durable
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-paper)]'
                      : 'border-[var(--color-rule)] bg-[var(--color-surface)] text-transparent',
                  )}
                >
                  ✓
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[13.5px] font-medium leading-tight">
                    This is a durable good
                  </span>
                  <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                    keeps it in things · amortized to a $/day
                  </span>
                </span>
              </label>
            </fieldset>
          )}

          {failure && (
            <div className="rounded-[12px] border-[0.5px] border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3.5 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-accent-deep)]">
                {partialTxnId ? 'partly saved' : "couldn't save"}
              </p>
              <p className="mt-1 font-display text-[13px] leading-snug text-[var(--color-ink)]">
                {extractProblemMessage(failure)}
              </p>
              {partialTxnId && (
                <p className="mt-1.5 font-display text-[12.5px] italic leading-snug text-[var(--color-ink-soft)]">
                  The transaction was created; the rest didn't finish. Check the
                  ledger before trying again so you don't record it twice.
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="block w-full rounded-[14px] bg-[var(--color-ink)] py-3.5 text-center font-display text-[15px] font-medium text-[var(--color-paper)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending ? 'Recording…' : 'Record it'}
            <span className="block font-mono text-[8.5px] uppercase tracking-[0.12em] text-[var(--color-paper-fold)]">
              {durable && itemOpen
                ? 'ledger · catalog · things'
                : 'straight into the ledger'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-[10px] border-[0.5px] border-[var(--color-rule-soft)] bg-[var(--color-paper)] px-3 py-2 font-display text-[14px] outline-none transition-colors focus:border-[var(--color-accent)] placeholder:font-mono placeholder:text-[11px] placeholder:text-[var(--color-ink-faint)]';

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="block font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]"
      >
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {error && (
        <p role="alert" className="mt-1 font-display text-[11.5px] italic text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Money field. `type="text"` with `inputMode="decimal"`, never
 * `type="number"`: number inputs render spinner arrows nobody taps,
 * swallow the value on a stray scroll wheel, and on several Android
 * keyboards hide the decimal point entirely.
 */
function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--color-ink-faint)]"
      >
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputCls, 'pl-7 font-mono text-[13px] tabular-nums')}
      />
    </div>
  );
}

/** Native `<select>` — on a phone it opens the platform picker, which
 *  beats any custom listbox for a 7-item list. Appearance stripped so it
 *  matches the text inputs, with a text-glyph chevron. */
function Select({
  id,
  value,
  onChange,
  options,
  loading,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: BackendAccount[];
  loading: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading || options.length === 0}
        className={cn(inputCls, 'appearance-none pr-7 disabled:opacity-60')}
      >
        {loading && <option value="">loading…</option>}
        {!loading && options.length === 0 && <option value="">none available</option>}
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[var(--color-ink-muted)]"
      >
        ▾
      </span>
    </div>
  );
}

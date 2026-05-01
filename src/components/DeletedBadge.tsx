import React from 'react';
import { Trash2 } from 'lucide-react';

interface DeletedBadgeProps {
  /** ISO date-time string from the backend `deleted_at` column. */
  deletedAt: string | null | undefined;
}

function formatDeletedAt(iso: string | null | undefined): string {
  if (!iso) return 'Deleted';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Deleted';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `Deleted ${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return 'Deleted';
  }
}

export default function DeletedBadge({ deletedAt }: DeletedBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-error/10 text-error text-[11px] font-bold uppercase tracking-wider">
      <Trash2 size={12} />
      {formatDeletedAt(deletedAt)}
    </span>
  );
}

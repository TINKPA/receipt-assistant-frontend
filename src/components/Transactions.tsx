import React, { useEffect, useState } from 'react';
import { TrendingDown, Filter, Utensils, Plane, Zap, Film, Landmark, ShoppingBag, Car, Loader2 } from 'lucide-react';
import { fetchTransactions } from '../lib/api';
import { cn } from '../lib/utils';
import type { Transaction } from '../types';

interface TransactionsProps {
  onSelectReceipt?: (receiptId: string) => void;
}

export default function Transactions({ onSelectReceipt }: TransactionsProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTransactions({ limit: 50 })
      .then(setTransactions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalExpenses = transactions
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  const getIcon = (category: string) => {
    switch (category) {
      case 'Dining': return <Utensils size={18} />;
      case 'Transport': return <Car size={18} />;
      case 'Utilities': return <Zap size={18} />;
      case 'Fun': return <Film size={18} />;
      case 'Income': return <Landmark size={18} />;
      case 'Shopping': return <ShoppingBag size={18} />;
      case 'Travel': return <Plane size={18} />;
      default: return <Landmark size={18} />;
    }
  };

  const getColorClass = (category: string) => {
    switch (category) {
      case 'Dining': return 'text-primary border-primary/20';
      case 'Transport': return 'text-tertiary border-tertiary/20';
      case 'Utilities': return 'text-secondary border-secondary/20';
      case 'Fun': return 'text-error border-error/20';
      case 'Income': return 'text-primary border-primary/40 bg-primary-container';
      case 'Shopping': return 'text-secondary border-secondary/20';
      case 'Travel': return 'text-tertiary border-tertiary/20';
      default: return 'text-on-surface-variant border-outline-variant/20';
    }
  };

  const getBadgeClass = (category: string) => {
    switch (category) {
      case 'Dining': return 'bg-primary/10 text-primary';
      case 'Transport': return 'bg-tertiary/10 text-tertiary';
      case 'Utilities': return 'bg-secondary/10 text-secondary';
      case 'Fun': return 'bg-error/10 text-error';
      case 'Income': return 'bg-primary/20 text-primary';
      case 'Shopping': return 'bg-secondary/10 text-secondary';
      case 'Travel': return 'bg-tertiary/10 text-tertiary';
      default: return 'bg-surface-container-highest text-on-surface-variant';
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-extrabold text-white font-headline tracking-tight">Transaction History</h2>
          <p className="text-on-surface-variant mt-2 font-inter">Manage and monitor your digital private banking activity.</p>
        </div>

        <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 flex items-center gap-6">
          <div className="p-3 bg-error-container/20 rounded-full">
            <TrendingDown className="text-error" size={24} />
          </div>
          <div>
            <p className="text-on-surface-variant text-xs font-medium uppercase tracking-widest mb-1">Total Expenses</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white font-headline">
                {totalExpenses.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </span>
              <span className="text-on-surface-variant text-xs">{transactions.length} transactions</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="bg-surface-container-high px-4 py-2 rounded-xl flex items-center gap-3 border border-outline-variant/15 text-sm font-medium text-white">
          <span className="text-on-surface-variant">Date:</span> All Time
        </div>
        <div className="bg-surface-container-high px-4 py-2 rounded-xl flex items-center gap-3 border border-outline-variant/15 text-sm font-medium text-white">
          <span className="text-on-surface-variant">Category:</span> All
        </div>
        <button className="ml-auto flex items-center gap-2 text-primary font-bold text-sm hover:opacity-80 transition-opacity">
          <Filter size={16} />
          More Filters
        </button>
      </div>

      <div className="glass-panel border border-outline-variant/10 rounded-xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={32} />
            <span className="ml-3 text-on-surface-variant">Loading transactions...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20 text-error">{error}</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">No transactions yet. Upload a receipt to get started.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Description</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Category</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Date</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Payment</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline">Status</th>
                <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest font-headline text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => tx.status !== 'Processing' && onSelectReceipt?.(tx.id)}
                  className={cn(
                    "hover:bg-surface-container-high/30 transition-colors group",
                    tx.status === 'Processing' ? 'cursor-default opacity-70' : 'cursor-pointer'
                  )}
                >
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center border",
                        tx.status === 'Processing' ? 'text-tertiary border-tertiary/20 animate-pulse' : getColorClass(tx.category)
                      )}>
                        {tx.status === 'Processing' ? <Loader2 className="animate-spin" size={18} /> : getIcon(tx.category)}
                      </div>
                      <span className={cn(
                        "font-bold transition-colors",
                        tx.status === 'Processing' ? 'text-on-surface-variant' : 'text-white group-hover:text-primary'
                      )}>
                        {tx.description}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    {tx.status !== 'Processing' && (
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider",
                        getBadgeClass(tx.category)
                      )}>
                        {tx.category}
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-6 text-sm text-on-surface-variant">{tx.status === 'Processing' ? '--' : tx.date}</td>
                  <td className="px-8 py-6 text-sm text-on-surface-variant">{tx.status === 'Processing' ? '--' : tx.paymentMethod}</td>
                  <td className="px-8 py-6">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      tx.status === 'Processing' ? 'bg-tertiary/10 text-tertiary animate-pulse' :
                      tx.status === 'Verified' ? 'bg-primary/10 text-primary' :
                      tx.status === 'Pending' ? 'bg-error/10 text-error' :
                      'bg-tertiary/10 text-tertiary'
                    )}>
                      {tx.status}
                    </span>
                  </td>
                  <td className={cn(
                    "px-8 py-6 text-right font-headline font-bold",
                    tx.status === 'Processing' ? 'text-on-surface-variant' :
                    tx.amount > 0 ? "text-primary neon-glow-primary" : "text-white"
                  )}>
                    {tx.status === 'Processing' ? '--' : (
                      <>{tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

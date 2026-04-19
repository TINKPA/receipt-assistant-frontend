import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Wallet,
  ArrowRight,
  Sparkles,
  Utensils,
  Plane,
  Car,
  ShoppingBag,
  Zap,
  MoreHorizontal,
  Loader2
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { fetchTransactions, fetchSummary, type SpendingSummary } from '../lib/api';
import { cn } from '../lib/utils';
import type { Transaction } from '../types';

const CHART_COLORS = ['#4edea3', '#d0bcff', '#7bd0ff', '#ffb4ab', '#a8c7fa'];

interface DashboardProps {
  onSelectReceipt?: (receiptId: string) => void;
}

export default function Dashboard({ onSelectReceipt }: DashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<SpendingSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchTransactions({ limit: 5 }),
      fetchSummary(),
    ])
      .then(([txs, sum]) => {
        setTransactions(txs);
        setSummary(sum);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalSpent = summary.reduce((s, c) => s + Number(c.total_spent), 0);
  const totalCount = summary.reduce((s, c) => s + c.count, 0);

  const spendingData = summary.map((s, i) => ({
    name: s.category ?? 'other',
    value: Number(s.total_spent),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const getIcon = (category: string) => {
    switch (category) {
      case 'Dining': return <Utensils size={18} />;
      case 'Transport': return <Car size={18} />;
      case 'Shopping': return <ShoppingBag size={18} />;
      case 'Travel': return <Plane size={18} />;
      case 'Utilities': return <Zap size={18} />;
      default: return <Utensils size={18} />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <section>
        <h2 className="text-on-surface-variant font-medium text-sm mb-4 font-label">Financial Overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface-container-low rounded-xl p-8 flex flex-col justify-between relative overflow-hidden group border border-outline-variant/5">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Wallet size={160} className="text-primary" />
            </div>
            <div>
              <p className="text-on-surface-variant text-sm font-label mb-1">Total Spending</p>
              {loading ? (
                <Loader2 className="animate-spin text-primary mt-2" size={32} />
              ) : (
                <>
                  <h3 className="text-5xl font-extrabold font-headline tracking-tight text-white neon-glow-primary">
                    ${Math.floor(totalSpent).toLocaleString()}.<span className="text-2xl opacity-50">{(totalSpent % 1).toFixed(2).slice(2)}</span>
                  </h3>
                  <div className="flex items-center gap-2 mt-4">
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-xs font-bold flex items-center gap-1">
                      <TrendingUp size={14} />
                      {totalCount} receipts
                    </span>
                    <span className="text-on-surface-variant text-xs">processed via AI</span>
                  </div>
                </>
              )}
            </div>
            <div className="mt-12 flex gap-12">
              {summary.slice(0, 3).map((s, i) => (
                <div key={i}>
                  <p className="text-on-surface-variant text-[10px] uppercase tracking-wider mb-1">{s.category ?? 'Other'}</p>
                  <p className="text-lg font-bold text-white">${Number(s.total_spent).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-high rounded-xl p-6 flex flex-col justify-between border border-outline-variant/5">
            <div className="flex justify-between items-start mb-4">
              <h4 className="text-sm font-bold text-white">Spending by Category</h4>
              <button className="text-on-surface-variant hover:text-white transition-colors">
                <MoreHorizontal size={18} />
              </button>
            </div>
            {spendingData.length > 0 ? (
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={spendingData}>
                    <Bar
                      dataKey="value"
                      fill="#4edea3"
                      radius={[4, 4, 0, 0]}
                    >
                      {spendingData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} fillOpacity={0.7} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-on-surface-variant text-sm">No data yet</div>
            )}
            <div className="flex justify-between mt-4 text-[10px] text-on-surface-variant uppercase font-bold">
              {spendingData.slice(0, 4).map((s, i) => (
                <span key={i}>{s.name}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Monthly Spending Pie */}
        <div className="lg:col-span-5 bg-surface-container-low rounded-xl p-6 border border-outline-variant/5">
          <div className="flex justify-between items-center mb-8">
            <h4 className="font-headline font-bold text-white">Spending Breakdown</h4>
          </div>
          <div className="flex items-center gap-8">
            <div className="relative w-36 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={spendingData}
                    innerRadius={50}
                    outerRadius={65}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {spendingData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[10px] text-on-surface-variant uppercase">Total</p>
                <p className="text-lg font-bold text-white">${(totalSpent / 1000).toFixed(1)}k</p>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              {spendingData.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-on-surface-variant">{item.name}</span>
                  </div>
                  <span className="text-sm font-bold text-white">${item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-7 bg-surface-container-low rounded-xl p-6 border border-outline-variant/5">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-headline font-bold text-white">Recent Activity</h4>
            <button className="text-xs font-bold text-primary hover:underline">View All</button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : (
            <div className="space-y-4">
              {transactions.slice(0, 5).map((tx) => (
                <div
                  key={tx.id}
                  onClick={() => tx.status !== 'Processing' && onSelectReceipt?.(tx.id)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl transition-colors group",
                    tx.status === 'Processing' ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-surface-container-high'
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center transition-all",
                      tx.status === 'Processing'
                        ? 'text-tertiary animate-pulse'
                        : 'text-primary group-hover:bg-primary group-hover:text-on-primary'
                    )}>
                      {tx.status === 'Processing' ? <Loader2 className="animate-spin" size={18} /> : getIcon(tx.category)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{tx.description}</p>
                      <p className="text-xs text-on-surface-variant">
                        {tx.status === 'Processing' ? 'Processing...' : `${tx.category} • ${tx.date}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-sm font-bold",
                      tx.status === 'Processing' ? 'text-on-surface-variant' :
                      tx.amount > 0 ? "text-primary" : "text-white"
                    )}>
                      {tx.status === 'Processing' ? '--' : (
                        <>{tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</>
                      )}
                    </p>
                    <p className={cn("text-[10px]",
                      tx.status === 'Processing' ? 'text-tertiary animate-pulse' :
                      tx.status === 'Verified' ? 'text-primary' :
                      tx.status === 'Pending' ? 'text-error' : 'text-tertiary'
                    )}>{tx.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Portfolio Highlights */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1 glass-panel rounded-xl p-6 border border-white/5">
          <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-4">Receipts Processed</p>
          <p className="text-3xl font-bold text-white">{totalCount}</p>
          <p className="text-xs text-on-surface-variant mt-2">via Claude AI extraction</p>
        </div>

        <div className="md:col-span-1 glass-panel rounded-xl p-6 border border-white/5">
          <Sparkles className="text-secondary mb-2" size={24} />
          <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-1">AI Insights</p>
          <p className="text-sm font-medium text-white leading-relaxed">
            {summary.length > 0
              ? `Top category: ${summary[0].category} ($${Number(summary[0].total_spent).toLocaleString()})`
              : 'Upload receipts to get insights'}
          </p>
        </div>

        <div className="md:col-span-2 bg-gradient-to-br from-surface-container-high to-surface-container-low rounded-xl p-6 flex items-center justify-between group cursor-pointer hover:border-primary/20 border border-transparent transition-all">
          <div>
            <h4 className="text-lg font-bold text-white mb-1">Langfuse Monitoring</h4>
            <p className="text-sm text-on-surface-variant">Every AI extraction is traced and monitored.</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <ArrowRight size={20} />
          </div>
        </div>
      </section>
    </div>
  );
}

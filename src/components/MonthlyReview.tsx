import React from 'react';
import { TrendingDown, Lightbulb, Utensils, Home, Film, ShoppingBag, Zap, Repeat } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar } from 'recharts';
import { cn } from '../lib/utils';

const WEEKLY_OUTFLOW = [
  { week: 'Week 1', value: 60 },
  { week: 'Week 2', value: 45 },
  { week: 'Week 3', value: 75 },
  { week: 'Week 4', value: 90 },
  { week: 'Week 5', value: 30 },
  { week: 'Week 6', value: 55 },
  { week: 'Week 7', value: 65 },
  { week: 'Week 8', value: 40 },
];

const CATEGORY_COMPARISON = [
  { name: 'Dining', current: 500, previous: 450, icon: Utensils, change: '+11.1% overspend', isBad: true },
  { name: 'Housing', current: 1800, previous: 1800, icon: Home, change: '0% change', isBad: false },
  { name: 'Entertainment', current: 210, previous: 340, icon: Film, change: '-38.2% saving', isBad: false },
  { name: 'Shopping', current: 420, previous: 510, icon: ShoppingBag, change: '-17.6% saving', isBad: false },
];

export default function MonthlyReview() {
  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <header>
        <h2 className="text-4xl font-extrabold font-headline text-white tracking-tight">Monthly Financial Performance</h2>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-on-surface-variant font-medium">Review for October 2023</span>
          <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
            <TrendingDown size={14} />
            -5.2% spending
          </span>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* Comparison Spotlight */}
        <div className="col-span-8 bg-surface-container-low rounded-xl p-8 relative overflow-hidden border border-outline-variant/5">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h3 className="text-on-surface-variant text-sm font-medium uppercase tracking-widest">Total Monthly Outflow</h3>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold font-headline text-white mt-2">$4,280.00</span>
                <span className="text-on-surface-variant text-sm font-medium">vs $4,514.75 last month</span>
              </div>
            </div>
            <div className="glass-panel p-4 rounded-xl border border-outline-variant/10">
              <TrendingDown className="text-primary" size={32} />
            </div>
          </div>
          
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={WEEKLY_OUTFLOW}>
                <Bar 
                  dataKey="value" 
                  fill="#4edea3" 
                  radius={[4, 4, 0, 0]}
                  fillOpacity={0.1}
                />
                <Bar 
                  dataKey="value" 
                  fill="#4edea3" 
                  radius={[4, 4, 0, 0]}
                  className="filter drop-shadow-[0_0_8px_rgba(78,222,163,0.3)]"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-[10px] text-on-surface-variant/50 font-bold tracking-tighter uppercase mt-4">
            <span>Week 1</span>
            <span>Week 2</span>
            <span>Week 3</span>
            <span>Week 4</span>
          </div>
        </div>

        {/* Smart Suggestions */}
        <div className="col-span-4 flex flex-col gap-6">
          <div className="bg-gradient-to-br from-secondary-container/20 to-surface-container-high rounded-xl p-6 border border-secondary/10">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="text-secondary fill-secondary/20" size={20} />
              <h3 className="font-bold text-white">Smart Suggestions</h3>
            </div>
            <div className="space-y-4">
              <div className="bg-surface-container-lowest p-4 rounded-xl border-l-4 border-primary">
                <p className="text-sm font-semibold text-white">Potential Savings: $120</p>
                <p className="text-xs text-on-surface-variant mt-1">By reducing subscription costs for 3 unused services found in your history.</p>
              </div>
              <div className="bg-surface-container-lowest p-4 rounded-xl border-l-4 border-tertiary">
                <p className="text-sm font-semibold text-white">Optimize Grocery Budget</p>
                <p className="text-xs text-on-surface-variant mt-1">Switching to bulk purchases for non-perishables could save $45 next month.</p>
              </div>
            </div>
          </div>
          <div className="bg-surface-container-high rounded-xl p-6 flex flex-col items-center justify-center text-center border border-outline-variant/5">
            <p className="text-xs text-on-surface-variant font-medium mb-2">SAVINGS RATE</p>
            <span className="text-3xl font-black font-headline text-tertiary">22.5%</span>
            <p className="text-[10px] text-on-surface-variant mt-1">+3.1% from Q3 average</p>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="col-span-12 bg-surface-container-low rounded-xl p-8 border border-outline-variant/5">
          <div className="flex justify-between items-end mb-10">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Where your money went this month</h3>
              <p className="text-on-surface-variant text-sm">Category breakdown comparison vs. previous period</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>
                <span className="text-xs text-on-surface-variant font-medium">This Month</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-surface-container-highest"></div>
                <span className="text-xs text-on-surface-variant font-medium">Last Month</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10">
            {CATEGORY_COMPARISON.map((cat, i) => (
              <div key={i} className="space-y-3">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <cat.icon className="text-primary" size={18} />
                    <span className="text-sm font-bold text-white">{cat.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-white">${cat.current.toLocaleString()}</span>
                    <span className="text-xs text-on-surface-variant ml-2">vs ${cat.previous.toLocaleString()}</span>
                  </div>
                </div>
                <div className="relative h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                  <div 
                    className="absolute h-full bg-primary rounded-full z-10" 
                    style={{ width: `${(cat.current / Math.max(cat.current, cat.previous)) * 100}%` }} 
                  />
                  <div 
                    className="absolute h-full bg-white/10 rounded-full" 
                    style={{ width: `${(cat.previous / Math.max(cat.current, cat.previous)) * 100}%` }} 
                  />
                </div>
                <div className="flex justify-end">
                  <span className={cn("text-[10px] font-bold", cat.isBad ? "text-error" : "text-primary")}>
                    {cat.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Flagged Transactions */}
        <div className="col-span-12 bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/5">
          <div className="p-8 border-b border-outline-variant/10">
            <h3 className="font-bold text-white">Flagged Transactions</h3>
          </div>
          <div className="divide-y divide-outline-variant/10">
            <div className="flex items-center justify-between p-6 hover:bg-surface-container-high transition-colors cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-surface-container-highest flex items-center justify-center">
                  <Zap className="text-primary" size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">High Energy Usage Alert</p>
                  <p className="text-[10px] text-on-surface-variant">Metro Power - Oct 14</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white">$245.80</p>
                <p className="text-[10px] text-error font-bold">+20% vs Avg</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-6 hover:bg-surface-container-high transition-colors cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-surface-container-highest flex items-center justify-center">
                  <Repeat className="text-primary" size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Streamline Plus Yearly</p>
                  <p className="text-[10px] text-on-surface-variant">Digital Services - Oct 02</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white">$119.99</p>
                <p className="text-[10px] text-tertiary font-bold">New Charge</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

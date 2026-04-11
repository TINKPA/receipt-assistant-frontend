import React from 'react';
import { TrendingUp, Landmark, Building2, Plane, LineChart, Award, Home, Filter } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { YEARLY_GROWTH_DATA, CATEGORY_BREAKDOWN, ACHIEVEMENTS, YEARLY_SUMMARY } from '../constants';
import { cn } from '../lib/utils';

export default function YearlyReview() {
  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <section className="flex flex-col md:flex-row justify-between items-end gap-6 pb-4">
        <div>
          <span className="text-primary font-bold tracking-widest text-xs uppercase mb-2 block">Executive Summary</span>
          <h2 className="text-4xl font-extrabold font-headline text-white">Year in Review</h2>
          <p className="text-on-surface-variant mt-2 text-sm">Wealth trajectory and fiscal milestones for the fiscal year 2025.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-surface-container-high text-primary font-semibold px-6 py-2.5 rounded-xl text-sm transition-all hover:bg-surface-container-highest">Export Report</button>
          <button className="bg-gradient-to-br from-primary to-on-primary-container text-on-primary font-bold px-6 py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-primary/10">Full Audit</button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-2 glass-panel p-8 rounded-xl relative overflow-hidden flex flex-col justify-between min-h-[220px] border border-outline-variant/5">
          <div className="z-10">
            <p className="text-on-surface-variant text-sm font-medium mb-1">Total Saved in 2025</p>
            <h3 className="text-5xl font-black font-headline text-white tracking-tighter">$142,580.00</h3>
          </div>
          <div className="z-10 flex items-center gap-3 mt-4">
            <div className="flex items-center text-primary bg-primary/10 px-3 py-1 rounded-full text-xs font-bold">
              <TrendingUp size={14} className="mr-1" /> +18.4%
            </div>
            <span className="text-on-surface-variant text-xs italic">from previous year</span>
          </div>
          <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-primary/10 blur-[60px] rounded-full"></div>
          <Landmark className="absolute right-8 top-8 text-primary/20" size={64} />
        </div>

        <div className="glass-panel p-6 rounded-xl flex flex-col justify-between border border-outline-variant/5">
          <div>
            <p className="text-on-surface-variant text-xs uppercase tracking-wider font-bold mb-4">Total Income</p>
            <h4 className="text-2xl font-bold font-headline text-white">$482,100</h4>
          </div>
          <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden mt-6">
            <div className="h-full bg-primary w-[85%] rounded-full shadow-[0_0_10px_rgba(78,222,163,0.3)]"></div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-xl flex flex-col justify-between border border-outline-variant/5">
          <div>
            <p className="text-on-surface-variant text-xs uppercase tracking-wider font-bold mb-4">Annual Spending</p>
            <h4 className="text-2xl font-bold font-headline text-white">$339,520</h4>
          </div>
          <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden mt-6">
            <div className="h-full bg-tertiary w-[70%] rounded-full shadow-[0_0_10px_rgba(123,208,255,0.3)]"></div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel p-8 rounded-xl border border-outline-variant/5">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h3 className="text-lg font-bold font-headline text-white">Yearly Growth</h3>
              <p className="text-on-surface-variant text-xs">Net worth progression throughout 2025</p>
            </div>
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-on-surface-variant">
                <span className="w-2 h-2 rounded-full bg-primary"></span> Assets
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-on-surface-variant">
                <span className="w-2 h-2 rounded-full bg-secondary"></span> Projections
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={YEARLY_GROWTH_DATA}>
                <Bar dataKey="assets" radius={[4, 4, 0, 0]}>
                  {YEARLY_GROWTH_DATA.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={index === YEARLY_GROWTH_DATA.length - 1 ? '#4edea3' : '#131b2e'} 
                      fillOpacity={index === YEARLY_GROWTH_DATA.length - 1 ? 1 : 0.5}
                      className={index === YEARLY_GROWTH_DATA.length - 1 ? "filter drop-shadow-[0_0_15px_rgba(78,222,163,0.5)]" : ""}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-[10px] text-on-surface-variant/40 font-bold tracking-widest mt-4">
            {YEARLY_GROWTH_DATA.map(d => <span key={d.month}>{d.month}</span>)}
          </div>
        </div>

        <div className="glass-panel p-8 rounded-xl flex flex-col border border-outline-variant/5">
          <h3 className="text-lg font-bold font-headline text-white mb-1">Category Breakdown (Yearly)</h3>
          <p className="text-on-surface-variant text-xs mb-8">Top areas of expenditure</p>
          <div className="space-y-6 flex-1">
            {CATEGORY_BREAKDOWN.map((cat, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface font-medium flex items-center gap-2">
                    {cat.name === 'Real Estate' ? <Building2 size={18} className="text-primary" /> : 
                     cat.name.includes('Travel') ? <Plane size={18} className="text-secondary" /> : 
                     <LineChart size={18} className="text-tertiary" />}
                    {cat.name}
                  </span>
                  <span className="text-white font-bold">${cat.amount.toLocaleString()}</span>
                </div>
                <div className="h-2 w-full bg-surface-container-low rounded-full">
                  <div 
                    className={cn("h-full rounded-full", cat.color === 'primary' ? 'bg-primary' : cat.color === 'secondary' ? 'bg-secondary' : 'bg-tertiary')} 
                    style={{ width: `${cat.percentage}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 pt-6 border-t border-outline-variant/10">
            <button className="w-full text-center text-xs text-on-surface-variant font-bold hover:text-primary transition-colors">VIEW ALL CATEGORIES</button>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold font-headline text-white">Top Achievements</h3>
          <div className="h-[1px] flex-1 mx-6 bg-outline-variant/20"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {ACHIEVEMENTS.map((ach, i) => (
            <div key={i} className="bg-surface-container-low p-6 rounded-xl border-l-4 border-primary shadow-lg hover:translate-y-[-4px] transition-all duration-300 border-outline-variant/5">
              <div className="flex justify-between items-start mb-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", ach.color === 'primary' ? 'bg-primary/10 text-primary' : ach.color === 'tertiary' ? 'bg-tertiary/10 text-tertiary' : 'bg-secondary/10 text-secondary')}>
                  {ach.icon === 'workspace_premium' ? <Award size={20} /> : ach.icon === 'trending_up' ? <TrendingUp size={20} /> : <Home size={20} />}
                </div>
                <span className="text-[10px] text-on-surface-variant font-bold">{ach.date}</span>
              </div>
              <h4 className="text-white font-bold text-lg leading-tight">{ach.title}</h4>
              <p className="text-on-surface-variant text-sm mt-2">{ach.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-xl overflow-hidden border border-outline-variant/5">
        <div className="px-8 py-6 flex justify-between items-center border-b border-outline-variant/10">
          <h3 className="text-lg font-bold font-headline text-white">Yearly Transaction Summary</h3>
          <div className="flex items-center gap-4">
            <button className="text-on-surface-variant hover:text-white text-xs font-bold transition-all">ALL QUARTERS</button>
            <Filter className="text-on-surface-variant" size={18} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-black bg-surface-container-high/30">
                <th className="px-8 py-4">Quarter</th>
                <th className="px-8 py-4 text-right">Inflow</th>
                <th className="px-8 py-4 text-right">Outflow</th>
                <th className="px-8 py-4 text-right">Net Savings</th>
                <th className="px-8 py-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {YEARLY_SUMMARY.map((row, i) => (
                <tr key={i} className="hover:bg-surface-container-high/20 transition-colors">
                  <td className="px-8 py-5 text-sm font-bold text-white">{row.quarter}</td>
                  <td className="px-8 py-5 text-sm text-right text-primary font-medium">${row.inflow.toLocaleString()}</td>
                  <td className="px-8 py-5 text-sm text-right text-on-surface-variant">${row.outflow.toLocaleString()}</td>
                  <td className="px-8 py-5 text-sm text-right text-white font-bold">${row.netSavings.toLocaleString()}</td>
                  <td className="px-8 py-5 text-right">
                    <span className={cn(
                      "px-2 py-1 text-[10px] font-bold rounded-full",
                      row.status === 'SURPLUS' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'
                    )}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

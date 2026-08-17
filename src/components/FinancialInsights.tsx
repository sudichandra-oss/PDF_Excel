import React, { useMemo } from 'react';
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Layers,
  CreditCard
} from 'lucide-react';
import { TransactionRow } from '../types';

interface FinancialInsightsProps {
  transactions: TransactionRow[];
  currencySymbol?: string;
}

export const FinancialInsights: React.FC<FinancialInsightsProps> = ({
  transactions,
  currencySymbol = '₹',
}) => {
  // Monthly Breakdown
  const monthlyData = useMemo(() => {
    const months: Record<string, { debits: number; credits: number; count: number }> = {};

    transactions.forEach(tx => {
      let monthKey = 'Other';
      const parts = tx.postDate.split(/[\/\-\.]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          monthKey = `${parts[0]}-${parts[1]}`;
        } else {
          monthKey = `${parts[2]}-${parts[1]}`;
        }
      }

      if (!months[monthKey]) {
        months[monthKey] = { debits: 0, credits: 0, count: 0 };
      }
      months[monthKey].debits += Number(tx.debit) || 0;
      months[monthKey].credits += Number(tx.credit) || 0;
      months[monthKey].count += 1;
    });

    return Object.entries(months).sort((a, b) => a[0].localeCompare(b[0]));
  }, [transactions]);

  // Mode Breakdown
  const modeData = useMemo(() => {
    const modes: Record<string, { total: number; count: number; debit: number; credit: number }> = {};
    transactions.forEach(tx => {
      const mode = tx.mode || 'OTHER';
      if (!modes[mode]) {
        modes[mode] = { total: 0, count: 0, debit: 0, credit: 0 };
      }
      const deb = Number(tx.debit) || 0;
      const cred = Number(tx.credit) || 0;
      modes[mode].total += deb + cred;
      modes[mode].debit += deb;
      modes[mode].credit += cred;
      modes[mode].count += 1;
    });
    return Object.entries(modes).sort((a, b) => b[1].total - a[1].total);
  }, [transactions]);

  // Category Breakdown
  const categoryData = useMemo(() => {
    const cats: Record<string, { total: number; count: number; debit: number; credit: number }> = {};
    transactions.forEach(tx => {
      const cat = tx.category || 'General';
      if (!cats[cat]) {
        cats[cat] = { total: 0, count: 0, debit: 0, credit: 0 };
      }
      const deb = Number(tx.debit) || 0;
      const cred = Number(tx.credit) || 0;
      cats[cat].total += deb + cred;
      cats[cat].debit += deb;
      cats[cat].credit += cred;
      cats[cat].count += 1;
    });
    return Object.entries(cats).sort((a, b) => b[1].total - a[1].total);
  }, [transactions]);

  // Top 5 Largest Debits
  const topDebits = useMemo(() => {
    return [...transactions]
      .filter(t => (t.debit || 0) > 0)
      .sort((a, b) => (b.debit || 0) - (a.debit || 0))
      .slice(0, 5);
  }, [transactions]);

  // Top 5 Largest Credits
  const topCredits = useMemo(() => {
    return [...transactions]
      .filter(t => (t.credit || 0) > 0)
      .sort((a, b) => (b.credit || 0) - (a.credit || 0))
      .slice(0, 5);
  }, [transactions]);

  const maxMonthlyVal = useMemo(() => {
    let max = 1;
    monthlyData.forEach(([_, val]) => {
      if (val.credits > max) max = val.credits;
      if (val.debits > max) max = val.debits;
    });
    return max;
  }, [monthlyData]);

  return (
    <div className="space-y-6">
      {/* Monthly Inflow vs Outflow Visual Chart */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-800">Monthly Cash Flow Comparison</h3>
          </div>
          <div className="flex items-center space-x-4 text-xs font-semibold">
            <span className="flex items-center text-green-700">
              <span className="w-3 h-3 bg-green-500 rounded-sm mr-1.5 inline-block"></span>
              Credits (Inflow)
            </span>
            <span className="flex items-center text-red-600">
              <span className="w-3 h-3 bg-red-500 rounded-sm mr-1.5 inline-block"></span>
              Debits (Outflow)
            </span>
          </div>
        </div>

        {/* CSS Bar Chart */}
        <div className="space-y-4 pt-1">
          {monthlyData.map(([monthKey, val]) => {
            const credPct = Math.min(100, Math.round((val.credits / maxMonthlyVal) * 100));
            const debPct = Math.min(100, Math.round((val.debits / maxMonthlyVal) * 100));

            return (
              <div key={monthKey} className="text-xs">
                <div className="flex justify-between items-center text-gray-700 mb-1.5 font-medium">
                  <span className="font-mono text-gray-900 font-semibold">{monthKey} ({val.count} txns)</span>
                  <div className="flex space-x-3 font-mono">
                    <span className="text-green-600 font-semibold">+{currencySymbol}{val.credits.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    <span className="text-red-600 font-semibold">-{currencySymbol}{val.debits.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {/* Credits bar */}
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden flex">
                    <div
                      className="bg-green-500 h-full rounded-full transition-all"
                      style={{ width: `${credPct}%` }}
                      title={`Credits: ${currencySymbol}${val.credits.toFixed(2)}`}
                    ></div>
                  </div>
                  {/* Debits bar */}
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden flex">
                    <div
                      className="bg-red-500 h-full rounded-full transition-all"
                      style={{ width: `${debPct}%` }}
                      title={`Debits: ${currencySymbol}${val.debits.toFixed(2)}`}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid: Payment Mode Distribution & Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment Modes */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-2 mb-5">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-800">Payment Modes Breakdown</h3>
          </div>

          <div className="space-y-3.5 text-xs">
            {modeData.map(([mode, val]) => {
              const totalAll = transactions.reduce((a, b) => a + (b.debit || 0) + (b.credit || 0), 0) || 1;
              const pct = Math.round((val.total / totalAll) * 100);

              return (
                <div key={mode} className="border-b border-gray-50 pb-2.5 last:border-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-semibold text-gray-800">{mode} ({val.count})</span>
                    <span className="font-mono font-medium text-gray-900">
                      {currencySymbol}{val.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Spending / Income Categories */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-2 mb-5">
            <Layers className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-800">Top Categories</h3>
          </div>

          <div className="space-y-3 text-xs">
            {categoryData.slice(0, 7).map(([cat, val]) => {
              return (
                <div key={cat} className="flex items-center justify-between border-b border-gray-50 pb-2.5 last:border-0">
                  <div>
                    <p className="font-semibold text-gray-800">{cat}</p>
                    <p className="text-[11px] text-gray-400">{val.count} transactions</p>
                  </div>
                  <div className="text-right">
                    {val.credit > 0 && (
                      <p className="text-green-600 font-semibold font-mono">
                        +{currencySymbol}{val.credit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </p>
                    )}
                    {val.debit > 0 && (
                      <p className="text-red-600 font-semibold font-mono">
                        -{currencySymbol}{val.debit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Largest Transactions Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top 5 Credits */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-2 text-green-700 mb-4">
            <ArrowDownLeft className="w-5 h-5 text-green-600" />
            <h4 className="text-sm font-bold text-gray-800">Top 5 Largest Credits (Inflows)</h4>
          </div>

          <div className="divide-y divide-gray-50 text-xs">
            {topCredits.map((tx) => (
              <div key={tx.id} className="py-2.5 flex items-center justify-between">
                <div className="pr-3">
                  <span className="text-[10px] text-gray-400 font-mono block">{tx.postDate}</span>
                  <p className="text-gray-800 font-medium truncate max-w-[220px]" title={tx.description}>
                    {tx.description}
                  </p>
                </div>
                <span className="text-green-600 font-bold font-mono text-xs whitespace-nowrap">
                  +{currencySymbol}{Number(tx.credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Debits */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center space-x-2 text-red-700 mb-4">
            <ArrowUpRight className="w-5 h-5 text-red-600" />
            <h4 className="text-sm font-bold text-gray-800">Top 5 Largest Debits (Outflows)</h4>
          </div>

          <div className="divide-y divide-gray-50 text-xs">
            {topDebits.map((tx) => (
              <div key={tx.id} className="py-2.5 flex items-center justify-between">
                <div className="pr-3">
                  <span className="text-[10px] text-gray-400 font-mono block">{tx.postDate}</span>
                  <p className="text-gray-800 font-medium truncate max-w-[220px]" title={tx.description}>
                    {tx.description}
                  </p>
                </div>
                <span className="text-red-600 font-bold font-mono text-xs whitespace-nowrap">
                  -{currencySymbol}{Number(tx.debit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


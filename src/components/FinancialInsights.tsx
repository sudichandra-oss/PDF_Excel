import React, { useMemo, useState } from 'react';
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Layers,
  CreditCard,
  Percent,
  Calendar,
  Activity,
  DollarSign
} from 'lucide-react';
import { TransactionRow } from '../types';

interface FinancialInsightsProps {
  transactions: TransactionRow[];
  currencySymbol?: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDateToMonthInfo(dateStr: string): { key: string; label: string; timestamp: number } {
  if (!dateStr || typeof dateStr !== 'string') {
    return { key: 'Other', label: 'Other Periods', timestamp: 0 };
  }

  const clean = dateStr.trim();

  // Try ISO YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    if (m >= 1 && m <= 12) {
      const monthName = MONTH_NAMES[m - 1];
      return {
        key: `${y}-${String(m).padStart(2, '0')}`,
        label: `${monthName} ${y}`,
        timestamp: new Date(y, m - 1, 1).getTime(),
      };
    }
  }

  // Try DD-MMM-YYYY (e.g. 15-Apr-2024 or 15 Apr 2024)
  const nameMatch = clean.match(/^(\d{1,2})[-\s/]([a-zA-Z]{3,9})[-\s/](\d{2,4})/);
  if (nameMatch) {
    const monthStr = nameMatch[2].substring(0, 3).toLowerCase();
    const mIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === monthStr);
    let y = parseInt(nameMatch[3], 10);
    if (y < 100) y += 2000;
    if (mIdx !== -1) {
      return {
        key: `${y}-${String(mIdx + 1).padStart(2, '0')}`,
        label: `${MONTH_NAMES[mIdx]} ${y}`,
        timestamp: new Date(y, mIdx, 1).getTime(),
      };
    }
  }

  // Try DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    let y = parseInt(dmyMatch[3], 10);
    if (y < 100) y += 2000;

    // In Indian/UK statements, p1 is Day and p2 is Month (1-12)
    let m = p2;
    if (m > 12 && p1 <= 12) {
      // US format MM/DD/YYYY
      m = p1;
    }

    if (m >= 1 && m <= 12) {
      return {
        key: `${y}-${String(m).padStart(2, '0')}`,
        label: `${MONTH_NAMES[m - 1]} ${y}`,
        timestamp: new Date(y, m - 1, 1).getTime(),
      };
    }
  }

  return { key: 'Other', label: 'Other Periods', timestamp: 0 };
}

export const FinancialInsights: React.FC<FinancialInsightsProps> = ({
  transactions,
  currencySymbol = '₹',
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'EXPENSE' | 'INCOME'>('EXPENSE');

  // Overall Totals
  const totalDebits = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.debit !== null && t.debit !== undefined && t.debit !== -1) {
        return acc + (Number(t.debit) || 0);
      }
      return acc;
    }, 0);
  }, [transactions]);

  const totalCredits = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.credit !== null && t.credit !== undefined && t.credit !== -1) {
        return acc + (Number(t.credit) || 0);
      }
      return acc;
    }, 0);
  }, [transactions]);

  const netCashFlow = totalCredits - totalDebits;
  const savingsRate = totalCredits > 0 ? ((netCashFlow / totalCredits) * 100) : 0;

  // Monthly Breakdown with accurate chronological ordering
  const monthlyData = useMemo(() => {
    const monthMap: Record<string, { label: string; debits: number; credits: number; count: number; timestamp: number }> = {};

    transactions.forEach(tx => {
      const { key, label, timestamp } = parseDateToMonthInfo(tx.postDate || tx.valueDate || '');
      if (!monthMap[key]) {
        monthMap[key] = { label, debits: 0, credits: 0, count: 0, timestamp };
      }
      if (tx.debit !== null && tx.debit !== undefined && tx.debit !== -1) {
        monthMap[key].debits += Number(tx.debit) || 0;
      }
      if (tx.credit !== null && tx.credit !== undefined && tx.credit !== -1) {
        monthMap[key].credits += Number(tx.credit) || 0;
      }
      monthMap[key].count += 1;
    });

    return Object.entries(monthMap)
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
  }, [transactions]);

  // Average Monthly Spend
  const avgMonthlyDebit = useMemo(() => {
    const monthCount = Math.max(1, monthlyData.length);
    return totalDebits / monthCount;
  }, [totalDebits, monthlyData]);

  // Mode Breakdown
  const modeData = useMemo(() => {
    const modes: Record<string, { total: number; count: number; debit: number; credit: number }> = {};
    transactions.forEach(tx => {
      const mode = tx.mode || 'OTHER';
      if (!modes[mode]) {
        modes[mode] = { total: 0, count: 0, debit: 0, credit: 0 };
      }
      const deb = (tx.debit !== null && tx.debit !== undefined && tx.debit !== -1) ? (Number(tx.debit) || 0) : 0;
      const cred = (tx.credit !== null && tx.credit !== undefined && tx.credit !== -1) ? (Number(tx.credit) || 0) : 0;
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
      const deb = (tx.debit !== null && tx.debit !== undefined && tx.debit !== -1) ? (Number(tx.debit) || 0) : 0;
      const cred = (tx.credit !== null && tx.credit !== undefined && tx.credit !== -1) ? (Number(tx.credit) || 0) : 0;
      cats[cat].total += deb + cred;
      cats[cat].debit += deb;
      cats[cat].credit += cred;
      cats[cat].count += 1;
    });
    return Object.entries(cats).sort((a, b) => {
      if (categoryFilter === 'EXPENSE') return b[1].debit - a[1].debit;
      if (categoryFilter === 'INCOME') return b[1].credit - a[1].credit;
      return b[1].total - a[1].total;
    });
  }, [transactions, categoryFilter]);

  // Top 5 Largest Debits
  const topDebits = useMemo(() => {
    return [...transactions]
      .filter(t => t.debit !== null && t.debit !== undefined && t.debit !== -1 && Number(t.debit) > 0)
      .sort((a, b) => (Number(b.debit) || 0) - (Number(a.debit) || 0))
      .slice(0, 5);
  }, [transactions]);

  // Top 5 Largest Credits
  const topCredits = useMemo(() => {
    return [...transactions]
      .filter(t => t.credit !== null && t.credit !== undefined && t.credit !== -1 && Number(t.credit) > 0)
      .sort((a, b) => (Number(b.credit) || 0) - (Number(a.credit) || 0))
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
      {/* Financial Health Summary Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase">
            <span>Avg Monthly Outflow</span>
            <Calendar className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl font-bold font-mono text-gray-900 mt-2">
            {currencySymbol}{avgMonthlyDebit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">Across {monthlyData.length} active month{monthlyData.length === 1 ? '' : 's'}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase">
            <span>Net Accumulation Rate</span>
            <Percent className="w-4 h-4 text-blue-500" />
          </div>
          <p className={`text-xl font-bold font-mono mt-2 ${savingsRate >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {savingsRate.toFixed(1)}%
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">{savingsRate >= 0 ? 'Surplus retained' : 'Deficit percentage'}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase">
            <span>Highest Single Expense</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl font-bold font-mono text-rose-600 mt-2">
            {topDebits[0] ? `${currencySymbol}${Number(topDebits[0].debit).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[200px]" title={topDebits[0]?.description}>
            {topDebits[0]?.description || 'No debits found'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase">
            <span>Highest Single Inflow</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold font-mono text-emerald-600 mt-2">
            {topCredits[0] ? `${currencySymbol}${Number(topCredits[0].credit).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[200px]" title={topCredits[0]?.description}>
            {topCredits[0]?.description || 'No credits found'}
          </p>
        </div>
      </div>

      {/* Monthly Inflow vs Outflow Visual Chart */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-800">Monthly Cash Flow Breakdown</h3>
          </div>
          <div className="flex items-center space-x-4 text-xs font-semibold">
            <span className="flex items-center text-emerald-700">
              <span className="w-3 h-3 bg-emerald-500 rounded-sm mr-1.5 inline-block"></span>
              Credits (+{currencySymbol}{totalCredits.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
            <span className="flex items-center text-rose-600">
              <span className="w-3 h-3 bg-rose-500 rounded-sm mr-1.5 inline-block"></span>
              Debits (-{currencySymbol}{totalDebits.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
            </span>
          </div>
        </div>

        {/* Visual Bar Chart */}
        <div className="space-y-4 pt-1">
          {monthlyData.map(([_, val]) => {
            const credPct = Math.min(100, Math.round((val.credits / maxMonthlyVal) * 100));
            const debPct = Math.min(100, Math.round((val.debits / maxMonthlyVal) * 100));

            return (
              <div key={val.label} className="text-xs">
                <div className="flex justify-between items-center text-gray-700 mb-1.5 font-medium">
                  <span className="font-mono text-gray-900 font-semibold">{val.label} <span className="text-gray-400 font-normal text-[11px]">({val.count} txns)</span></span>
                  <div className="flex space-x-4 font-mono">
                    <span className="text-emerald-600 font-semibold">+{currencySymbol}{val.credits.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-rose-600 font-semibold">-{currencySymbol}{val.debits.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {/* Credits bar */}
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all"
                      style={{ width: `${Math.max(credPct, 2)}%` }}
                      title={`Credits: ${currencySymbol}${val.credits.toFixed(2)}`}
                    ></div>
                  </div>
                  {/* Debits bar */}
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden flex">
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all"
                      style={{ width: `${Math.max(debPct, 2)}%` }}
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
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-800">Payment Modes Breakdown</h3>
            </div>
            <span className="text-xs text-gray-400">{modeData.length} channels detected</span>
          </div>

          <div className="space-y-3.5 text-xs">
            {modeData.map(([mode, val]) => {
              const totalAll = (totalDebits + totalCredits) || 1;
              const pct = Math.round((val.total / totalAll) * 100);

              return (
                <div key={mode} className="border-b border-gray-50 pb-2.5 last:border-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-semibold text-gray-800">{mode} <span className="text-gray-400 font-normal">({val.count} txns)</span></span>
                    <span className="font-mono font-medium text-gray-900">
                      {currencySymbol}{val.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Spending / Income Categories with Toggle */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-800">Categories Breakdown</h3>
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-[11px] font-semibold">
              <button
                onClick={() => setCategoryFilter('EXPENSE')}
                className={`px-2 py-1 rounded-md transition-colors ${categoryFilter === 'EXPENSE' ? 'bg-white text-rose-700 shadow-2xs' : 'text-gray-500'}`}
              >
                Expenses
              </button>
              <button
                onClick={() => setCategoryFilter('INCOME')}
                className={`px-2 py-1 rounded-md transition-colors ${categoryFilter === 'INCOME' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-500'}`}
              >
                Incomes
              </button>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            {categoryData.slice(0, 8).map(([cat, val]) => {
              const displayAmt = categoryFilter === 'INCOME' ? val.credit : val.debit;
              if (displayAmt === 0 && (categoryFilter === 'EXPENSE' || categoryFilter === 'INCOME')) return null;

              return (
                <div key={cat} className="flex items-center justify-between border-b border-gray-50 pb-2.5 last:border-0">
                  <div>
                    <p className="font-semibold text-gray-800">{cat}</p>
                    <p className="text-[11px] text-gray-400">{val.count} transactions</p>
                  </div>
                  <div className="text-right">
                    {categoryFilter === 'INCOME' ? (
                      <p className="text-emerald-600 font-semibold font-mono">
                        +{currencySymbol}{val.credit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    ) : (
                      <p className="text-rose-600 font-semibold font-mono">
                        -{currencySymbol}{val.debit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6">
          <div className="flex items-center space-x-2 text-emerald-700 mb-4">
            <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
            <h4 className="text-sm font-bold text-gray-800">Top 5 Largest Credits (Inflows)</h4>
          </div>

          <div className="divide-y divide-gray-50 text-xs">
            {topCredits.length === 0 ? (
              <p className="text-gray-400 py-3 text-center">No deposit transactions detected</p>
            ) : (
              topCredits.map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center justify-between">
                  <div className="pr-3">
                    <span className="text-[10px] text-gray-400 font-mono block">{tx.postDate}</span>
                    <p className="text-gray-800 font-medium truncate max-w-[220px]" title={tx.description}>
                      {tx.description}
                    </p>
                  </div>
                  <span className="text-emerald-600 font-bold font-mono text-xs whitespace-nowrap">
                    +{currencySymbol}{Number(tx.credit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top 5 Debits */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6">
          <div className="flex items-center space-x-2 text-rose-700 mb-4">
            <ArrowUpRight className="w-5 h-5 text-rose-600" />
            <h4 className="text-sm font-bold text-gray-800">Top 5 Largest Debits (Outflows)</h4>
          </div>

          <div className="divide-y divide-gray-50 text-xs">
            {topDebits.length === 0 ? (
              <p className="text-gray-400 py-3 text-center">No withdrawal transactions detected</p>
            ) : (
              topDebits.map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center justify-between">
                  <div className="pr-3">
                    <span className="text-[10px] text-gray-400 font-mono block">{tx.postDate}</span>
                    <p className="text-gray-800 font-medium truncate max-w-[220px]" title={tx.description}>
                      {tx.description}
                    </p>
                  </div>
                  <span className="text-rose-600 font-bold font-mono text-xs whitespace-nowrap">
                    -{currencySymbol}{Number(tx.debit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};



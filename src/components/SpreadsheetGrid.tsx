import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Plus, 
  Trash2, 
  Edit2, 
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { TransactionRow, ColumnConfig } from '../types';

interface SpreadsheetGridProps {
  transactions: TransactionRow[];
  currencySymbol?: string;
  onUpdateTransactions: (updated: TransactionRow[]) => void;
  onOpenAddModal: () => void;
  onOpenEditModal: (tx: TransactionRow) => void;
}

export const SpreadsheetGrid: React.FC<SpreadsheetGridProps> = ({
  transactions,
  currencySymbol = '₹',
  onUpdateTransactions,
  onOpenAddModal,
  onOpenEditModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
  const [sortField, setSortField] = useState<keyof TransactionRow>('postDate');
  const [sortAsc, setSortAsc] = useState(false);
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string; value: string } | null>(null);

  // Column visibility state
  const [columns, setColumns] = useState<ColumnConfig[]>([
    { key: 'postDate', label: 'Post Date', visible: true, type: 'date', width: 'w-28' },
    { key: 'valueDate', label: 'Value Date', visible: true, type: 'date', width: 'w-28' },
    { key: 'branchCode', label: 'Branch Code', visible: true, type: 'text', width: 'w-24' },
    { key: 'chequeNo', label: 'Cheque / Ref', visible: false, type: 'text', width: 'w-28' },
    { key: 'description', label: 'Transaction Description', visible: true, type: 'text', width: 'w-80' },
    { key: 'mode', label: 'Mode', visible: true, type: 'badge', width: 'w-24' },
    { key: 'category', label: 'Category', visible: true, type: 'badge', width: 'w-36' },
    { key: 'debit', label: 'Debit (Withdrawal)', visible: true, type: 'number', width: 'w-32' },
    { key: 'credit', label: 'Credit (Deposit)', visible: true, type: 'number', width: 'w-32' },
    { key: 'balance', label: 'Balance', visible: true, type: 'number', width: 'w-32' },
  ]);

  const [showColMenu, setShowColMenu] = useState(false);

  const toggleColumn = (key: keyof TransactionRow) => {
    setColumns(prev =>
      prev.map(c => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
  };

  // Filter & Sort logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Search
      const matchSearch =
        searchQuery === '' ||
        tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tx.referenceNo && tx.referenceNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (tx.branchCode && tx.branchCode.includes(searchQuery)) ||
        tx.postDate.includes(searchQuery);

      // Mode
      const matchMode = filterMode === 'ALL' || tx.mode === filterMode;

      // Type
      const matchType =
        filterType === 'ALL' ||
        (filterType === 'DEBIT' && (tx.debit || 0) > 0) ||
        (filterType === 'CREDIT' && (tx.credit || 0) > 0);

      return matchSearch && matchMode && matchType;
    });
  }, [transactions, searchQuery, filterMode, filterType]);

  const sortedTransactions = useMemo(() => {
    const list = [...filteredTransactions];
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }

      const strA = String(valA);
      const strB = String(valB);
      return sortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
    return list;
  }, [filteredTransactions, sortField, sortAsc]);

  // Pagination
  const totalPages = Math.ceil(sortedTransactions.length / pageSize) || 1;
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTransactions.slice(start, start + pageSize);
  }, [sortedTransactions, currentPage, pageSize]);

  // Calculations for current view
  const currentTotalDebits = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => acc + (Number(t.debit) || 0), 0);
  }, [filteredTransactions]);

  const currentTotalCredits = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => acc + (Number(t.credit) || 0), 0);
  }, [filteredTransactions]);

  const handleDeleteRow = (id: string) => {
    if (window.confirm('Delete this transaction row?')) {
      onUpdateTransactions(transactions.filter(t => t.id !== id));
    }
  };

  const handleSort = (field: keyof TransactionRow) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getCategoryBadgeClass = (category?: string) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('income') || cat.includes('salary') || cat.includes('dividend')) {
      return 'bg-green-100 text-green-700';
    }
    if (cat.includes('shop') || cat.includes('amazon') || cat.includes('flipkart')) {
      return 'bg-blue-100 text-blue-700';
    }
    if (cat.includes('food') || cat.includes('dine') || cat.includes('restaurant') || cat.includes('zomato') || cat.includes('swiggy')) {
      return 'bg-orange-100 text-orange-700';
    }
    if (cat.includes('charge') || cat.includes('fee') || cat.includes('gst') || cat.includes('penalty')) {
      return 'bg-purple-100 text-purple-700';
    }
    if (cat.includes('transfer') || cat.includes('upi') || cat.includes('neft')) {
      return 'bg-teal-100 text-teal-700';
    }
    if (cat.includes('fuel') || cat.includes('petrol')) {
      return 'bg-amber-100 text-amber-800';
    }
    return 'bg-gray-100 text-gray-700';
  };

  const getModeBadgeClass = (mode?: string) => {
    switch (mode) {
      case 'UPI':
        return 'bg-blue-50 text-blue-700';
      case 'NEFT':
        return 'bg-purple-50 text-purple-700';
      case 'IMPS':
        return 'bg-indigo-50 text-indigo-700';
      case 'CASH':
        return 'bg-amber-50 text-amber-800';
      case 'TRANSFER':
        return 'bg-emerald-50 text-emerald-800';
      case 'CHARGES':
        return 'bg-rose-50 text-rose-700';
      case 'INTEREST':
        return 'bg-teal-50 text-teal-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      {/* Formula / Info Toolbar */}
      <div className="bg-gray-50/80 border-b border-gray-100 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
          <div className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg font-mono font-bold text-gray-700 shadow-2xs">
            {selectedCell ? `${selectedCell.col}${selectedCell.row}` : 'A1'}
          </div>
          <span className="text-gray-400 font-serif italic text-sm font-semibold">fx</span>
          <div className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1 text-gray-700 font-mono text-xs truncate shadow-2xs">
            {selectedCell ? selectedCell.value : (transactions[0]?.description || 'Spreadsheet Grid View')}
          </div>
        </div>

        {/* Quick action: Add Transaction */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenAddModal}
            id="btn-add-transaction-row"
            className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            <span>Add Row</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            id="search-transactions-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search description, reference, date, branch..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/60 outline-none"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode selector */}
          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-gray-500 font-medium">Mode:</span>
            <select
              id="filter-mode-select"
              value={filterMode}
              onChange={(e) => {
                setFilterMode(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-medium outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Modes</option>
              <option value="UPI">UPI</option>
              <option value="NEFT">NEFT</option>
              <option value="IMPS">IMPS</option>
              <option value="CASH">CASH</option>
              <option value="TRANSFER">Transfer</option>
              <option value="CHARGES">Charges</option>
              <option value="INTEREST">Interest</option>
            </select>
          </div>

          {/* Type filter chips */}
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs shadow-2xs">
            <button
              onClick={() => { setFilterType('ALL'); setCurrentPage(1); }}
              className={`px-3 py-1.5 font-semibold transition-colors ${
                filterType === 'ALL' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              All ({transactions.length})
            </button>
            <button
              onClick={() => { setFilterType('DEBIT'); setCurrentPage(1); }}
              className={`px-3 py-1.5 font-semibold border-l border-gray-200 transition-colors ${
                filterType === 'DEBIT' ? 'bg-red-600 text-white' : 'bg-white text-red-700 hover:bg-gray-50'
              }`}
            >
              Debits
            </button>
            <button
              onClick={() => { setFilterType('CREDIT'); setCurrentPage(1); }}
              className={`px-3 py-1.5 font-semibold border-l border-gray-200 transition-colors ${
                filterType === 'CREDIT' ? 'bg-green-600 text-white' : 'bg-white text-green-700 hover:bg-gray-50'
              }`}
            >
              Credits
            </button>
          </div>

          {/* Column Visibility toggle */}
          <div className="relative">
            <button
              onClick={() => setShowColMenu(!showColMenu)}
              id="btn-toggle-columns"
              className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-xs font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 shadow-2xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-gray-500" />
              Columns
            </button>

            {showColMenu && (
              <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-40 p-2.5 text-xs space-y-1">
                <p className="font-semibold text-gray-800 px-2 py-1 border-b border-gray-100 mb-1">
                  Show / Hide Columns
                </p>
                {columns.map(col => (
                  <label
                    key={col.key}
                    className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={col.visible}
                      onChange={() => toggleColumn(col.key)}
                      className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 mr-2"
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Spreadsheet Table Container */}
      <div className="overflow-x-auto max-h-[580px] select-text">
        <table className="w-full text-left text-xs border-collapse font-sans">
          <thead className="sticky top-0 bg-gray-50 z-20 border-b border-gray-100">
            <tr>
              {/* Row index header */}
              <th className="w-12 px-3 py-3 text-center text-gray-400 bg-gray-100/70 border-r border-gray-100 font-mono text-[10px]">
                #
              </th>

              {columns.filter(c => c.visible).map((col, idx) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 text-xs font-semibold text-gray-500 border-r border-gray-100 hover:bg-gray-100/60 cursor-pointer transition-colors ${col.width || ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-400 font-mono block leading-none">
                        {colLetters[idx] || ''}
                      </span>
                      <span className="text-gray-700 font-medium">{col.label}</span>
                    </div>
                    {sortField === col.key && (
                      <ArrowUpDown className="w-3 h-3 text-blue-600 ml-1 shrink-0" />
                    )}
                  </div>
                </th>
              ))}

              <th className="w-20 px-4 py-3 text-center text-xs font-semibold text-gray-500 bg-gray-50">
                Actions
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-gray-50 bg-white">
            {paginatedTransactions.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.filter(c => c.visible).length + 2}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  No transactions match your search or filter criteria.
                </td>
              </tr>
            ) : (
              paginatedTransactions.map((tx, rowIndex) => {
                const actualIndex = (currentPage - 1) * pageSize + rowIndex + 1;
                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-blue-50/30 transition-colors group"
                  >
                    {/* Row Index Number */}
                    <td className="px-3 py-3 text-center text-gray-400 bg-gray-50/40 border-r border-gray-50 font-mono text-[11px] group-hover:text-blue-600">
                      {actualIndex}
                    </td>

                    {/* Columns */}
                    {columns.filter(c => c.visible).map((col, colIndex) => {
                      const colLetter = colLetters[colIndex] || 'A';
                      const cellValue = tx[col.key];

                      return (
                        <td
                          key={col.key}
                          onClick={() =>
                            setSelectedCell({
                              row: actualIndex,
                              col: colLetter,
                              value: String(cellValue ?? ''),
                            })
                          }
                          className={`px-4 py-3 border-r border-gray-50 text-gray-800 focus:bg-blue-50 cursor-pointer ${
                            col.type === 'number' ? 'text-right font-mono' : ''
                          }`}
                        >
                          {col.key === 'debit' ? (
                            tx.debit ? (
                              <span className="text-red-600 font-semibold font-mono">
                                -{currencySymbol}{Number(tx.debit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )
                          ) : col.key === 'credit' ? (
                            tx.credit ? (
                              <span className="text-green-600 font-semibold font-mono">
                                +{currencySymbol}{Number(tx.credit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )
                          ) : col.key === 'balance' ? (
                            <span className="font-semibold text-gray-900 font-mono">
                              {currencySymbol}{Number(tx.balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {tx.balanceType ? (
                                <span className="ml-1 text-[10px] text-gray-400 font-normal">
                                  {tx.balanceType}
                                </span>
                              ) : null}
                            </span>
                          ) : col.key === 'mode' ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${getModeBadgeClass(tx.mode)}`}>
                              {tx.mode || 'OTHER'}
                            </span>
                          ) : col.key === 'category' ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide truncate max-w-[140px] ${getCategoryBadgeClass(tx.category)}`}>
                              {tx.category || 'General'}
                            </span>
                          ) : (
                            <span className="truncate block max-w-xs text-xs font-medium text-gray-800" title={String(cellValue || '')}>
                              {String(cellValue || '')}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* Action buttons */}
                    <td className="px-2 py-2 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-1 opacity-70 group-hover:opacity-100">
                        <button
                          onClick={() => onOpenEditModal(tx)}
                          id={`btn-edit-row-${tx.id}`}
                          className="p-1 hover:text-blue-600 hover:bg-blue-50 rounded text-gray-400"
                          title="Edit transaction"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRow(tx.id)}
                          id={`btn-delete-row-${tx.id}`}
                          className="p-1 hover:text-red-600 hover:bg-red-50 rounded text-gray-400"
                          title="Delete row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Summary & Pagination Bar */}
      <div className="bg-gray-50 border-t border-gray-100 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
        <div className="flex flex-wrap items-center space-x-4">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
            Total Rows: <strong className="text-gray-900">{filteredTransactions.length}</strong> of {transactions.length}
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-red-700 font-medium">
            Sum Debits: <strong>{currencySymbol} {currentTotalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-green-700 font-medium">
            Sum Credits: <strong>{currencySymbol} {currentTotalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-800 font-medium">
            Net Difference: <strong className={currentTotalCredits - currentTotalDebits >= 0 ? 'text-green-700' : 'text-red-700'}>
              {currencySymbol} {(currentTotalCredits - currentTotalDebits).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </strong>
          </span>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5">
            <span className="text-gray-500 text-xs">Per page:</span>
            <select
              value={pageSize >= transactions.length && transactions.length > 0 ? 10000 : pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white text-gray-700 outline-none cursor-pointer"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={10000}>All ({transactions.length})</option>
            </select>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 shadow-2xs"
              title="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
            </button>
            <span className="px-2 font-medium text-gray-700 text-xs">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 shadow-2xs"
              title="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


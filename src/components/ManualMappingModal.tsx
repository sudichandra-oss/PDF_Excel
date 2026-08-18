import React, { useState, useEffect } from 'react';
import { 
  X, 
  Table2, 
  Check, 
  ArrowRight, 
  RotateCcw, 
  Info, 
  Sparkles,
  Sliders,
  HelpCircle
} from 'lucide-react';
import { BankStatementData, ColumnMappingConfig } from '../types';
import { applyManualColumnMapping } from '../utils/textTableParser';

interface ManualMappingModalProps {
  statement: BankStatementData;
  isOpen: boolean;
  onClose: () => void;
  onApplyMapping: (newStatement: BankStatementData) => void;
}

export const ManualMappingModal: React.FC<ManualMappingModalProps> = ({
  statement,
  isOpen,
  onClose,
  onApplyMapping,
}) => {
  // Extract all available column headers from rawRows or detectedColumns or transaction keys
  const availableColumns: string[] = React.useMemo(() => {
    if (statement.rawHeaders && statement.rawHeaders.length > 0) {
      return statement.rawHeaders;
    }
    if (statement.rawRows && statement.rawRows.length > 0) {
      const keys = Object.keys(statement.rawRows[0] || {});
      if (keys.length > 0) return keys;
    }
    if (statement.detectedColumns && statement.detectedColumns.length > 0) {
      return statement.detectedColumns;
    }
    return ['postDate', 'description', 'debit', 'credit', 'balance', 'valueDate', 'chequeNo', 'category', 'mode'];
  }, [statement]);

  // Guess best defaults with exact match priority and duplicate prevention
  const findMatch = (patterns: string[], excludeSet?: Set<string>): string => {
    // 1. Try exact cleaned matches first
    for (const p of patterns) {
      const cleanPattern = p.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const col of availableColumns) {
        if (excludeSet && excludeSet.has(col)) continue;
        const cleanCol = col.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanCol === cleanPattern) {
          if (excludeSet) excludeSet.add(col);
          return col;
        }
      }
    }
    // 2. Try substring matches
    for (const p of patterns) {
      const cleanPattern = p.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const col of availableColumns) {
        if (excludeSet && excludeSet.has(col)) continue;
        const cleanCol = col.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanCol.includes(cleanPattern)) {
          if (excludeSet) excludeSet.add(col);
          return col;
        }
      }
    }
    return '';
  };

  const [mapping, setMapping] = useState<ColumnMappingConfig>({
    postDateCol: '',
    valueDateCol: '',
    descriptionCol: '',
    chequeNoCol: '',
    branchCodeCol: '',
    debitCol: '',
    creditCol: '',
    amountCol: '',
    drCrCol: '',
    balanceCol: '',
    categoryCol: '',
    modeCol: '',
  });

  const [amountMode, setAmountMode] = useState<'split' | 'single'>('split');

  // Helper to set a field while preventing duplicate column mapping (if another field has the same column, clear it)
  const setFieldMapping = (field: keyof ColumnMappingConfig, colValue: string) => {
    setMapping(prev => {
      const next = { ...prev, [field]: colValue };
      // If a column was chosen (non-empty), ensure no other field maps to the same column (ignore duplicate assignment)
      if (colValue) {
        for (const key of Object.keys(next) as Array<keyof ColumnMappingConfig>) {
          if (key !== field && next[key] === colValue) {
            // Unassign from duplicate
            next[key] = '';
          }
        }
      }
      return next;
    });
  };

  // Auto detect fields when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const used = new Set<string>();
    const dateCol = findMatch(['postdate', 'post date', 'postingdate', 'posting date', 'txndate', 'transdate', 'date'], used);
    const valDateCol = findMatch(['valuedate', 'value date', 'valuedt', 'value dt', 'valdate'], used);
    const branchCol = findMatch(['branchcode', 'branch code', 'branch', 'brcode', 'br code'], used);
    const chqCol = findMatch(['chequenumber', 'cheque number', 'chequeno', 'cheque no', 'chqno', 'chq no', 'instrument', 'refno', 'reference', 'utr', 'cheque', 'ref'], used);
    const descCol = findMatch(['transactiondescription', 'transaction description', 'transactiondetails', 'transaction details', 'description', 'narration', 'particulars', 'details', 'remarks', 'memo', 'txndesc'], used);
    const debCol = findMatch(['debit', 'debitamt', 'debit amount', 'withdrawal', 'withdrawalamt', 'dr', 'dramt', 'withdr', 'outflow'], used);
    const credCol = findMatch(['credit', 'creditamt', 'credit amount', 'deposit', 'depositamt', 'cr', 'cramt', 'inflow', 'dep'], used);
    const balCol = findMatch(['balance', 'closingbalance', 'closing balance', 'runningbalance', 'running balance', 'bal', 'closingbal', 'bookbalance'], used);
    const singleAmtCol = findMatch(['amount', 'transamount', 'txnamt', 'totalamt', 'netamount'], used);
    const drCrCol = findMatch(['drcr', 'type', 'trantype', 'crdr'], used);
    const catCol = findMatch(['category', 'spendingcategory', 'head', 'subhead', 'tag'], used);
    const modeCol = findMatch(['mode', 'paymentmode', 'channel'], used);

    const firstAvailable = availableColumns.find(c => !used.has(c)) || availableColumns[0] || '';
    if (!dateCol && firstAvailable) used.add(firstAvailable);
    const secondAvailable = availableColumns.find(c => !used.has(c)) || availableColumns[1] || '';

    setMapping({
      postDateCol: dateCol || firstAvailable,
      valueDateCol: valDateCol || '',
      descriptionCol: descCol || secondAvailable,
      chequeNoCol: chqCol || '',
      branchCodeCol: branchCol || '',
      debitCol: debCol || '',
      creditCol: credCol || '',
      amountCol: singleAmtCol || '',
      drCrCol: drCrCol || '',
      balanceCol: balCol || '',
      categoryCol: catCol || '',
      modeCol: modeCol || '',
    });

    if (!debCol && !credCol && singleAmtCol) {
      setAmountMode('single');
    } else {
      setAmountMode('split');
    }
  }, [isOpen, availableColumns]);

  if (!isOpen) return null;

  // Prepare raw sample rows for preview
  const rawSampleRows = (statement.rawRows && statement.rawRows.length > 0)
    ? statement.rawRows.slice(0, 4)
    : statement.transactions.slice(0, 4).map(t => ({
        postDate: t.postDate,
        valueDate: t.valueDate,
        description: t.description,
        debit: t.debit,
        credit: t.credit,
        balance: t.balance,
        chequeNo: t.chequeNo,
        category: t.category,
        mode: t.mode,
      }));

  const handleApply = () => {
    // Generate fallback rawRows if absent
    const rowsToMap = statement.rawRows && statement.rawRows.length > 0
      ? statement.rawRows
      : statement.transactions.map(t => ({
          ...t,
          postDate: t.postDate,
          valueDate: t.valueDate,
          description: t.description,
          debit: t.debit,
          credit: t.credit,
          balance: t.balance,
          chequeNo: t.chequeNo,
          category: t.category,
          mode: t.mode,
        }));

    const finalMapping: any = {
      postDateCol: mapping.postDateCol,
      valueDateCol: mapping.valueDateCol,
      descriptionCol: mapping.descriptionCol,
      chequeNoCol: mapping.chequeNoCol,
      branchCodeCol: mapping.branchCodeCol,
      balanceCol: mapping.balanceCol,
      categoryCol: mapping.categoryCol,
      modeCol: mapping.modeCol,
    };

    if (amountMode === 'split') {
      finalMapping.debitCol = mapping.debitCol;
      finalMapping.creditCol = mapping.creditCol;
    } else {
      finalMapping.amountCol = mapping.amountCol;
      finalMapping.drCrCol = mapping.drCrCol;
    }

    const updatedStatement = applyManualColumnMapping(rowsToMap, finalMapping, statement);
    onApplyMapping(updatedStatement);
    onClose();
  };

  const handleAutoDetect = () => {
    const used = new Set<string>();
    const dateCol = findMatch(['postdate', 'post date', 'postingdate', 'posting date', 'txndate', 'transdate', 'date'], used);
    const valDateCol = findMatch(['valuedate', 'value date', 'valuedt', 'value dt', 'valdate'], used);
    const descCol = findMatch(['transactiondescription', 'transaction description', 'transactiondetails', 'transaction details', 'description', 'narration', 'particulars', 'details', 'remarks', 'memo', 'txndesc'], used);
    const chqCol = findMatch(['chequenumber', 'cheque number', 'chequeno', 'cheque no', 'chqno', 'chq no', 'instrument', 'refno', 'reference', 'utr', 'cheque', 'ref'], used);
    const branchCol = findMatch(['branchcode', 'branch code', 'branch', 'brcode', 'br code'], used);
    const debCol = findMatch(['debit', 'debitamt', 'debit amount', 'withdrawal', 'withdrawalamt', 'dr', 'dramt', 'withdr', 'outflow'], used);
    const credCol = findMatch(['credit', 'creditamt', 'credit amount', 'deposit', 'depositamt', 'cr', 'cramt', 'inflow', 'dep'], used);
    const balCol = findMatch(['balance', 'closingbalance', 'closing balance', 'runningbalance', 'running balance', 'bal', 'closingbal', 'bookbalance'], used);
    const singleAmtCol = findMatch(['amount', 'transamount', 'txnamt', 'totalamt', 'netamount'], used);
    const drCrCol = findMatch(['drcr', 'type', 'trantype', 'crdr'], used);

    setMapping(prev => ({
      ...prev,
      postDateCol: dateCol || prev.postDateCol,
      valueDateCol: valDateCol || prev.valueDateCol,
      descriptionCol: descCol || prev.descriptionCol,
      chequeNoCol: chqCol || prev.chequeNoCol,
      branchCodeCol: branchCol || prev.branchCodeCol,
      debitCol: debCol || prev.debitCol,
      creditCol: credCol || prev.creditCol,
      amountCol: singleAmtCol || prev.amountCol,
      drCrCol: drCrCol || prev.drCrCol,
      balanceCol: balCol || prev.balanceCol,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Manual Column Mapping
              </h2>
              <p className="text-xs text-gray-500">
                Match the columns in your uploaded file with standard financial fields
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs text-gray-700">
          {/* Top Quick Guide Banner */}
          <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-3.5 flex items-start space-x-3">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-blue-900 font-semibold">
                Column Mapping Tips
              </p>
              <p className="text-blue-700 text-[11px] leading-relaxed">
                If withdrawal and deposit amounts appeared flipped or in wrong columns, select the exact column names below. Clicking <b>Apply Mapping</b> will re-evaluate all calculations and charts instantaneously.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAutoDetect}
              className="px-3 py-1 bg-white border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 font-semibold shrink-0 inline-flex items-center text-xs shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1 text-blue-500" />
              Auto-Suggest
            </button>
          </div>

          {/* Amount Format Option (Split Debit/Credit vs Single Amount) */}
          <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-semibold text-gray-800 text-xs">Amounts Structure:</span>
              <p className="text-[11px] text-gray-500">Does your file have separate Debit & Credit columns or a single Amount column?</p>
            </div>
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-white text-xs font-semibold">
              <button
                type="button"
                onClick={() => setAmountMode('split')}
                className={`px-3 py-1.5 rounded-md transition-all ${amountMode === 'split' ? 'bg-blue-600 text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Separate Debit & Credit Columns
              </button>
              <button
                type="button"
                onClick={() => setAmountMode('single')}
                className={`px-3 py-1.5 rounded-md transition-all ${amountMode === 'single' ? 'bg-blue-600 text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Single Amount Column
              </button>
            </div>
          </div>

          {/* Mapping Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Required: Date */}
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-gray-800">
                  Post / Transaction Date <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-gray-400">Primary Date</span>
              </div>
              <select
                value={mapping.postDateCol}
                onChange={e => setFieldMapping('postDateCol', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              >
                <option value="">-- Select Date Column --</option>
                {availableColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            {/* Required: Description */}
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-gray-800">
                  Narration / Description <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-gray-400">Transaction Details</span>
              </div>
              <select
                value={mapping.descriptionCol}
                onChange={e => setFieldMapping('descriptionCol', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              >
                <option value="">-- Select Description Column --</option>
                {availableColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            {/* Debit Column (if split) */}
            {amountMode === 'split' ? (
              <>
                <div className="p-3.5 bg-rose-50/40 border border-rose-100 rounded-xl shadow-2xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-rose-900">
                      Debit / Withdrawal Column (Outflow)
                    </label>
                    <span className="text-[10px] text-rose-500 font-semibold">- Debits</span>
                  </div>
                  <select
                    value={mapping.debitCol}
                    onChange={e => setFieldMapping('debitCol', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-rose-200 rounded-lg font-mono text-xs text-rose-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  >
                    <option value="">-- (Optional / None) --</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div className="p-3.5 bg-emerald-50/40 border border-emerald-100 rounded-xl shadow-2xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-emerald-900">
                      Credit / Deposit Column (Inflow)
                    </label>
                    <span className="text-[10px] text-emerald-600 font-semibold">+ Credits</span>
                  </div>
                  <select
                    value={mapping.creditCol}
                    onChange={e => setFieldMapping('creditCol', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg font-mono text-xs text-emerald-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- (Optional / None) --</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="p-3.5 bg-blue-50/40 border border-blue-100 rounded-xl shadow-2xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-blue-900">
                      Amount Column
                    </label>
                    <span className="text-[10px] text-blue-600 font-semibold">Single Amount</span>
                  </div>
                  <select
                    value={mapping.amountCol}
                    onChange={e => setFieldMapping('amountCol', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg font-mono text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Select Amount Column --</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl shadow-2xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-gray-800">
                      DR / CR Indicator Column (Optional)
                    </label>
                    <span className="text-[10px] text-gray-400">Dr/Cr flag</span>
                  </div>
                  <select
                    value={mapping.drCrCol}
                    onChange={e => setFieldMapping('drCrCol', e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg font-mono text-xs"
                  >
                    <option value="">-- (Optional / None) --</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Balance Column */}
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-gray-800">
                  Closing Balance Column
                </label>
                <span className="text-[10px] text-gray-400">Running Balance</span>
              </div>
              <select
                value={mapping.balanceCol}
                onChange={e => setFieldMapping('balanceCol', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-xs focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              >
                <option value="">-- (Optional / None) --</option>
                {availableColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            {/* Value Date Column */}
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-gray-800">
                  Value Date Column (Optional)
                </label>
                <span className="text-[10px] text-gray-400">Secondary Date</span>
              </div>
              <select
                value={mapping.valueDateCol}
                onChange={e => setFieldMapping('valueDateCol', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-xs"
              >
                <option value="">-- (Optional / None) --</option>
                {availableColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            {/* Cheque / Ref No */}
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-gray-800">
                  Cheque / Reference / UTR No. (Optional)
                </label>
                <span className="text-[10px] text-gray-400">Ref Identifier</span>
              </div>
              <select
                value={mapping.chequeNoCol}
                onChange={e => setFieldMapping('chequeNoCol', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-xs"
              >
                <option value="">-- (Optional / None) --</option>
                {availableColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            {/* Branch / Code */}
            <div className="p-3.5 bg-white border border-gray-200 rounded-xl shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-gray-800">
                  Branch / SOL / Code (Optional)
                </label>
                <span className="text-[10px] text-gray-400">Branch details</span>
              </div>
              <select
                value={mapping.branchCodeCol}
                onChange={e => setFieldMapping('branchCodeCol', e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-xs"
              >
                <option value="">-- (Optional / None) --</option>
                {availableColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Raw Data Preview Table */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-800 text-xs flex items-center">
                <Table2 className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                Raw File Preview (First 4 rows)
              </span>
              <span className="text-[11px] text-gray-400">
                {availableColumns.length} Columns in file
              </span>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl bg-gray-50/50">
              <table className="min-w-full divide-y divide-gray-200 text-[11px]">
                <thead className="bg-gray-100/80">
                  <tr>
                    {availableColumns.map(col => (
                      <th key={col} className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {rawSampleRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      {availableColumns.map(col => (
                        <td key={col} className="px-3 py-1.5 text-gray-600 whitespace-nowrap font-mono">
                          {String(row[col] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            Cancel
          </button>
          
          <button
            type="button"
            id="btn-apply-column-mapping"
            onClick={handleApply}
            disabled={!mapping.postDateCol || !mapping.descriptionCol}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center space-x-1.5 cursor-pointer transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Apply Mapping & Re-calculate</span>
          </button>
        </div>
      </div>
    </div>
  );
};

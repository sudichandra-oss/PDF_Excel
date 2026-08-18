import React, { useState } from 'react';
import { 
  Building2, 
  User, 
  CreditCard, 
  Calendar, 
  MapPin, 
  Mail, 
  FileCheck, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  ShieldCheck,
  Hash,
  Award,
  Edit3,
  Check,
  AlertCircle
} from 'lucide-react';
import { AccountMetadata, TransactionRow } from '../types';

interface StatementSummaryProps {
  account: AccountMetadata;
  transactions: TransactionRow[];
  currencySymbol?: string;
  onUpdateAccount?: (updated: AccountMetadata) => void;
}

export const StatementSummary: React.FC<StatementSummaryProps> = ({
  account,
  transactions,
  currencySymbol = '₹',
  onUpdateAccount,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<AccountMetadata>({ ...account });

  // Calculations
  const calculatedCredits = transactions.reduce((acc, t) => {
    if (t.credit !== null && t.credit !== undefined && t.credit !== -1) {
      const val = Number(t.credit);
      return acc + (isNaN(val) ? 0 : val);
    }
    return acc;
  }, 0);

  const calculatedDebits = transactions.reduce((acc, t) => {
    if (t.debit !== null && t.debit !== undefined && t.debit !== -1) {
      const val = Number(t.debit);
      return acc + (isNaN(val) ? 0 : val);
    }
    return acc;
  }, 0);

  const netCashFlow = calculatedCredits - calculatedDebits;
  const depositCount = transactions.filter(t => t.credit !== null && (t.credit || 0) > 0).length;
  const withdrawalCount = transactions.filter(t => t.debit !== null && (t.debit || 0) > 0).length;
  
  // Find opening and closing balances reliably
  let computedOpening = account.openingBalance;
  let computedClosing = account.closingBalance;

  if (computedOpening === undefined || computedOpening === null) {
    const firstTxWithBal = transactions.find(t => t.balance !== null && t.balance !== undefined);
    if (firstTxWithBal && firstTxWithBal.balance !== null) {
      computedOpening = firstTxWithBal.balance - (firstTxWithBal.credit || 0) + (firstTxWithBal.debit || 0);
    } else {
      computedOpening = 0;
    }
  }

  if (computedClosing === undefined || computedClosing === null) {
    // Find last transaction with balance
    for (let i = transactions.length - 1; i >= 0; i--) {
      if (transactions[i].balance !== null && transactions[i].balance !== undefined) {
        computedClosing = transactions[i].balance!;
        break;
      }
    }
    if (computedClosing === undefined) {
      computedClosing = (computedOpening || 0) + calculatedCredits - calculatedDebits;
    }
  }

  const openingBal = computedOpening ?? 0;
  const closingBal = computedClosing ?? 0;

  // Statement Period
  const derivedPeriod = account.statementPeriod || (
    transactions.length > 0 
      ? `${transactions[0].postDate} to ${transactions[transactions.length - 1].postDate}`
      : '—'
  );

  // Reconciliation Check: Opening + Credits - Debits = Closing
  const expectedClosing = openingBal + calculatedCredits - calculatedDebits;
  const diff = Math.abs(expectedClosing - closingBal);
  const isReconciled = diff < 1.0;

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateAccount) {
      onUpdateAccount(editForm);
    }
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Credits */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Total Credits (Inflow)
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-600 font-mono">
              +{currencySymbol}{calculatedCredits.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {depositCount} Deposit transaction{depositCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Total Debits */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Total Debits (Outflow)
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-600 font-mono">
              -{currencySymbol}{calculatedDebits.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {withdrawalCount} Withdrawal transaction{withdrawalCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Net Flow */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Net Cash Flow
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-bold font-mono ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {netCashFlow >= 0 ? '+' : ''}{currencySymbol}{netCashFlow.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {netCashFlow >= 0 ? 'Positive net savings' : 'Net deficit during period'}
            </p>
          </div>
        </div>

        {/* Closing Balance */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Closing Balance
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-gray-900 font-mono">
              {currencySymbol}{Number(closingBal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Opening: {currencySymbol}{Number(openingBal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Account Info Details Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Building2 className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-800">Bank & Account Profile</h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              {account.bankName || 'Bank Statement'}
            </span>
            {onUpdateAccount && (
              <button
                onClick={() => {
                  setEditForm({ ...account });
                  setIsEditing(!isEditing);
                }}
                id="btn-edit-account-profile"
                className="text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center ml-2 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 mr-1" />
                {isEditing ? 'Cancel Edit' : 'Edit Details'}
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-gray-600 font-semibold mb-1">Bank Name</label>
                <input
                  type="text"
                  value={editForm.bankName || ''}
                  onChange={e => setEditForm({ ...editForm, bankName: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g. State Bank of India"
                />
              </div>
              <div>
                <label className="block text-gray-600 font-semibold mb-1">Account Holder</label>
                <input
                  type="text"
                  value={editForm.accountHolder || ''}
                  onChange={e => setEditForm({ ...editForm, accountHolder: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="Account Holder Name"
                />
              </div>
              <div>
                <label className="block text-gray-600 font-semibold mb-1">Account Number</label>
                <input
                  type="text"
                  value={editForm.accountNumber || ''}
                  onChange={e => setEditForm({ ...editForm, accountNumber: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono"
                  placeholder="Account Number"
                />
              </div>
              <div>
                <label className="block text-gray-600 font-semibold mb-1">IFSC / SWIFT Code</label>
                <input
                  type="text"
                  value={editForm.ifscCode || ''}
                  onChange={e => setEditForm({ ...editForm, ifscCode: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono"
                  placeholder="IFSC Code"
                />
              </div>
              <div>
                <label className="block text-gray-600 font-semibold mb-1">Branch Name</label>
                <input
                  type="text"
                  value={editForm.branchName || ''}
                  onChange={e => setEditForm({ ...editForm, branchName: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="Branch Name"
                />
              </div>
              <div>
                <label className="block text-gray-600 font-semibold mb-1">Statement Period</label>
                <input
                  type="text"
                  value={editForm.statementPeriod || ''}
                  onChange={e => setEditForm({ ...editForm, statementPeriod: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g. 01/04/2024 to 31/03/2025"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center shadow-xs"
              >
                <Check className="w-3.5 h-3.5 mr-1" /> Save Profile Details
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
            {/* Account Holder */}
            <div className="space-y-1">
              <span className="text-gray-400 flex items-center font-medium">
                <User className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> Account Holder
              </span>
              <p className="text-sm font-semibold text-gray-800">
                {account.accountHolder || '—'}
              </p>
            </div>

            {/* Account Number */}
            <div className="space-y-1">
              <span className="text-gray-400 flex items-center font-medium">
                <Hash className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> Account Number
              </span>
              <p className="text-sm font-semibold font-mono text-gray-800">
                {account.accountNumber || '—'}
              </p>
            </div>

            {/* IFSC / Routing */}
            <div className="space-y-1">
              <span className="text-gray-400 flex items-center font-medium">
                <CreditCard className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> IFSC / Routing Code
              </span>
              <p className="text-sm font-semibold font-mono text-blue-600">
                {account.ifscCode || '—'}
              </p>
            </div>

            {/* Branch */}
            <div className="space-y-1">
              <span className="text-gray-400 flex items-center font-medium">
                <Building2 className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> Branch & Code
              </span>
              <p className="text-sm font-medium text-gray-800">
                {account.branchName ? `${account.branchName} ${account.branchCode ? `(${account.branchCode})` : ''}` : '—'}
              </p>
            </div>

            {/* Statement Period */}
            <div className="space-y-1">
              <span className="text-gray-400 flex items-center font-medium">
                <Calendar className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> Statement Period
              </span>
              <p className="text-sm font-medium text-gray-800">
                {derivedPeriod}
              </p>
            </div>

            {/* Product Type */}
            <div className="space-y-1">
              <span className="text-gray-400 flex items-center font-medium">
                <Award className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> Account Type
              </span>
              <p className="text-sm font-medium text-gray-800">
                {account.productType || 'Savings / Current Account'}
              </p>
            </div>

            {/* Customer Address */}
            {account.customerAddress && (
              <div className="space-y-1 md:col-span-2">
                <span className="text-gray-400 flex items-center font-medium">
                  <MapPin className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> Address
                </span>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {account.customerAddress}
                </p>
              </div>
            )}

            {/* Email */}
            {account.email && (
              <div className="space-y-1">
                <span className="text-gray-400 flex items-center font-medium">
                  <Mail className="w-3.5 h-3.5 mr-1.5 text-gray-400" /> Registered Email
                </span>
                <p className="text-xs text-gray-800 font-mono">
                  {account.email}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Balance Reconciliation Audit Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6">
        <div className="flex items-center space-x-2.5 mb-4">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-bold text-gray-800">
            Statement Mathematical Reconciliation
          </h3>
        </div>

        <div className={`${isReconciled ? 'bg-blue-50/70 border-blue-100' : 'bg-amber-50/70 border-amber-200'} border rounded-xl p-4 flex items-start space-x-3.5`}>
          <div className={`w-8 h-8 rounded-full ${isReconciled ? 'bg-blue-600' : 'bg-amber-600'} text-white flex items-center justify-center shrink-0 mt-0.5`}>
            {isReconciled ? <FileCheck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          </div>
          <div className="text-xs text-gray-700 space-y-1.5 flex-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className={`font-semibold ${isReconciled ? 'text-blue-900' : 'text-amber-900'}`}>
                {isReconciled ? 'Reconciliation Verified (100% Match)' : 'Audit Reconciliation Summary'}
              </p>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${isReconciled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {isReconciled ? 'BALANCED' : `Diff: ${currencySymbol}${diff.toFixed(2)}`}
              </span>
            </div>
            <p className="text-gray-600 leading-relaxed font-mono text-[11px] bg-white/80 p-2 rounded border border-gray-200">
              Opening Balance ({currencySymbol}{openingBal.toFixed(2)}) + Credits ({currencySymbol}{calculatedCredits.toFixed(2)}) - Debits ({currencySymbol}{calculatedDebits.toFixed(2)}) = Closing Balance ({currencySymbol}{expectedClosing.toFixed(2)})
            </p>
            <p className="text-gray-600 text-xs">
              {transactions.length} rows processed • Total Deposits: {depositCount} ({currencySymbol}{calculatedCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) • Total Withdrawals: {withdrawalCount} ({currencySymbol}{calculatedDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })})
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};



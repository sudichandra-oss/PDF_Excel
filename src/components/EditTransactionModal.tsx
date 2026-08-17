import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { TransactionRow } from '../types';

interface EditTransactionModalProps {
  isOpen: boolean;
  transaction: TransactionRow | null; // null when adding new
  onClose: () => void;
  onSave: (tx: TransactionRow) => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  isOpen,
  transaction,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<Partial<TransactionRow>>({
    postDate: '',
    valueDate: '',
    branchCode: '',
    chequeNo: '',
    description: '',
    debit: null,
    credit: null,
    balance: null,
    balanceType: 'CR',
    mode: 'UPI',
    category: 'General',
  });

  useEffect(() => {
    if (transaction) {
      setFormData(transaction);
    } else {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const formattedDate = `${dd}/${mm}/${yyyy}`;

      setFormData({
        postDate: formattedDate,
        valueDate: formattedDate,
        branchCode: '',
        chequeNo: '',
        description: '',
        debit: null,
        credit: null,
        balance: null,
        balanceType: 'CR',
        mode: 'UPI',
        category: 'General',
      });
    }
  }, [transaction, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTx: TransactionRow = {
      id: transaction ? transaction.id : `tx-user-${Date.now()}`,
      postDate: formData.postDate || '',
      valueDate: formData.valueDate || formData.postDate || '',
      branchCode: formData.branchCode || '',
      chequeNo: formData.chequeNo || '',
      description: formData.description || 'Transaction',
      debit: formData.debit ? Number(formData.debit) : null,
      credit: formData.credit ? Number(formData.credit) : null,
      balance: formData.balance ? Number(formData.balance) : null,
      balanceType: formData.balanceType || 'CR',
      mode: formData.mode || 'OTHER',
      category: formData.category || 'General',
    };
    onSave(finalTx);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">
            {transaction ? 'Edit Transaction' : 'Add New Transaction'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 hover:bg-gray-100 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-800 mb-1">Post Date *</label>
              <input
                type="text"
                required
                placeholder="DD/MM/YYYY"
                value={formData.postDate || ''}
                onChange={(e) => setFormData({ ...formData, postDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-800 mb-1">Value Date</label>
              <input
                type="text"
                placeholder="DD/MM/YYYY"
                value={formData.valueDate || ''}
                onChange={(e) => setFormData({ ...formData, valueDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-800 mb-1">Transaction Description *</label>
            <input
              type="text"
              required
              placeholder="e.g. UPI/RRN 123456/Payment to Merchant"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-800 mb-1">Debit (Withdrawal)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.debit ?? ''}
                onChange={(e) => setFormData({ ...formData, debit: e.target.value ? parseFloat(e.target.value) : null, credit: null })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-red-600 bg-gray-50/50 outline-none transition-all font-semibold"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-800 mb-1">Credit (Deposit)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.credit ?? ''}
                onChange={(e) => setFormData({ ...formData, credit: e.target.value ? parseFloat(e.target.value) : null, debit: null })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-green-600 bg-gray-50/50 outline-none transition-all font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-800 mb-1">Running Balance</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.balance ?? ''}
                onChange={(e) => setFormData({ ...formData, balance: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono bg-gray-50/50 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-800 mb-1">Balance Type</label>
              <select
                value={formData.balanceType || 'CR'}
                onChange={(e) => setFormData({ ...formData, balanceType: e.target.value as 'CR' | 'DR' })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 outline-none transition-all"
              >
                <option value="CR">CR (Credit / Positive)</option>
                <option value="DR">DR (Debit / Overdraft)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-800 mb-1">Payment Mode</label>
              <select
                value={formData.mode || 'UPI'}
                onChange={(e) => setFormData({ ...formData, mode: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 outline-none transition-all"
              >
                <option value="UPI">UPI</option>
                <option value="NEFT">NEFT</option>
                <option value="IMPS">IMPS</option>
                <option value="CASH">CASH</option>
                <option value="TRANSFER">TRANSFER</option>
                <option value="CHARGES">CHARGES</option>
                <option value="INTEREST">INTEREST</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-gray-800 mb-1">Category</label>
              <input
                type="text"
                placeholder="e.g. PhonePe Transfer"
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 outline-none transition-all"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              <span>Save Transaction</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


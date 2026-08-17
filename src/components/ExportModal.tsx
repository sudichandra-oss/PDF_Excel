import React, { useState } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  Download, 
  FileText, 
  Database 
} from 'lucide-react';
import { BankStatementData, ExportSettings } from '../types';
import { exportStatementToExcel } from '../utils/excelExporter';

interface ExportModalProps {
  statement: BankStatementData;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  statement,
  isOpen,
  onClose,
}) => {
  const [format, setFormat] = useState<'xlsx' | 'csv' | 'json'>('xlsx');
  const [fileName, setFileName] = useState(() => {
    const base = statement.fileName.replace(/\.[^/.]+$/, '');
    return `${base}_Excel_Export`;
  });
  const [includeSummarySheet, setIncludeSummarySheet] = useState(true);
  const [includeCategoryColumn, setIncludeCategoryColumn] = useState(true);
  const [includeModeColumn, setIncludeModeColumn] = useState(true);
  const [amountFormat, setAmountFormat] = useState<'split' | 'single'>('split');
  const [dateFormat, setDateFormat] = useState<'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY'>('DD/MM/YYYY');

  if (!isOpen) return null;

  const handleExport = () => {
    const settings: ExportSettings = {
      format,
      fileName,
      includeSummarySheet,
      includeCategoryColumn,
      includeModeColumn,
      amountFormat,
      dateFormat,
    };
    exportStatementToExcel(statement, settings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden transform transition-all">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800">Export Bank Statement</h3>
              <p className="text-xs text-gray-500">{statement.transactions.length} transactions ready for export</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-xs text-gray-700">
          {/* Format selection */}
          <div>
            <label className="block font-semibold text-gray-800 mb-2">Export Format</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer ${
                  format === 'xlsx'
                    ? 'border-blue-600 bg-blue-50/80 text-blue-800 ring-2 ring-blue-500/20 font-semibold'
                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                }`}
              >
                <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                <span className="font-semibold text-xs">Excel (.xlsx)</span>
                <span className="text-[10px] text-gray-400">Multi-Sheet Formatted</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer ${
                  format === 'csv'
                    ? 'border-blue-600 bg-blue-50/80 text-blue-800 ring-2 ring-blue-500/20 font-semibold'
                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                }`}
              >
                <FileText className="w-6 h-6 text-blue-600" />
                <span className="font-semibold text-xs">CSV (.csv)</span>
                <span className="text-[10px] text-gray-400">Quick Accounting Import</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer ${
                  format === 'json'
                    ? 'border-blue-600 bg-blue-50/80 text-blue-800 ring-2 ring-blue-500/20 font-semibold'
                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                }`}
              >
                <Database className="w-6 h-6 text-blue-600" />
                <span className="font-semibold text-xs">JSON (.json)</span>
                <span className="text-[10px] text-gray-400">Raw Structured Data</span>
              </button>
            </div>
          </div>

          {/* File Name */}
          <div>
            <label htmlFor="export-filename" className="block font-semibold text-gray-800 mb-1.5">
              File Name
            </label>
            <input
              type="text"
              id="export-filename"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/60 font-medium outline-none transition-all"
            />
          </div>

          {/* Options */}
          <div className="space-y-2.5 pt-3 border-t border-gray-100">
            <span className="block font-semibold text-gray-800">Spreadsheet Options</span>

            {format === 'xlsx' && (
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSummarySheet}
                  onChange={(e) => setIncludeSummarySheet(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300"
                />
                <span className="text-gray-700">
                  Include <strong>Account Summary & Reconciliation Sheet</strong>
                </span>
              </label>
            )}

            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCategoryColumn}
                onChange={(e) => setIncludeCategoryColumn(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300"
              />
              <span className="text-gray-700">Include Category Tagging column</span>
            </label>

            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeModeColumn}
                onChange={(e) => setIncludeModeColumn(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300"
              />
              <span className="text-gray-700">Include Payment Mode (UPI, NEFT, IMPS, Cash) column</span>
            </label>
          </div>

          {/* Amount column layout */}
          <div className="pt-3 border-t border-gray-100">
            <span className="block font-semibold text-gray-800 mb-2">Amount Format</span>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="amountLayout"
                  value="split"
                  checked={amountFormat === 'split'}
                  onChange={() => setAmountFormat('split')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Separate Debit & Credit Columns (Recommended)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="amountLayout"
                  value="single"
                  checked={amountFormat === 'single'}
                  onChange={() => setAmountFormat('single')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Single Amount Column (+/-)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-xs font-semibold rounded-lg text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            id="btn-confirm-export"
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 mr-1.5" />
            <span>Download {format.toUpperCase()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};


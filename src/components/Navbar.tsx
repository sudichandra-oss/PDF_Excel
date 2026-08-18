import React from 'react';
import { FileSpreadsheet, Download, RefreshCw, UploadCloud, FileText, BarChart3, Table, ShieldCheck, Sparkles } from 'lucide-react';
import { BankStatementData, ViewTab } from '../types';

interface NavbarProps {
  statement: BankStatementData | null;
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  onOpenExport: () => void;
  onOpenMapping?: () => void;
  onQuickDownloadXlsx: () => void;
  onQuickDownloadCsv: () => void;
  onReset: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  statement,
  activeTab,
  onTabChange,
  onOpenExport,
  onOpenMapping,
  onQuickDownloadXlsx,
  onQuickDownloadCsv,
  onReset,
}) => {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
      {/* Top Level Brand Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-xs">
              X
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold tracking-tight text-gray-800">
                  Statement<span className="text-blue-600">Flow</span>
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                  <Sparkles className="w-3 h-3 mr-1 text-blue-500" /> PDF to Excel
                </span>
              </div>
              <p className="text-xs text-gray-400 font-medium hidden md:block">
                {statement
                  ? `${statement.fileName} • ${statement.transactions.length} rows loaded`
                  : 'Automated bank statement extraction & spreadsheet generator'}
              </p>
            </div>
          </div>

          {/* Right Status & Actions */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs font-medium text-gray-600">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span>System Ready</span>
            </div>

            {statement && (
              <div className="flex items-center space-x-2">
                {onOpenMapping && (
                  <button
                    onClick={onOpenMapping}
                    id="btn-map-columns-nav"
                    className="inline-flex items-center px-3 py-1.5 border border-indigo-200 text-xs font-semibold rounded-lg text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 transition-colors shadow-2xs cursor-pointer"
                    title="Manually map columns"
                  >
                    <Table className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                    <span>Map Columns</span>
                  </button>
                )}

                <button
                  onClick={onReset}
                  id="btn-upload-new"
                  className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
                  title="Upload another statement"
                >
                  <UploadCloud className="w-3.5 h-3.5 sm:mr-1.5 text-gray-500" />
                  <span className="hidden sm:inline">Upload New</span>
                </button>

                <button
                  onClick={onQuickDownloadCsv}
                  id="btn-quick-csv"
                  className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
                  title="Download CSV"
                >
                  <Download className="w-3.5 h-3.5 mr-1 text-gray-400" />
                  <span>CSV</span>
                </button>

                <button
                  onClick={onQuickDownloadXlsx}
                  id="btn-quick-excel"
                  className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors shadow-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
                  <span>Download Excel</span>
                </button>

                <button
                  onClick={onOpenExport}
                  id="btn-export-options"
                  className="hidden md:inline-flex items-center px-2.5 py-1.5 border border-blue-200 text-xs font-medium rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 cursor-pointer"
                >
                  Custom Export...
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Navigation (Sleek Interface style) */}
      {statement && (
        <div className="border-t border-gray-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex space-x-6">
            <button
              onClick={() => onTabChange('spreadsheet')}
              id="tab-spreadsheet"
              className={`py-3 px-1 border-b-2 text-xs font-semibold flex items-center space-x-2 transition-colors ${
                activeTab === 'spreadsheet'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>Preview Table ({statement.transactions.length})</span>
            </button>

            <button
              onClick={() => onTabChange('summary')}
              id="tab-summary"
              className={`py-3 px-1 border-b-2 text-xs font-semibold flex items-center space-x-2 transition-colors ${
                activeTab === 'summary'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Account Summary</span>
            </button>

            <button
              onClick={() => onTabChange('insights')}
              id="tab-insights"
              className={`py-3 px-1 border-b-2 text-xs font-semibold flex items-center space-x-2 transition-colors ${
                activeTab === 'insights'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics & Cashflow</span>
            </button>

            <button
              onClick={() => onTabChange('raw')}
              id="tab-raw"
              className={`py-3 px-1 border-b-2 text-xs font-semibold flex items-center space-x-2 transition-colors ${
                activeTab === 'raw'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Raw Text / OCR</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};


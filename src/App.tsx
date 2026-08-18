import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { FileUploadZone } from './components/FileUploadZone';
import { SpreadsheetGrid } from './components/SpreadsheetGrid';
import { StatementSummary } from './components/StatementSummary';
import { FinancialInsights } from './components/FinancialInsights';
import { RawTextView } from './components/RawTextView';
import { ExportModal } from './components/ExportModal';
import { EditTransactionModal } from './components/EditTransactionModal';
import { ManualMappingModal } from './components/ManualMappingModal';
import { BankStatementData, TransactionRow, AccountMetadata, ViewTab } from './types';
import { exportStatementToExcel } from './utils/excelExporter';
import { FileCheck, Sparkles, SlidersHorizontal } from 'lucide-react';

export default function App() {
  const [statement, setStatement] = useState<BankStatementData | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('spreadsheet');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionRow | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleStatementLoaded = (data: BankStatementData) => {
    setStatement(data);
    setActiveTab('spreadsheet');
    showToast(`Converted ${data.transactions.length} transactions into spreadsheet!`);
  };

  const handleReset = () => {
    setStatement(null);
  };

  const handleQuickDownloadXlsx = () => {
    if (!statement) return;
    exportStatementToExcel(statement, {
      format: 'xlsx',
      fileName: statement.fileName.replace(/\.[^/.]+$/, ''),
      includeSummarySheet: true,
      includeCategoryColumn: true,
      includeModeColumn: true,
      dateFormat: 'DD/MM/YYYY',
      amountFormat: 'split',
    });
    showToast('Downloaded Excel (.xlsx) file with Summary & Transactions sheets!');
  };

  const handleQuickDownloadCsv = () => {
    if (!statement) return;
    exportStatementToExcel(statement, {
      format: 'csv',
      fileName: statement.fileName.replace(/\.[^/.]+$/, ''),
      includeSummarySheet: false,
      includeCategoryColumn: true,
      includeModeColumn: true,
      dateFormat: 'DD/MM/YYYY',
      amountFormat: 'split',
    });
    showToast('Downloaded CSV file!');
  };

  const handleUpdateTransactions = (updated: TransactionRow[]) => {
    if (!statement) return;
    setStatement({
      ...statement,
      transactions: updated,
    });
  };

  const handleUpdateAccount = (updatedAcc: AccountMetadata) => {
    if (!statement) return;
    setStatement({
      ...statement,
      account: updatedAcc,
    });
    showToast('Account details updated');
  };

  const handleApplyManualMapping = (newStatement: BankStatementData) => {
    setStatement(newStatement);
    showToast(`Re-mapped columns for ${newStatement.transactions.length} transactions!`);
  };

  const handleSaveTransaction = (tx: TransactionRow) => {
    if (!statement) return;
    const exists = statement.transactions.some(t => t.id === tx.id);
    let updatedList: TransactionRow[];
    if (exists) {
      updatedList = statement.transactions.map(t => (t.id === tx.id ? tx : t));
    } else {
      updatedList = [tx, ...statement.transactions];
    }
    setStatement({
      ...statement,
      transactions: updatedList,
    });
    showToast(exists ? 'Transaction updated' : 'New transaction added');
  };

  const handleOpenEditModal = (tx: TransactionRow) => {
    setEditingTransaction(tx);
    setIsEditModalOpen(true);
  };

  const handleOpenAddModal = () => {
    setEditingTransaction(null);
    setIsEditModalOpen(true);
  };

  const displayPeriod = statement ? (
    statement.account.statementPeriod || (
      statement.transactions.length > 0 
        ? `${statement.transactions[0].postDate} to ${statement.transactions[statement.transactions.length - 1].postDate}`
        : 'Active Period'
    )
  ) : '';

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans text-gray-900">
      {/* Navigation Bar */}
      <Navbar
        statement={statement}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenExport={() => setIsExportModalOpen(true)}
        onOpenMapping={() => setIsMappingModalOpen(true)}
        onQuickDownloadXlsx={handleQuickDownloadXlsx}
        onQuickDownloadCsv={handleQuickDownloadCsv}
        onReset={handleReset}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg flex items-center space-x-2 animate-fade-in border border-gray-700">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {!statement ? (
          <FileUploadZone
            onStatementLoaded={handleStatementLoaded}
          />
        ) : (
          <div>
            {/* Context Info Banner */}
            <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-gray-900 text-sm">
                      {statement.account.bankName || 'Bank Statement'}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Parsed Active
                    </span>
                  </div>
                  <p className="text-gray-500 mt-0.5">
                    Account: <span className="font-mono font-semibold text-gray-800">{statement.account.accountNumber || '—'}</span> • {statement.transactions.length} Transactions Loaded
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  id="btn-trigger-mapping-banner"
                  onClick={() => setIsMappingModalOpen(true)}
                  className="inline-flex items-center px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                  Map Columns
                </button>

                <div className="flex items-center space-x-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                  <span className="text-gray-400">Statement Period:</span>
                  <span className="font-semibold text-gray-700">
                    {displayPeriod}
                  </span>
                </div>
              </div>
            </div>

            {/* Tab Views */}
            {activeTab === 'spreadsheet' && (
              <SpreadsheetGrid
                transactions={statement.transactions}
                currencySymbol={statement.account.currency?.includes('$') ? '$' : '₹'}
                onUpdateTransactions={handleUpdateTransactions}
                onOpenAddModal={handleOpenAddModal}
                onOpenEditModal={handleOpenEditModal}
                onOpenMapping={() => setIsMappingModalOpen(true)}
              />
            )}

            {activeTab === 'summary' && (
              <StatementSummary
                account={statement.account}
                transactions={statement.transactions}
                currencySymbol={statement.account.currency?.includes('$') ? '$' : '₹'}
                onUpdateAccount={handleUpdateAccount}
              />
            )}

            {activeTab === 'insights' && (
              <FinancialInsights
                transactions={statement.transactions}
                currencySymbol={statement.account.currency?.includes('$') ? '$' : '₹'}
              />
            )}

            {activeTab === 'raw' && (
              <RawTextView
                statement={statement}
                onStatementReparsed={handleStatementLoaded}
              />
            )}
          </div>
        )}
      </main>

      {/* Export Customizer Modal */}
      {statement && (
        <ExportModal
          statement={statement}
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}

      {/* Manual Column Mapping Modal */}
      {statement && (
        <ManualMappingModal
          statement={statement}
          isOpen={isMappingModalOpen}
          onClose={() => setIsMappingModalOpen(false)}
          onApplyMapping={handleApplyManualMapping}
        />
      )}

      {/* Add / Edit Transaction Row Modal */}
      <EditTransactionModal
        isOpen={isEditModalOpen}
        transaction={editingTransaction}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveTransaction}
      />

      {/* Google-like minimal footer */}
      <footer className="border-t border-gray-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-gray-500">
          Bank Statement PDF to Excel Converter • Accurate Column Extraction & Mathematical Audit Check
        </div>
      </footer>
    </div>
  );
}


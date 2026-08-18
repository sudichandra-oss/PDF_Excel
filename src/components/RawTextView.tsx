import React, { useState, useEffect } from 'react';
import { Copy, Check, RefreshCw, FileText, Code2, ShieldAlert, Sparkles } from 'lucide-react';
import { BankStatementData } from '../types';
import { parseRawBankStatementText, toCaretDelimitedString } from '../utils/textTableParser';

interface RawTextViewProps {
  statement: BankStatementData;
  onStatementReparsed: (updated: BankStatementData) => void;
}

export const RawTextView: React.FC<RawTextViewProps> = ({
  statement,
  onStatementReparsed,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'caret' | 'table'>('caret');
  const [editableText, setEditableText] = useState('');

  // Re-generate text when statement or viewMode changes
  useEffect(() => {
    if (viewMode === 'caret') {
      const caretStr = statement.rawCaretText || toCaretDelimitedString(statement.transactions, statement.account);
      setEditableText(caretStr);
    } else {
      const header = [
        statement.account.bankName,
        `Account Number: ${statement.account.accountNumber}`,
        `IFSC Code: ${statement.account.ifscCode || ''}`,
        `Branch: ${statement.account.branchName || ''} (Code: ${statement.account.branchCode || ''})`,
        `Account Holder: ${statement.account.accountHolder}`,
        `Period: ${statement.account.statementPeriod || ''}`,
        '---------------------------------------------------------------------------------',
        'Post Date   Value Date   Branch   Description   Debit   Credit   Balance',
        '---------------------------------------------------------------------------------',
      ].join('\n');

      const body = statement.transactions
        .map(
          tx =>
            `${tx.postDate}  ${tx.valueDate || tx.postDate}  ${tx.branchCode || '00000'}  ${tx.description}  ${
              tx.debit !== null && tx.debit !== undefined ? Number(tx.debit).toFixed(2) : ''
            }  ${tx.credit !== null && tx.credit !== undefined ? Number(tx.credit).toFixed(2) : ''}  ${
              tx.balance !== null && tx.balance !== undefined ? Number(tx.balance).toFixed(2) : ''
            } ${tx.balanceType || 'CR'}`
        )
        .join('\n');

      setEditableText(`${header}\n${body}`);
    }
  }, [statement, viewMode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editableText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReparse = () => {
    try {
      const reparsed = parseRawBankStatementText(editableText, statement.fileName);
      onStatementReparsed(reparsed);
    } catch (err: any) {
      alert(`Error re-parsing text: ${err.message || String(err)}`);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800">Raw Bank Statement & Caret (^) Delimited Data</h3>
            <p className="text-xs text-gray-500">
              Stored and parsed with <code className="font-mono text-blue-600 font-semibold">^</code> delimiter to protect against comma separation errors.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setViewMode('caret')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'caret' ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 inline mr-1" /> Caret (^) Format
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Formatted Plain Text
            </button>
          </div>

          <button
            onClick={handleCopy}
            id="btn-copy-raw-text"
            className="inline-flex items-center px-3.5 py-2 border border-gray-200 text-xs font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5 text-green-600" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5 text-gray-500" /> Copy Text
              </>
            )}
          </button>

          <button
            onClick={handleReparse}
            id="btn-reparse-raw-text"
            className="inline-flex items-center px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Re-parse into Spreadsheet
          </button>
        </div>
      </div>

      {viewMode === 'caret' && (
        <div className="flex items-center space-x-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Safe Delimiter Active:</strong> Fields are separated by <code className="font-mono bg-emerald-100 px-1 py-0.5 rounded font-bold">^</code> (Caret).
            This guarantees that amounts with commas (e.g. ₹1,50,000.00) or narrations with commas never get split or inflated.
          </span>
        </div>
      )}

      <textarea
        id="raw-text-area"
        value={editableText}
        onChange={(e) => setEditableText(e.target.value)}
        rows={16}
        className="w-full text-xs font-mono p-4 border border-gray-200 rounded-xl bg-gray-50/70 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none leading-relaxed transition-all"
        placeholder="Edit or paste Caret (^) delimited statement lines here..."
      />
    </div>
  );
};



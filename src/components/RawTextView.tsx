import React, { useState } from 'react';
import { Copy, Check, RefreshCw, FileText } from 'lucide-react';
import { BankStatementData } from '../types';
import { parseRawBankStatementText } from '../utils/textTableParser';

interface RawTextViewProps {
  statement: BankStatementData;
  onStatementReparsed: (updated: BankStatementData) => void;
}

export const RawTextView: React.FC<RawTextViewProps> = ({
  statement,
  onStatementReparsed,
}) => {
  const [copied, setCopied] = useState(false);
  const [editableText, setEditableText] = useState(() => {
    // Generate text representation of statement
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
            tx.debit ? tx.debit.toFixed(2) : ''
          }  ${tx.credit ? tx.credit.toFixed(2) : ''}  ${
            tx.balance !== null ? tx.balance.toFixed(2) : ''
          } ${tx.balanceType || 'CR'}`
      )
      .join('\n');

    return `${header}\n${body}`;
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(editableText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReparse = () => {
    const reparsed = parseRawBankStatementText(editableText, statement.fileName);
    onStatementReparsed(reparsed);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-bold text-gray-800">Raw Bank Statement & OCR Text</h3>
        </div>

        <div className="flex items-center space-x-2">
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

      <p className="text-xs text-gray-500">
        You can edit the raw text or paste new statement lines below, then click &quot;Re-parse into Spreadsheet&quot; to refresh the table.
      </p>

      <textarea
        id="raw-text-area"
        value={editableText}
        onChange={(e) => setEditableText(e.target.value)}
        rows={16}
        className="w-full text-xs font-mono p-4 border border-gray-200 rounded-xl bg-gray-50/70 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none leading-relaxed transition-all"
      />
    </div>
  );
};


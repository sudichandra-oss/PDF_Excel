import * as XLSX from 'xlsx';
import { BankStatementData, ExportSettings, TransactionRow } from '../types';

export function exportStatementToExcel(
  statement: BankStatementData,
  settings: ExportSettings
) {
  const wb = XLSX.utils.book_new();

  // 1. Prepare Summary Sheet if requested
  if (settings.includeSummarySheet) {
    const summaryData = [
      ['BANK STATEMENT SUMMARY', ''],
      ['', ''],
      ['Bank Name', statement.account.bankName || 'N/A'],
      ['Account Holder', statement.account.accountHolder || 'N/A'],
      ['Account Number', statement.account.accountNumber ? `="${statement.account.accountNumber}"` : 'N/A'],
      ['Branch Name', statement.account.branchName || 'N/A'],
      ['Branch Code', statement.account.branchCode || 'N/A'],
      ['IFSC Code', statement.account.ifscCode || 'N/A'],
      ['Statement Period', statement.account.statementPeriod || `${statement.account.startDate || ''} to ${statement.account.endDate || ''}`],
      ['Statement Date', statement.account.statementDate || 'N/A'],
      ['Currency', statement.account.currency || 'INR'],
      ['', ''],
      ['FINANCIAL OVERVIEW', ''],
      ['Opening Balance', statement.account.openingBalance ?? 0],
      ['Total Credits (Inflow)', statement.account.totalCredits ?? calculateTotalCredits(statement.transactions)],
      ['Total Debits (Outflow)', statement.account.totalDebits ?? calculateTotalDebits(statement.transactions)],
      ['Net Cashflow', (statement.account.totalCredits ?? calculateTotalCredits(statement.transactions)) - (statement.account.totalDebits ?? calculateTotalDebits(statement.transactions))],
      ['Closing Balance', statement.account.closingBalance ?? 0],
      ['Total Transactions', statement.transactions.length],
      ['Credits Count', statement.transactions.filter(t => (t.credit || 0) > 0).length],
      ['Debits Count', statement.transactions.filter(t => (t.debit || 0) > 0).length],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Set column widths for summary
    wsSummary['!cols'] = [{ wch: 26 }, { wch: 45 }];

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  }

  // 2. Prepare Transactions Sheet
  const txRows: Record<string, any>[] = statement.transactions.map((tx, idx) => {
    const row: Record<string, any> = {
      'S.No': idx + 1,
      'Post Date': tx.postDate,
    };

    if (tx.valueDate) {
      row['Value Date'] = tx.valueDate;
    }
    if (tx.branchCode) {
      row['Branch Code'] = tx.branchCode;
    }
    if (tx.chequeNo) {
      row['Cheque / Ref No'] = tx.chequeNo;
    }

    row['Transaction Description'] = tx.description;

    if (settings.includeCategoryColumn && tx.category) {
      row['Category'] = tx.category;
    }
    if (settings.includeModeColumn && tx.mode) {
      row['Mode'] = tx.mode;
    }

    // IMPORTANT: null/undefined debit, credit, and balance values are always
    // exported as an empty cell ('') — never as a sentinel number like -1.
    if (settings.amountFormat === 'split') {
      row['Debit (Withdrawal)'] = tx.debit != null ? Number(tx.debit) : '';
      row['Credit (Deposit)'] = tx.credit != null ? Number(tx.credit) : '';
    } else {
      const hasDebit = tx.debit != null;
      const hasCredit = tx.credit != null;
      if (hasDebit || hasCredit) {
        const netAmount = (tx.credit ?? 0) - (tx.debit ?? 0);
        row['Amount'] = netAmount;
        row['Type'] = hasCredit ? 'Credit' : 'Debit';
      } else {
        row['Amount'] = '';
        row['Type'] = '';
      }
    }

    row['Balance'] = tx.balance != null ? Number(tx.balance) : '';
    if (tx.balanceType) {
      row['Dr/Cr'] = tx.balanceType;
    }

    return row;
  });

  const wsTransactions = XLSX.utils.json_to_sheet(txRows);

  // Set column widths for transactions
  wsTransactions['!cols'] = [
    { wch: 6 },  // S.No
    { wch: 12 }, // Post Date
    { wch: 12 }, // Value Date
    { wch: 12 }, // Branch Code
    { wch: 16 }, // Cheque / Ref No
    { wch: 52 }, // Description
    { wch: 18 }, // Category
    { wch: 10 }, // Mode
    { wch: 16 }, // Debit
    { wch: 16 }, // Credit
    { wch: 16 }, // Balance
    { wch: 8 },  // Dr/Cr
  ];

  XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transactions');

  // Trigger download
  const cleanName = settings.fileName.replace(/\.[^/.]+$/, '') || 'Bank_Statement';

  if (settings.format === 'csv') {
    // Generate CSV from transactions
    const csvOutput = XLSX.utils.sheet_to_csv(wsTransactions);
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cleanName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  } else if (settings.format === 'json') {
    // Generate JSON
    const jsonOutput = JSON.stringify(statement, null, 2);
    const blob = new Blob([jsonOutput], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cleanName}.json`;
    link.click();
    URL.revokeObjectURL(url);
  } else {
    // Generate .xlsx
    XLSX.writeFile(wb, `${cleanName}.xlsx`, { bookType: 'xlsx' });
  }
}

export function calculateTotalCredits(transactions: TransactionRow[]): number {
  return transactions.reduce((acc, t) => acc + (Number(t.credit) || 0), 0);
}

export function calculateTotalDebits(transactions: TransactionRow[]): number {
  return transactions.reduce((acc, t) => acc + (Number(t.debit) || 0), 0);
}

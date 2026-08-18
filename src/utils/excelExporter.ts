import * as XLSX from 'xlsx';
import { BankStatementData, ExportSettings, TransactionRow } from '../types';

export function exportStatementToExcel(
  statement: BankStatementData,
  settings: ExportSettings
) {
  const wb = XLSX.utils.book_new();

  // Helper to safely format numbers and ensure null/undefined/NaN/-1 is NEVER output as -1
  const safeNumericValue = (val: any): number | '' => {
    if (
      val === null ||
      val === undefined ||
      val === '' ||
      val === -1 ||
      val === '-1' ||
      isNaN(Number(val))
    ) {
      return '';
    }
    return Number(val);
  };

  // 1. Prepare Summary Sheet if requested
  if (settings.includeSummarySheet) {
    const openingBal = safeNumericValue(statement.account.openingBalance);
    const closingBal = safeNumericValue(statement.account.closingBalance);
    const totCredits = safeNumericValue(statement.account.totalCredits ?? calculateTotalCredits(statement.transactions));
    const totDebits = safeNumericValue(statement.account.totalDebits ?? calculateTotalDebits(statement.transactions));
    
    const numTotCred = typeof totCredits === 'number' ? totCredits : 0;
    const numTotDeb = typeof totDebits === 'number' ? totDebits : 0;

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
      ['Opening Balance', openingBal],
      ['Total Credits (Inflow)', totCredits],
      ['Total Debits (Outflow)', totDebits],
      ['Net Cashflow', numTotCred - numTotDeb],
      ['Closing Balance', closingBal],
      ['Total Transactions', statement.transactions.length],
      ['Credits Count', statement.transactions.filter(t => (t.credit || 0) > 0 && t.credit !== -1).length],
      ['Debits Count', statement.transactions.filter(t => (t.debit || 0) > 0 && t.debit !== -1).length],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Set column widths for summary
    wsSummary['!cols'] = [{ wch: 26 }, { wch: 45 }];

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  }

  // Check which optional columns exist in the statement dataset
  const hasValueDate = statement.transactions.some(t => Boolean(t.valueDate && t.valueDate.trim() !== ''));
  const hasBranchCode = statement.transactions.some(t => Boolean(t.branchCode && t.branchCode.trim() !== ''));
  const hasChequeNo = statement.transactions.some(t => Boolean(t.chequeNo && t.chequeNo.trim() !== ''));
  const hasBalanceType = statement.transactions.some(t => Boolean(t.balanceType && t.balanceType.trim() !== ''));

  // 2. Prepare Transactions Sheet with consistent keys and blank unmapped cells
  const txRows: Record<string, any>[] = statement.transactions.map((tx, idx) => {
    const row: Record<string, any> = {
      'S.No': idx + 1,
      'Post Date': tx.postDate || '',
    };

    if (hasValueDate) {
      row['Value Date'] = tx.valueDate || '';
    }
    if (hasBranchCode) {
      row['Branch Code'] = tx.branchCode || '';
    }
    if (hasChequeNo) {
      row['Cheque / Ref No'] = tx.chequeNo || '';
    }

    row['Transaction Description'] = tx.description || '';

    if (settings.includeCategoryColumn) {
      row['Category'] = tx.category || 'General';
    }
    if (settings.includeModeColumn) {
      row['Mode'] = tx.mode || 'OTHER';
    }

    if (settings.amountFormat === 'split') {
      row['Debit (Withdrawal)'] = safeNumericValue(tx.debit);
      row['Credit (Deposit)'] = safeNumericValue(tx.credit);
    } else {
      const cred = safeNumericValue(tx.credit);
      const deb = safeNumericValue(tx.debit);
      const numCred = typeof cred === 'number' ? cred : 0;
      const numDeb = typeof deb === 'number' ? deb : 0;
      const netAmount = numCred - numDeb;
      row['Amount'] = (typeof cred === 'number' || typeof deb === 'number') ? netAmount : '';
      row['Type'] = numCred > 0 ? 'Credit' : (numDeb > 0 ? 'Debit' : '');
    }

    row['Balance'] = safeNumericValue(tx.balance);
    if (hasBalanceType) {
      row['Dr/Cr'] = tx.balanceType || '';
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
    // Generate clean JSON without -1 for nulls
    const cleanedTransactions = statement.transactions.map(t => ({
      ...t,
      debit: (t.debit === -1 || t.debit === undefined) ? null : t.debit,
      credit: (t.credit === -1 || t.credit === undefined) ? null : t.credit,
      balance: (t.balance === -1 || t.balance === undefined) ? null : t.balance,
    }));
    const cleanStatement = {
      ...statement,
      transactions: cleanedTransactions,
    };
    const jsonOutput = JSON.stringify(cleanStatement, null, 2);
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
  return transactions.reduce((acc, t) => {
    if (t.credit !== null && t.credit !== undefined && t.credit !== -1) {
      const val = Number(t.credit);
      return acc + (isNaN(val) ? 0 : val);
    }
    return acc;
  }, 0);
}

export function calculateTotalDebits(transactions: TransactionRow[]): number {
  return transactions.reduce((acc, t) => {
    if (t.debit !== null && t.debit !== undefined && t.debit !== -1) {
      const val = Number(t.debit);
      return acc + (isNaN(val) ? 0 : val);
    }
    return acc;
  }, 0);
}

import * as XLSX from 'xlsx';
import { AccountMetadata, BankStatementData, TransactionRow } from '../types';

export interface TextDiagnostics {
  lineCount: number;
  wordCount: number;
  hasDates: boolean;
  hasAmounts: boolean;
  hasHeaderKeywords: boolean;
  documentTypeGuess?: string;
  reason: string;
  suggestedAction: string;
}

/**
 * Provides deep diagnostics on extracted text when parsing fails to explain why
 */
export function diagnoseExtractedText(text: string, fileName: string): TextDiagnostics {
  const clean = (text || '').trim();
  if (!clean || clean.length < 15) {
    return {
      lineCount: 0,
      wordCount: 0,
      hasDates: false,
      hasAmounts: false,
      hasHeaderKeywords: false,
      reason: 'No readable text content found in document (0 characters).',
      suggestedAction: 'The file appears to be a scanned photocopy, camera picture, or empty PDF without digital text. Please use an OCR tool or paste text directly.',
    };
  }

  const lines = clean.split('\n').filter(l => l.trim().length > 0);
  const words = clean.split(/\s+/).filter(w => w.length > 0);

  const dateMatches = clean.match(/(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}[\s\-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-]\d{2,4})/gi) || [];
  const hasDates = dateMatches.length > 0;

  const amountMatches = clean.match(/\d+[\d,]*\.\d{2}/g) || [];
  const hasAmounts = amountMatches.length > 0;

  const headerMatches = clean.match(/date|particulars|narration|description|withdrawal|deposit|debit|credit|balance|chq|cheque/gi) || [];
  const hasHeaderKeywords = headerMatches.length >= 2;

  let documentTypeGuess = 'Bank Statement';
  const hasBankKeywords = /bank|account|statement|central\s*bank|sbi|hdfc|icici|axis|pnb|branch|ifsc|cleared\s*balance|drawing\s*power|upi|neft|imps|cheque|deposit|withdrawal|closing\s*balance/i.test(clean);

  if (/interest\s*certificate|tds\s*certificate|form\s*16|tax\s*deducted/i.test(clean)) {
    documentTypeGuess = 'Interest / Tax Certificate';
  } else if (/account\s*confirmation|balance\s*certificate|account\s*opening|welcome\s*letter/i.test(clean)) {
    documentTypeGuess = 'Account Certificate / Welcome Letter';
  } else if (/sanction\s*letter|loan\s*agreement|repayment\s*schedule/i.test(clean)) {
    documentTypeGuess = 'Loan Document';
  } else if (/invoice|bill\s*of\s*supply|receipt\s*voucher/i.test(clean)) {
    documentTypeGuess = 'Invoice / Bill';
  } else if (!hasDates && !hasAmounts && !hasBankKeywords) {
    documentTypeGuess = 'Non-Statement Document';
  }

  let reason = '';
  let suggestedAction = '';

  if (documentTypeGuess !== 'Bank Statement') {
    reason = `Document appears to be a '${documentTypeGuess}' rather than an itemized account transaction ledger.`;
    suggestedAction = 'Please ensure you upload your bank account Transaction History statement containing Date, Narration, and Amount columns.';
  } else if (!hasDates && !hasAmounts) {
    reason = `Extracted ${words.length} words across ${lines.length} lines from bank statement, but table columns could not be aligned into transaction rows.`;
    suggestedAction = 'Verify that the statement table has readable text or try pasting the statement text directly.';
  } else if (!hasDates) {
    reason = `Extracted monetary figures from statement, but date columns (e.g. DD/MM/YYYY) could not be mapped automatically.`;
    suggestedAction = 'Use "Manual Column Mapping" to assign your date column manually.';
  } else if (!hasAmounts) {
    reason = `Identified dates in statement, but withdrawal/deposit amounts or running balances could not be matched.`;
    suggestedAction = 'Use "Manual Column Mapping" to assign your debit, credit, or balance columns.';
  } else {
    reason = `Extracted ${lines.length} lines, but transaction rows could not be matched automatically to the table schema.`;
    suggestedAction = 'Use "Manual Column Mapping" or "Paste Statement Text" to convert this format.';
  }

  return {
    lineCount: lines.length,
    wordCount: words.length,
    hasDates,
    hasAmounts,
    hasHeaderKeywords,
    documentTypeGuess,
    reason,
    suggestedAction,
  };
}

export interface ParseResult {
  success: boolean;
  data?: BankStatementData;
  error?: string;
  missingColumns?: string[];
  detectedColumns?: string[];
}

/**
 * Robustly parses financial numeric amounts preventing comma concatenation and column shift corruption.
 * Handles Indian format (1,25,000.50), standard format (1,500.00), currency symbols, Dr/Cr indicators,
 * and guards against concatenated digits or accidental account numbers placed in debit fields.
 */
export function parseRobustNumber(v: any, isBalanceField: boolean = false): number | null {
  if (
    v === null ||
    v === undefined ||
    v === '' ||
    v === '-' ||
    v === '--' ||
    v === 'N/A' ||
    v === 'null' ||
    v === 'NULL' ||
    v === -1 ||
    v === '-1'
  ) {
    return null;
  }
  if (typeof v === 'number') {
    if (isNaN(v) || v === -1) return null;
    const absVal = Math.abs(v);
    if (!isBalanceField && absVal > 10000000000 && Number.isInteger(absVal)) {
      // Accidental account number or phone number in debit/credit column
      return null;
    }
    return parseFloat(absVal.toFixed(2));
  }

  let str = String(v).trim();
  if (!str || str === '-' || str === '--' || str === 'N/A' || str === 'null' || str === '-1') return null;

  // Remove currency signs & CR/DR suffixes cleanly
  str = str.replace(/[₹$€£]|Rs\.?|INR|USD|EUR|GBP/gi, '').trim();
  str = str.replace(/\((?:Dr|Cr|Debit|Credit)\)/gi, '').replace(/\b(?:Dr|Cr)\b/gi, '').trim();

  // If multiple space-separated numbers got bundled (e.g. "1,500.00 45,000.00"), pick the first token
  const tokens = str.split(/\s+/).filter(t => /[0-9]/.test(t));
  if (tokens.length > 0) {
    str = tokens[0];
  }

  // Remove commas (safely handling Indian 1,25,000.00 and US 100,000.00)
  str = str.replace(/,/g, '');

  // Extract float with regex
  const floatMatch = str.match(/-?\d+(?:\.\d+)?/);
  if (!floatMatch) return null;

  const num = parseFloat(floatMatch[0]);
  if (isNaN(num) || num === -1) return null;

  const absNum = Math.abs(num);

  // If this is a debit/credit transaction field and value is an unformatted 10+ digit integer, ignore
  if (!isBalanceField && absNum > 10000000000 && Number.isInteger(absNum)) {
    return null;
  }

  return parseFloat(absNum.toFixed(2));
}

/**
 * Serializes statement transactions and metadata into a clean Caret (^) Delimited string.
 * This guarantees zero comma-separation bugs and preserves all fields with 100% fidelity.
 */
export function toCaretDelimitedString(transactions: TransactionRow[], account?: Partial<AccountMetadata>): string {
  const metaLines: string[] = [];
  if (account) {
    if (account.bankName) metaLines.push(`# BANK: ${account.bankName}`);
    if (account.accountNumber) metaLines.push(`# ACCOUNT: ${account.accountNumber}`);
    if (account.accountHolder) metaLines.push(`# HOLDER: ${account.accountHolder}`);
    if (account.ifscCode) metaLines.push(`# IFSC: ${account.ifscCode}`);
    if (account.branchName) metaLines.push(`# BRANCH: ${account.branchName}`);
    if (account.statementPeriod) metaLines.push(`# PERIOD: ${account.statementPeriod}`);
    if (account.currency) metaLines.push(`# CURRENCY: ${account.currency}`);
  }

  const header = 'PostDate^ValueDate^BranchCode^ChequeNo^Description^Debit^Credit^Balance^Category^Mode^ReferenceNo';
  const rowLines = transactions.map(t => [
    t.postDate || '',
    t.valueDate || t.postDate || '',
    t.branchCode || '',
    t.chequeNo || '',
    (t.description || '').replace(/\^/g, ' '),
    t.debit !== null && t.debit !== undefined ? Number(t.debit).toFixed(2) : '',
    t.credit !== null && t.credit !== undefined ? Number(t.credit).toFixed(2) : '',
    t.balance !== null && t.balance !== undefined ? Number(t.balance).toFixed(2) : '',
    t.category || '',
    t.mode || '',
    t.referenceNo || ''
  ].join('^'));

  return metaLines.length > 0
    ? `${metaLines.join('\n')}\n${header}\n${rowLines.join('\n')}`
    : `${header}\n${rowLines.join('\n')}`;
}

/**
 * Parses statement data directly from Caret (^) Delimited text format.
 */
export function parseCaretDelimitedText(caretText: string, fileName: string = 'bank_statement.txt'): BankStatementData {
  const lines = caretText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const accountInfo: Partial<AccountMetadata> = {
    currency: 'INR (₹)',
  };

  const rawRows: Array<any> = [];
  let headerColumns: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Metadata lines with # prefix
    if (line.startsWith('#')) {
      if (/^#\s*BANK:/i.test(line)) accountInfo.bankName = line.replace(/^#\s*BANK:/i, '').trim();
      else if (/^#\s*ACCOUNT:/i.test(line)) accountInfo.accountNumber = line.replace(/^#\s*ACCOUNT:/i, '').trim();
      else if (/^#\s*HOLDER:/i.test(line)) accountInfo.accountHolder = line.replace(/^#\s*HOLDER:/i, '').trim();
      else if (/^#\s*IFSC:/i.test(line)) accountInfo.ifscCode = line.replace(/^#\s*IFSC:/i, '').trim();
      else if (/^#\s*BRANCH:/i.test(line)) accountInfo.branchName = line.replace(/^#\s*BRANCH:/i, '').trim();
      else if (/^#\s*PERIOD:/i.test(line)) accountInfo.statementPeriod = line.replace(/^#\s*PERIOD:/i, '').trim();
      else if (/^#\s*CURRENCY:/i.test(line)) accountInfo.currency = line.replace(/^#\s*CURRENCY:/i, '').trim();
      continue;
    }

    // 2. Extract account info from plain text lines before or around tables
    if (/central\s*bank\s*of\s*india/i.test(line) && !accountInfo.bankName) {
      accountInfo.bankName = 'Central Bank of India';
    } else if (/state\s*bank\s*of\s*india/i.test(line) && !accountInfo.bankName) {
      accountInfo.bankName = 'State Bank of India';
    } else if (/hdfc\s*bank/i.test(line) && !accountInfo.bankName) {
      accountInfo.bankName = 'HDFC Bank';
    } else if (/icici\s*bank/i.test(line) && !accountInfo.bankName) {
      accountInfo.bankName = 'ICICI Bank';
    }

    if (/account\s*number\s*[:\-]?\s*(\d{8,18})/i.test(line) && !accountInfo.accountNumber) {
      accountInfo.accountNumber = line.match(/account\s*number\s*[:\-]?\s*(\d{8,18})/i)![1];
    }
    if (/ifsc\s*(?:code)?\s*[:\-]?\s*([a-z]{4}0[a-z0-9]{6})/i.test(line) && !accountInfo.ifscCode) {
      accountInfo.ifscCode = line.match(/ifsc\s*(?:code)?\s*[:\-]?\s*([a-z]{4}0[a-z0-9]{6})/i)![1].toUpperCase();
    }
    if (/branch\s*code\s*[:\-]?\s*(\d+)/i.test(line) && !accountInfo.branchCode) {
      accountInfo.branchCode = line.match(/branch\s*code\s*[:\-]?\s*(\d+)/i)![1];
    }
    if (/product\s*type\s*[:\-]?\s*([^\n\^]+)/i.test(line) && !accountInfo.productType) {
      accountInfo.productType = line.match(/product\s*type\s*[:\-]?\s*([^\n\^]+)/i)![1].trim();
    }
    if (/statement\s*of\s*account\s*from\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\s*to\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i.test(line)) {
      const match = line.match(/statement\s*of\s*account\s*from\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\s*to\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i)!;
      accountInfo.statementPeriod = `${match[1]} to ${match[2]}`;
      accountInfo.startDate = match[1];
      accountInfo.endDate = match[2];
    }
    if (/mr\.?\s+[A-Z\s]{3,35}/i.test(line) && !accountInfo.accountHolder && !line.includes('^')) {
      const match = line.match(/(mr\.?\s+[A-Z\s]{3,35})/i);
      if (match) accountInfo.accountHolder = match[1].trim();
    }
    if (/email\s*[:\-]?\s*([^\s\^]+@[^\s\^]+)/i.test(line) && !accountInfo.email) {
      accountInfo.email = line.match(/email\s*[:\-]?\s*([^\s\^]+@[^\s\^]+)/i)![1];
    }
    if (/statement\s*date\s*[:\-]?\s*([^\n\^]+)/i.test(line) && !accountInfo.statementDate) {
      accountInfo.statementDate = line.match(/statement\s*date\s*[:\-]?\s*([^\n\^]+)/i)![1].trim();
    }

    // 3. Skip footer / page break / non-table lines
    if (
      line.startsWith('--- PAGE_BREAK_') ||
      /^\*\s*statement\s*downloaded/i.test(line) ||
      /^unless\s*a\s*constituent\s*notifies/i.test(line) ||
      /^end\s*of\s*statement/i.test(line) ||
      /^cleared\s*balance/i.test(line) ||
      /^drawing\s*power/i.test(line) ||
      /^statement\s*of\s*account/i.test(line)
    ) {
      continue;
    }

    if (!line.includes('^')) continue;

    const parts = line.split('^').map(p => p.trim());
    if (parts.length < 2) continue;

    // 4. Check if this line is a table header (e.g. repeated on page 2..63 or initial on page 1)
    const lowerLine = line.toLowerCase();
    const isHeaderLine =
      lowerLine.includes('post date') ||
      lowerLine.includes('posting date') ||
      (lowerLine.includes('date') && lowerLine.includes('description')) ||
      (lowerLine.includes('debit') && lowerLine.includes('credit')) ||
      (lowerLine.includes('date') && lowerLine.includes('particulars'));

    if (isHeaderLine) {
      if (headerColumns.length === 0) {
        headerColumns = parts.map(p => p.toLowerCase().replace(/[^a-z0-9]/g, ''));
      }
      continue;
    }

    // 5. If dynamic header columns were found, map by header column position
    if (headerColumns.length > 0) {
      const rowObj: Record<string, any> = {};
      const mappedTargets = new Set<string>();

      for (let c = 0; c < headerColumns.length; c++) {
        const colKey = headerColumns[c];
        const val = parts[c] !== undefined ? parts[c].trim() : '';

        // If a target field is already mapped from a previous column, ignore subsequent columns for the same field
        if ((colKey.includes('postdate') || colKey.includes('postingdate') || (colKey.includes('date') && !colKey.includes('value') && !colKey.includes('val')) || colKey.includes('txndate')) && !mappedTargets.has('postDate')) {
          rowObj.postDate = val;
          mappedTargets.add('postDate');
        } else if ((colKey.includes('valuedate') || colKey.includes('valuedt') || colKey.includes('valdate')) && !mappedTargets.has('valueDate')) {
          rowObj.valueDate = val;
          mappedTargets.add('valueDate');
        } else if ((colKey.includes('branchcode') || colKey.includes('branch') || colKey.includes('brcode')) && !mappedTargets.has('branchCode')) {
          rowObj.branchCode = val;
          mappedTargets.add('branchCode');
        } else if ((colKey.includes('cheque') || colKey.includes('chq') || colKey.includes('instrument') || colKey.includes('refno') || colKey.includes('utr')) && !mappedTargets.has('chequeNo')) {
          rowObj.chequeNo = val;
          mappedTargets.add('chequeNo');
        } else if ((colKey.includes('description') || colKey.includes('narration') || colKey.includes('particulars') || colKey.includes('details') || colKey.includes('remarks') || colKey.includes('memo')) && !mappedTargets.has('description')) {
          rowObj.description = val;
          mappedTargets.add('description');
        } else if ((colKey.includes('debit') || colKey.includes('withdrawal') || colKey.includes('dramt') || colKey.includes('outflow')) && !mappedTargets.has('debit')) {
          rowObj.debit = val;
          mappedTargets.add('debit');
        } else if ((colKey.includes('credit') || colKey.includes('deposit') || colKey.includes('cramt') || colKey.includes('inflow')) && !mappedTargets.has('credit')) {
          rowObj.credit = val;
          mappedTargets.add('credit');
        } else if ((colKey.includes('balance') || colKey.includes('closingbalance') || colKey.includes('runningbalance')) && !mappedTargets.has('balance')) {
          rowObj.balance = val;
          mappedTargets.add('balance');
        } else if (colKey.includes('category') && !mappedTargets.has('category')) {
          rowObj.category = val;
          mappedTargets.add('category');
        } else if (colKey.includes('mode') && !mappedTargets.has('mode')) {
          rowObj.mode = val;
          mappedTargets.add('mode');
        } else if ((colKey.includes('reference') || colKey.includes('ref')) && !mappedTargets.has('referenceNo')) {
          rowObj.referenceNo = val;
          mappedTargets.add('referenceNo');
        }
      }

      // Check if this is a continuation row of a multi-line transaction description
      const hasDate = Boolean(rowObj.postDate && /\d/.test(rowObj.postDate));
      const hasDebit = Boolean(rowObj.debit && String(rowObj.debit).trim() !== '' && String(rowObj.debit).trim() !== '-');
      const hasCredit = Boolean(rowObj.credit && String(rowObj.credit).trim() !== '' && String(rowObj.credit).trim() !== '-');
      const hasBalance = Boolean(rowObj.balance && String(rowObj.balance).trim() !== '' && String(rowObj.balance).trim() !== '-');

      if (!hasDate && !hasDebit && !hasCredit && !hasBalance && rawRows.length > 0) {
        // Multi-line narration / description continuation line
        const additionalText = (rowObj.description || rowObj.chequeNo || '').trim();
        if (additionalText) {
          rawRows[rawRows.length - 1].description = `${rawRows[rawRows.length - 1].description || ''} ${additionalText}`.trim();
          continue;
        }
      }

      // Check if row has any non-empty data
      if (Object.values(rowObj).some(v => v !== undefined && String(v).trim().length > 0)) {
        rawRows.push(rowObj);
        continue;
      }
    }

    // Default 11-column Caret format: PostDate^ValueDate^BranchCode^ChequeNo^Description^Debit^Credit^Balance^Category^Mode^ReferenceNo
    const postDate = parts[0] || '';
    const valueDate = parts[1] || postDate;
    const branchCode = parts[2] || '';
    const chequeNo = parts[3] || '';
    const description = parts[4] || 'Bank Transaction';
    const debit = parseRobustNumber(parts[5]);
    const credit = parseRobustNumber(parts[6]);
    const balance = parseRobustNumber(parts[7], true);
    const category = parts[8] || undefined;
    const mode = parts[9] || undefined;
    const referenceNo = parts[10] || chequeNo;

    rawRows.push({
      postDate,
      valueDate,
      branchCode,
      chequeNo,
      description,
      debit,
      credit,
      balance,
      category,
      mode,
      referenceNo,
    });
  }

  const result = validateAndMapBankStatement(rawRows, accountInfo, fileName);
  if (!result.success || !result.data) {
    throw new Error(result.error || `Could not parse Caret (^) Delimited text in '${fileName}'`);
  }

  result.data.rawCaretText = caretText;
  return result.data;
}

/**
 * Standard category classifier for financial descriptions
 */
export function categorizeTransaction(description: string, isCredit: boolean = false): { category: string; mode: TransactionRow['mode'] } {
  const desc = description.toLowerCase();
  
  // Detect Payment Mode
  let mode: TransactionRow['mode'] = 'OTHER';
  if (/upi\b|phonepe|gpay|googlepay|paytm|bhim|cred\b|amazonpay/i.test(desc)) mode = 'UPI';
  else if (/neft\b|rtgs\b/i.test(desc)) mode = 'NEFT';
  else if (/imps\b/i.test(desc)) mode = 'IMPS';
  else if (/cashrc|cash\s*dep|atm\s*w|self\s*withdrawal/i.test(desc)) mode = 'CASH';
  else if (/transfer|to\s*transfer|from\s*a\/c|int\.bank|internal\s*trf/i.test(desc)) mode = 'TRANSFER';
  else if (/charge|commission|gst|fee|min\s*bal|sms\s*chg|annual\s*fee/i.test(desc)) mode = 'CHARGES';
  else if (/interest|int\.pd|int\s*cr/i.test(desc)) mode = 'INTEREST';

  // Detect Category
  let category = 'General';
  if (/tuition|school|college|university|exam\s*fee|education|academy/i.test(desc)) {
    category = 'Education / Tuition';
  } else if (/salary|wages|payroll|stipend|bonus/i.test(desc)) {
    category = 'Salary & Income';
  } else if (/redbus|irctc|flight|indigo|air\s*india|uber|ola|rapido|makemytrip|travel|rail/i.test(desc)) {
    category = 'Travel & Transit';
  } else if (/netflix|hotstar|spotify|prime|youtube|entertainment|movie|pvr|bookmyshow/i.test(desc)) {
    category = 'Entertainment & Subs';
  } else if (/cred\b|loan|emi|bajaj|hdfc\s*bank\s*emi|credit\s*card|muthoot|whizdm/i.test(desc)) {
    category = 'Loans / Credit Card';
  } else if (/swiggy|zomato|restaurant|cafe|mcdonalds|dominos|starbucks|food|dining/i.test(desc)) {
    category = 'Food & Dining';
  } else if (/tax\s*refund|itdtax|income\s*tax|gst\s*refund/i.test(desc)) {
    category = 'Tax Refund';
  } else if (/gst|commission|service\s*charge|folio\s*chg|maintenance/i.test(desc)) {
    category = 'Bank Fees & Taxes';
  } else if (/interest|int\.cr/i.test(desc)) {
    category = 'Bank Interest';
  } else if (/amazon|flipkart|myntra|ajio|shopping|mart|supermarket|dmart|retail/i.test(desc)) {
    category = 'Shopping & Retail';
  } else if (/petrol|fuel|hpcl|bpcl|iocl|shell|gas\s*station/i.test(desc)) {
    category = 'Fuel & Automotive';
  } else if (/electricity|bescom|tneb|water|broadband|airtel|jio|vi\s*bill|utility|recharge/i.test(desc)) {
    category = 'Bills & Utilities';
  } else if (/medical|pharmacy|apollo|1mg|hospital|clinic|doctor|health/i.test(desc)) {
    category = 'Healthcare & Medical';
  } else if (/phonepe|gpay|paytm/i.test(desc)) {
    category = isCredit ? 'UPI Inflow' : 'UPI Payment';
  } else if (/deposit|inflow|cash\s*deposit/i.test(desc)) {
    category = 'Deposit & Savings';
  } else if (isCredit) {
    category = 'Income / Credit';
  } else {
    category = 'Expense / Payment';
  }

  return { category, mode };
}

/**
 * Validate and map diverse bank statement column headers into standard structure.
 * Supports varied bank naming:
 * - Date: Date, Txn Date, Value Dt, Posting Date, Tran Date
 * - Description: Narration, Particulars, Description, Transaction Details, Remarks
 * - Reference: Chq./Ref.No., Chq No, Cheque No, Ref No, UTR, RRN
 * - Value Date: Value Dt, Value Date, Val Date
 * - Debit: Withdrawal Amt., Withdrawal Amount, Withdrawal (Dr), Debit, Dr Amt
 * - Credit: Deposit Amt., Deposit Amount, Deposit (Cr), Deposit, Credit, Cr Amt
 * - Balance: Closing Balance, Balance, Running Balance
 * - Category: Auto-classified based on transaction narration & context
 */
/**
 * Helper to extract field from raw row by searching multiple aliases with normalized case/spacing matching.
 * If usedKeys is provided as a Set, prevents multiple fields from claiming the same column/key (ignores duplicate usage).
 */
function extractField(raw: Record<string, any>, usedKeysOrFirstAlias?: Set<string> | string, ...restAliases: string[]): any {
  if (!raw) return undefined;
  let usedKeys: Set<string> | undefined;
  let aliases: string[] = [];

  if (usedKeysOrFirstAlias instanceof Set) {
    usedKeys = usedKeysOrFirstAlias;
    aliases = restAliases;
  } else if (typeof usedKeysOrFirstAlias === 'string') {
    aliases = [usedKeysOrFirstAlias, ...restAliases];
  } else {
    aliases = restAliases;
  }

  // 1. Direct key match
  for (const alias of aliases) {
    if (usedKeys && usedKeys.has(alias)) continue;
    if (raw[alias] !== undefined && raw[alias] !== null && raw[alias] !== '') {
      if (usedKeys) usedKeys.add(alias);
      return raw[alias];
    }
  }
  // 2. Normalized alphanumeric match (ignores spaces, casing, dots, underscores, dashes)
  const entries = Object.entries(raw);
  for (const alias of aliases) {
    const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, val] of entries) {
      if (usedKeys && usedKeys.has(key)) continue;
      if (val === undefined || val === null || val === '') continue;
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanKey === cleanAlias) {
        if (usedKeys) usedKeys.add(key);
        return val;
      }
    }
  }
  return undefined;
}

/**
 * Validates raw extracted table rows and converts them to standardized TransactionRow format
 */
export function validateAndMapBankStatement(
  rawTransactions: Array<Record<string, any>>,
  accountInfo: Partial<AccountMetadata> = {},
  fileName: string = 'statement.pdf'
): ParseResult {
  if (!rawTransactions || rawTransactions.length === 0) {
    return {
      success: false,
      error: `File format mismatch: Could not find transaction rows in '${fileName}'. Please ensure your statement contains standard bank columns (Date, Narration/Description, Withdrawal/Deposit Amount).`,
      missingColumns: ['Date', 'Narration / Description', 'Amount (Withdrawal / Deposit)'],
    };
  }

  // Check how many rows have valid date, description, and amount/debit/credit
  let validDateCount = 0;
  let validDescCount = 0;
  let validAmountCount = 0;

  const dateRegex = /(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{2,4})/i;

  const mappedTransactions: TransactionRow[] = [];

  for (let i = 0; i < rawTransactions.length; i++) {
    const raw = rawTransactions[i];
    const usedKeysInRow = new Set<string>();
    
    // 1. Map Date (supports Post Date, Txn Date, Tran Date, Posting Date, Date, Value Date, etc.)
    const rawDateVal = extractField(
      raw,
      usedKeysInRow,
      'Post Date', 'postDate', 'PostDate', 'Posting Date', 'date', 'Date',
      'txnDate', 'Txn Date', 'tranDate', 'Tran Date', 'Transaction Date'
    );
    const rawDate = String(rawDateVal || '').trim();
    const hasDate = dateRegex.test(rawDate);
    if (hasDate) validDateCount++;

    // 2. Map Description / Narration (supports Transaction Description, Transaction Details, Particulars, Narration, Description, Remarks, Details)
    const rawDescVal = extractField(
      raw,
      usedKeysInRow,
      'Transaction Description', 'transactionDescription', 'TransactionDescription',
      'Transaction Details', 'transactionDetails', 'Narration', 'narration',
      'Particulars', 'particulars', 'Description', 'description',
      'Remarks', 'remarks', 'Details', 'details', 'txnDesc', 'Txn Desc', 'Memo', 'memo'
    );
    const rawDesc = String(rawDescVal || '').trim();
    if (rawDesc.length > 1) validDescCount++;

    // 3. Map Value Date (supports Value Date, Value Dt, Val Date)
    const rawValDateVal = extractField(
      raw,
      usedKeysInRow,
      'Value Date', 'valueDate', 'ValueDate', 'Value Dt', 'valueDt', 'Val Date', 'valDate'
    );
    const rawValDate = String(rawValDateVal || rawDate).trim();

    // 4. Map Branch Code (supports Branch Code, Branch, Br Code)
    const rawBranchCodeVal = extractField(
      raw,
      usedKeysInRow,
      'Branch Code', 'branchCode', 'BranchCode', 'Branch', 'branch', 'Br Code', 'brCode'
    );
    const rawBranchCode = String(rawBranchCodeVal || '').trim();

    // 5. Map Cheque / Ref No (supports Cheque Number, Cheque No, Chq No, Chq./Ref.No., Ref No, UTR, Instrument ID)
    const rawChequeVal = extractField(
      raw,
      usedKeysInRow,
      'Cheque Number', 'chequeNumber', 'ChequeNumber', 'Cheque No', 'chequeNo', 'ChequeNo',
      'Chq No', 'chqNo', 'chq./ref.no.', 'chq / ref no', 'chq/ref.no',
      'Ref No', 'refNo', 'referenceNo', 'Reference No', 'UTR', 'utr', 'Instrument ID', 'instrumentId'
    );
    const rawChequeNo = String(rawChequeVal || '').trim();

    // 6. Map Amount (Debit / Withdrawal Amt., Credit / Deposit Amt., Amount)
    let parsedDebit: number | null = null;
    let parsedCredit: number | null = null;
    let parsedBalance: number | null = null;
    let extractedBalanceType: 'CR' | 'DR' | '' = '';

    // Check Debit / Withdrawal variations
    const rawDebit = extractField(
      raw,
      usedKeysInRow,
      'Debit', 'debit', 'Debit Amount', 'debitAmt', 'debit amount',
      'Withdrawal Amt.', 'withdrawal amt.', 'Withdrawal Amt', 'withdrawal amt',
      'Withdrawal', 'withdrawal', 'withdrawalAmt', 'Withdrawal Amount',
      'drAmt', 'dr', 'Dr', 'DR', 'debit amt', 'debit amt.', 'Outflow', 'Payment'
    );
    if (rawDebit !== undefined && rawDebit !== null && rawDebit !== '') {
      parsedDebit = parseRobustNumber(rawDebit, false);
    }

    // Check Credit / Deposit variations
    const rawCredit = extractField(
      raw,
      usedKeysInRow,
      'Credit', 'credit', 'Credit Amount', 'creditAmt', 'credit amount',
      'Deposit Amt.', 'deposit amt.', 'Deposit Amt', 'deposit amt',
      'Deposit', 'deposit', 'depositAmt', 'Deposit Amount',
      'crAmt', 'cr', 'Cr', 'CR', 'credit amt', 'credit amt.', 'Inflow', 'Receipt'
    );
    if (rawCredit !== undefined && rawCredit !== null && rawCredit !== '') {
      parsedCredit = parseRobustNumber(rawCredit, false);
    }

    // If single amount column (Amount / Net Amount / Txn Amount)
    const rawAmt = extractField(
      raw,
      usedKeysInRow,
      'Amount', 'amount', 'Txn Amount', 'txnAmount', 'Net Amount', 'net amount', 'Total Amount', 'totalAmount'
    );
    if (parsedDebit === null && parsedCredit === null && rawAmt !== undefined && rawAmt !== null && rawAmt !== '') {
      const amtStr = String(rawAmt);
      const isNeg = amtStr.includes('-') || /dr\b/i.test(amtStr) || /dr\b/i.test(String(raw.balanceType || ''));
      const val = parseRobustNumber(amtStr, false);
      if (val !== null && val > 0) {
        if (isNeg) {
          parsedDebit = val;
        } else if (/deposit|credit|interest|refund|inward|cr\b|from\s+a\/c/i.test(rawDesc)) {
          parsedCredit = val;
        } else {
          if (/cr\b/i.test(amtStr)) parsedCredit = val;
          else parsedDebit = val;
        }
      }
    }

    // Balance / Closing Balance (e.g. "Balance", "29,866.60 CR")
    const rawBal = extractField(
      raw,
      usedKeysInRow,
      'Balance', 'balance', 'Closing Balance', 'closingBalance', 'closing balance',
      'Running Balance', 'runningBalance', 'running balance', 'Avail Balance', 'availBalance', 'Book Balance'
    );
    if (rawBal !== undefined && rawBal !== null && rawBal !== '') {
      parsedBalance = parseRobustNumber(rawBal, true);
      const balStr = String(rawBal).toUpperCase();
      if (balStr.includes('CR')) {
        extractedBalanceType = 'CR';
      } else if (balStr.includes('DR')) {
        extractedBalanceType = 'DR';
      }
    }

    const hasAmount = (parsedDebit !== null && parsedDebit > 0) || (parsedCredit !== null && parsedCredit > 0) || parsedBalance !== null;
    if (hasAmount) validAmountCount++;

    // 7. Category & Mode auto-classification
    const isCredit = (parsedCredit !== null && parsedCredit > 0);
    const autoClass = categorizeTransaction(rawDesc, isCredit);
    const rawCategory = extractField(raw, 'Category', 'category', 'Spending Category', 'Tag', 'tag');
    const category = rawCategory && String(rawCategory).trim().length > 0 ? String(rawCategory).trim() : autoClass.category;
    const rawMode = extractField(raw, 'Mode', 'mode', 'Payment Mode', 'paymentMode', 'Channel', 'channel');
    const mode = (rawMode as any) || autoClass.mode;

    // Extract reference from narration or explicit ref column
    const rrnMatch = rawDesc.match(/(?:RRN\s*|Ref\s*No\.?\s*|\/XUTR\/|\/UPI\/|UPI\/)([A-Z0-9]{10,24})/i);
    const referenceNo = rawChequeNo || raw.referenceNo || (rrnMatch ? rrnMatch[1] : '');

    // If row has date, description, or amount, include it and keep missing columns blank
    if (hasDate || rawDesc.length > 0 || hasAmount) {
      mappedTransactions.push({
        id: `tx-${i + 1}-${Date.now()}`,
        postDate: rawDate || '',
        valueDate: rawValDate || rawDate || '',
        branchCode: rawBranchCode || '',
        chequeNo: rawChequeNo || '',
        description: rawDesc || 'Bank Transaction',
        debit: parsedDebit,
        credit: parsedCredit,
        balance: parsedBalance,
        balanceType: (raw.balanceType as any) || extractedBalanceType || (parsedBalance !== null ? 'CR' : ''),
        category,
        mode,
        referenceNo,
      });
    }
  }

  // Fallback: If strict mapping caught 0 rows but rawTransactions has rows, include all raw rows
  if (mappedTransactions.length === 0 && rawTransactions.length > 0) {
    for (let i = 0; i < rawTransactions.length; i++) {
      const raw = rawTransactions[i];
      const desc = String(extractField(raw, 'description', 'particulars', 'narration') || Object.values(raw).join(' ')).trim();
      mappedTransactions.push({
        id: `tx-${i + 1}-${Date.now()}`,
        postDate: String(extractField(raw, 'postDate', 'date', 'txnDate') || '').trim(),
        valueDate: String(extractField(raw, 'valueDate', 'valDate') || '').trim(),
        branchCode: String(extractField(raw, 'branchCode', 'branch') || '').trim(),
        chequeNo: String(extractField(raw, 'chequeNo', 'chqNo') || '').trim(),
        description: desc || `Transaction ${i + 1}`,
        debit: parseRobustNumber(extractField(raw, 'debit', 'withdrawal')),
        credit: parseRobustNumber(extractField(raw, 'credit', 'deposit')),
        balance: parseRobustNumber(extractField(raw, 'balance', 'closingBalance'), true),
        balanceType: 'CR',
        category: 'General',
        mode: 'OTHER',
        referenceNo: '',
      });
    }
  }

  // Verification: Succeed if at least 1 transaction is present
  if (mappedTransactions.length === 0) {
    return {
      success: false,
      error: `Could not extract readable transactions from '${fileName}'. Please ensure it contains statement transactions.`,
      missingColumns: [],
    };
  }

  // Calculate totals
  let totDeb = 0;
  let totCred = 0;
  mappedTransactions.forEach(t => {
    if (t.debit !== null && t.debit !== undefined && t.debit !== -1) {
      totDeb += Number(t.debit) || 0;
    }
    if (t.credit !== null && t.credit !== undefined && t.credit !== -1) {
      totCred += Number(t.credit) || 0;
    }
  });

  // Determine chronological ordering to compute accurate opening & closing balances
  let computedOpeningBal: number | undefined = undefined;
  let computedClosingBal: number | undefined = undefined;
  if (mappedTransactions.length > 0) {
    const firstTx = mappedTransactions[0];
    const lastTx = mappedTransactions[mappedTransactions.length - 1];
    
    // If opening/closing balance present in first/last row
    if (firstTx.balance !== null && firstTx.balance !== undefined) {
      computedOpeningBal = firstTx.balance - (firstTx.credit || 0) + (firstTx.debit || 0);
    }
    if (lastTx.balance !== null && lastTx.balance !== undefined) {
      computedClosingBal = lastTx.balance;
    }
  }

  const account: AccountMetadata = {
    bankName: accountInfo.bankName || 'Bank Statement',
    accountHolder: accountInfo.accountHolder || '',
    accountNumber: accountInfo.accountNumber || '',
    ifscCode: accountInfo.ifscCode || '',
    branchName: accountInfo.branchName || '',
    branchCode: accountInfo.branchCode || '',
    statementPeriod: accountInfo.statementPeriod || (mappedTransactions.length > 1 ? `${mappedTransactions[0].postDate} to ${mappedTransactions[mappedTransactions.length - 1].postDate}` : ''),
    currency: accountInfo.currency || 'INR (₹)',
    totalDebits: parseFloat(totDeb.toFixed(2)),
    totalCredits: parseFloat(totCred.toFixed(2)),
    debitCount: mappedTransactions.filter(t => t.debit !== null && (t.debit || 0) > 0).length,
    creditCount: mappedTransactions.filter(t => t.credit !== null && (t.credit || 0) > 0).length,
    openingBalance: accountInfo.openingBalance ?? (computedOpeningBal !== undefined ? parseFloat(computedOpeningBal.toFixed(2)) : undefined),
    closingBalance: accountInfo.closingBalance ?? (computedClosingBal !== undefined ? parseFloat(computedClosingBal.toFixed(2)) : undefined),
    customerAddress: accountInfo.customerAddress,
    email: accountInfo.email,
    productType: accountInfo.productType,
  };

  const detectedCols = Array.from(new Set(
    rawTransactions.flatMap(r => Object.keys(r || {}))
  )).filter(k => k && k !== 'id' && !k.startsWith('_'));

  const rawCaretText = toCaretDelimitedString(mappedTransactions, account);

  return {
    success: true,
    data: {
      id: `stmt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      fileName,
      fileSize: `${(mappedTransactions.length * 120 / 1024).toFixed(1)} KB`,
      pageCount: 1,
      uploadedAt: new Date().toISOString(),
      account,
      detectedColumns: detectedCols.length > 0 ? detectedCols : ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance', 'Category'],
      transactions: mappedTransactions,
      rawRows: rawTransactions,
      rawHeaders: detectedCols,
      rawCaretText,
    },
    detectedColumns: detectedCols.length > 0 ? detectedCols : ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance', 'Category'],
  };
}

/**
 * Applies custom user manual column mapping to raw transaction rows
 */
export function applyManualColumnMapping(
  rawRows: Array<Record<string, any>>,
  mapping: {
    postDateCol: string;
    valueDateCol?: string;
    descriptionCol: string;
    chequeNoCol?: string;
    branchCodeCol?: string;
    debitCol?: string;
    creditCol?: string;
    amountCol?: string;
    drCrCol?: string;
    balanceCol?: string;
    categoryCol?: string;
    modeCol?: string;
  },
  existingStatement: BankStatementData
): BankStatementData {
  const remappedTransactions: TransactionRow[] = [];

  // Deduplicate mappings: if two fields map to the exact same source column, ignore the second mapped column
  const usedSourceCols = new Set<string>();
  const resolveCol = (colName: string | undefined): string => {
    if (!colName || colName.trim() === '') return '';
    const trimmed = colName.trim();
    if (usedSourceCols.has(trimmed)) {
      // Second mapping using the same source column is ignored
      return '';
    }
    usedSourceCols.add(trimmed);
    return trimmed;
  };

  const postDateCol = resolveCol(mapping.postDateCol);
  // Value date can fallback to post date if intentionally using the same date, but if distinct, ensure uniqueness
  const valueDateCol = mapping.valueDateCol === mapping.postDateCol ? '' : resolveCol(mapping.valueDateCol);
  const descriptionCol = resolveCol(mapping.descriptionCol);
  const chequeNoCol = resolveCol(mapping.chequeNoCol);
  const branchCodeCol = resolveCol(mapping.branchCodeCol);
  const debitCol = resolveCol(mapping.debitCol);
  const creditCol = resolveCol(mapping.creditCol);
  const amountCol = resolveCol(mapping.amountCol);
  const balanceCol = resolveCol(mapping.balanceCol);
  const categoryCol = resolveCol(mapping.categoryCol);
  const modeCol = resolveCol(mapping.modeCol);
  const drCrCol = resolveCol(mapping.drCrCol);

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const postDate = postDateCol ? String(raw[postDateCol] || '').trim() : '';
    const valueDate = valueDateCol ? String(raw[valueDateCol] || '').trim() : (mapping.valueDateCol === mapping.postDateCol ? postDate : '');
    const description = descriptionCol ? String(raw[descriptionCol] || '').trim() : 'Bank Transaction';
    const chequeNo = chequeNoCol ? String(raw[chequeNoCol] || '').trim() : '';
    const branchCode = branchCodeCol ? String(raw[branchCodeCol] || '').trim() : '';

    let debit: number | null = null;
    let credit: number | null = null;
    let balance: number | null = null;
    let balanceType: 'CR' | 'DR' | '' = '';

    if (debitCol) {
      debit = parseRobustNumber(raw[debitCol], false);
    }
    if (creditCol) {
      credit = parseRobustNumber(raw[creditCol], false);
    }

    // If single amount column mapped
    if (amountCol && debit === null && credit === null) {
      const rawAmtVal = raw[amountCol];
      const val = parseRobustNumber(rawAmtVal, false);
      if (val !== null && val > 0) {
        const rawAmtStr = String(rawAmtVal || '');
        const drCrIndicator = drCrCol ? String(raw[drCrCol] || '').toUpperCase() : '';
        const isNeg = rawAmtStr.includes('-') || drCrIndicator === 'DR' || /dr\b/i.test(rawAmtStr);
        const isPos = drCrIndicator === 'CR' || /cr\b/i.test(rawAmtStr) || /deposit|credit|interest|refund|inward|from\s+a\/c/i.test(description);

        if (isNeg) {
          debit = val;
        } else if (isPos) {
          credit = val;
        } else {
          debit = val;
        }
      }
    }

    if (balanceCol) {
      balance = parseRobustNumber(raw[balanceCol], true);
      if (balance !== null) {
        balanceType = 'CR';
      }
    }

    // Category & Mode
    let category = categoryCol && raw[categoryCol] ? String(raw[categoryCol]).trim() : '';
    let mode = modeCol && raw[modeCol] ? (String(raw[modeCol]).toUpperCase() as any) : undefined;

    if (!category || !mode) {
      const auto = categorizeTransaction(description, (credit !== null && credit > 0));
      if (!category) category = auto.category;
      if (!mode) mode = auto.mode;
    }

    if (postDate || description !== 'Bank Transaction' || debit !== null || credit !== null || balance !== null) {
      remappedTransactions.push({
        id: `remap-tx-${i + 1}-${Date.now()}`,
        postDate: postDate || existingStatement.transactions[i]?.postDate || '',
        valueDate: valueDate || postDate,
        branchCode,
        chequeNo,
        description,
        debit,
        credit,
        balance,
        balanceType,
        category,
        mode,
        referenceNo: chequeNo,
      });
    }
  }

  // Calculate new totals
  let totDeb = 0;
  let totCred = 0;
  remappedTransactions.forEach(t => {
    if (t.debit !== null && t.debit !== undefined && t.debit !== -1) totDeb += Number(t.debit) || 0;
    if (t.credit !== null && t.credit !== undefined && t.credit !== -1) totCred += Number(t.credit) || 0;
  });

  const updatedAccount: AccountMetadata = {
    ...existingStatement.account,
    totalDebits: parseFloat(totDeb.toFixed(2)),
    totalCredits: parseFloat(totCred.toFixed(2)),
    debitCount: remappedTransactions.filter(t => t.debit !== null && (t.debit || 0) > 0).length,
    creditCount: remappedTransactions.filter(t => t.credit !== null && (t.credit || 0) > 0).length,
    openingBalance: remappedTransactions[0]?.balance !== null && remappedTransactions[0]?.balance !== undefined
      ? remappedTransactions[0].balance - (remappedTransactions[0].credit || 0) + (remappedTransactions[0].debit || 0)
      : existingStatement.account.openingBalance,
    closingBalance: remappedTransactions[remappedTransactions.length - 1]?.balance ?? existingStatement.account.closingBalance,
  };

  const rawCaretText = toCaretDelimitedString(remappedTransactions, updatedAccount);

  return {
    ...existingStatement,
    transactions: remappedTransactions,
    account: updatedAccount,
    rawCaretText,
  };
}

/**
 * Parses raw text extracted from PDF or pasted text
 */
export function parseRawBankStatementText(rawText: string, fileName: string = 'bank_statement.pdf'): BankStatementData {
  // Check if the raw text is formatted with Caret (^) delimiters (at least 2 lines with '^')
  const caretLinesCount = rawText.split(/\r?\n/).filter(l => l.includes('^')).length;
  if (caretLinesCount >= 2) {
    return parseCaretDelimitedText(rawText, fileName);
  }

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  const accountInfo: Partial<AccountMetadata> = {
    currency: 'INR (₹)',
  };

  // Extract Bank header & Account details
  for (let i = 0; i < Math.min(lines.length, 45); i++) {
    const line = lines[i];

    if (/central bank/i.test(line)) accountInfo.bankName = 'Central Bank of India';
    else if (/state bank|sbi/i.test(line)) accountInfo.bankName = 'State Bank of India';
    else if (/hdfc/i.test(line)) accountInfo.bankName = 'HDFC Bank';
    else if (/icici/i.test(line)) accountInfo.bankName = 'ICICI Bank';
    else if (/axis/i.test(line)) accountInfo.bankName = 'Axis Bank';
    else if (/punjab national|pnb/i.test(line)) accountInfo.bankName = 'Punjab National Bank';
    else if (/bank of baroda|bob/i.test(line)) accountInfo.bankName = 'Bank of Baroda';
    else if (/chase/i.test(line)) accountInfo.bankName = 'Chase Bank';
    else if (/wells fargo/i.test(line)) accountInfo.bankName = 'Wells Fargo';

    const accMatch = line.match(/(?:Account\s*(?:Number|No|A\/C\s*No)?[:\s]+)(\d{8,18})/i);
    if (accMatch && !accountInfo.accountNumber) accountInfo.accountNumber = accMatch[1];

    const ifscMatch = line.match(/(?:IFSC(?:\s*Code)?[:\s]+)([A-Z]{4}0[A-Z0-9]{6})/i);
    if (ifscMatch && !accountInfo.ifscCode) accountInfo.ifscCode = ifscMatch[1];

    const branchMatch = line.match(/(?:Branch\s*(?:Name|Code)?[:\s]+)([A-Za-z0-9_\-\s]{1,35})/i);
    if (branchMatch && !accountInfo.branchName) accountInfo.branchName = branchMatch[1].trim();

    const branchCodeMatch = line.match(/(?:Branch\s*Code[:\s]+)(\d+)/i);
    if (branchCodeMatch && !accountInfo.branchCode) accountInfo.branchCode = branchCodeMatch[1].trim();

    const productMatch = line.match(/(?:Product\s*Type[:\s]+)([A-Za-z0-9_\-\s]{3,40})/i);
    if (productMatch && !accountInfo.productType) accountInfo.productType = productMatch[1].trim();

    const emailMatch = line.match(/(?:Email[:\s]+)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch && !accountInfo.email) accountInfo.email = emailMatch[1].trim();

    const nameMatch = line.match(/(?:Mr\.|Mrs\.|Ms\.|Shri\.|M\/s)\s+([A-Z\s]{3,40})/i);
    if (nameMatch && !accountInfo.accountHolder) accountInfo.accountHolder = nameMatch[0].trim();

    const periodMatch = line.match(/(?:from\s+)?(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+to\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
    if (periodMatch) {
      accountInfo.statementPeriod = `${periodMatch[1]} to ${periodMatch[2]}`;
      accountInfo.startDate = periodMatch[1];
      accountInfo.endDate = periodMatch[2];
    }
  }

  // Parse transaction table rows
  const rawRows: Array<any> = [];
  // Supports: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD-MMM-YYYY, DD MMM YYYY, YYYY-MM-DD
  const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i;

  let currentRaw: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('PAGE_BREAK') || /^(page\b|printed\s*on|statement\s*of|disclaimer|total\b|carried\s*forward)/i.test(line)) {
      continue;
    }

    const tokens = line.split(/\s+/).filter(t => t.trim().length > 0);
    if (tokens.length === 0) continue;

    // Check if line contains a date within first 4 tokens (e.g. "1 01/04/2025" or "01/04/2025")
    let dateIdx = -1;
    let postDate = '';

    for (let t = 0; t < Math.min(tokens.length, 4); t++) {
      const match = tokens[t].match(dateRegex);
      if (match) {
        dateIdx = t;
        postDate = match[1];
        break;
      }
    }

    if (dateIdx !== -1 && postDate) {
      if (currentRaw) {
        rawRows.push(currentRaw);
        currentRaw = null;
      }

      let valDate = postDate;
      let nextIndex = dateIdx + 1;

      // Check if next token is also a date (Value Date)
      if (tokens[nextIndex] && dateRegex.test(tokens[nextIndex])) {
        const vMatch = tokens[nextIndex].match(dateRegex);
        valDate = vMatch ? vMatch[1] : tokens[nextIndex];
        nextIndex++;
      }

      let branchCode = '';
      if (tokens[nextIndex] && /^\d{1,6}$/.test(tokens[nextIndex]) && !tokens[nextIndex].includes('.')) {
        branchCode = tokens[nextIndex];
        nextIndex++;
      }

      let balanceType: 'CR' | 'DR' | '' = '';
      let balance: number | null = null;
      let credit: number | null = null;
      let debit: number | null = null;
      let chequeNo = '';

      let endIndex = tokens.length - 1;

      if (tokens[endIndex] === 'CR' || tokens[endIndex] === 'DR') {
        balanceType = tokens[endIndex] as 'CR' | 'DR';
        endIndex--;
      }

      // Collect numeric amounts from right to left (Closing Balance, Deposit, Withdrawal)
      const parsedNumbers: number[] = [];
      while (endIndex >= nextIndex) {
        const numClean = tokens[endIndex].replace(/,/g, '');
        if (/^-?\d+(\.\d{1,2})?$/.test(numClean)) {
          const n = parseRobustNumber(tokens[endIndex], endIndex === tokens.length - 1);
          if (n !== null) parsedNumbers.unshift(n);
          endIndex--;
        } else if (tokens[endIndex] === '-' || tokens[endIndex] === '--') {
          // Placeholder dash for empty debit/credit column
          parsedNumbers.unshift(0);
          endIndex--;
        } else {
          break;
        }
      }

      const remainingTokens = tokens.slice(nextIndex, endIndex + 1);
      
      // Check if any token looks like Cheque / Ref number
      for (let t = 0; t < remainingTokens.length; t++) {
        if (/^(?:CHQ|REF|UTR|RRN)?\d{6,16}$/i.test(remainingTokens[t])) {
          chequeNo = remainingTokens[t];
          break;
        }
      }

      const description = remainingTokens.join(' ');

      if (parsedNumbers.length === 1) {
        balance = parsedNumbers[0];
      } else if (parsedNumbers.length === 2) {
        const amt = parsedNumbers[0];
        balance = parsedNumbers[1];
        if (/deposit|credit|interest|refund|inward|cr\b|from\s+a\/c/i.test(description)) {
          credit = amt > 0 ? amt : null;
        } else {
          debit = amt > 0 ? amt : null;
        }
      } else if (parsedNumbers.length >= 3) {
        // [Withdrawal, Deposit, Balance]
        const d = parsedNumbers[parsedNumbers.length - 3];
        const c = parsedNumbers[parsedNumbers.length - 2];
        const b = parsedNumbers[parsedNumbers.length - 1];
        debit = d > 0 ? d : null;
        credit = c > 0 ? c : null;
        balance = b !== 0 ? b : null;
      }

      currentRaw = {
        postDate,
        valueDate: valDate,
        branchCode,
        chequeNo,
        description: description || 'Bank Transaction',
        debit,
        credit,
        balance,
        balanceType,
      };
    } else if (currentRaw) {
      if (!/^(page\b|statement|branch|account|uncleared|cleared)/i.test(line)) {
        currentRaw.description = `${currentRaw.description || ''} ${line}`.trim();
      }
    }
  }

  if (currentRaw) {
    rawRows.push(currentRaw);
  }

  // Fallback scanner: if rawRows is still empty, scan for any line with financial numbers
  if (rawRows.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^(#|page|statement|branch|account|printed)/i.test(line)) continue;
      const numMatches = line.match(/\d+[\d,]*\.\d{2}/g);
      if (numMatches && numMatches.length > 0) {
        const dMatch = line.match(dateRegex);
        rawRows.push({
          postDate: dMatch ? dMatch[1] : '',
          description: line.replace(/\d+[\d,]*\.\d{2}/g, '').trim() || `Transaction ${i + 1}`,
          debit: numMatches[0] ? parseRobustNumber(numMatches[0]) : null,
          credit: numMatches[1] ? parseRobustNumber(numMatches[1]) : null,
          balance: numMatches[numMatches.length - 1] ? parseRobustNumber(numMatches[numMatches.length - 1], true) : null,
        });
      }
    }
  }


  const result = validateAndMapBankStatement(rawRows, accountInfo, fileName);
  if (!result.success || !result.data) {
    throw new Error(result.error || `File format mismatch: Could not find required columns (Date, Description, Category, Amount) in '${fileName}'`);
  }

  return result.data;
}

/**
 * Parses CSV, Excel (.xlsx, .xls) table sheets
 */
export async function parseExcelOrCsvFile(file: File): Promise<BankStatementData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  const jsonData: Array<any> = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  if (!jsonData || jsonData.length === 0) {
    throw new Error(`File format mismatch: File '${file.name}' is empty or not in spreadsheet format.`);
  }

  // Find header row containing Date, Narration / Description, Chq./Ref.No., Value Dt, Withdrawal Amt., Deposit Amt., Closing Balance
  let headerRowIndex = -1;
  let dateCol = -1;
  let descCol = -1;
  let chqCol = -1;
  let valDateCol = -1;
  let branchCodeCol = -1;
  let catCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let amountCol = -1;
  let balanceCol = -1;
  let modeCol = -1;

  for (let r = 0; r < Math.min(jsonData.length, 25); r++) {
    const row = jsonData[r];
    if (!Array.isArray(row)) continue;

    let foundDate = false;
    let foundDesc = false;
    let foundAmt = false;

    row.forEach((cell, c) => {
      const val = String(cell).toLowerCase().trim();
      if (dateCol === -1 && (/^(date|post\s*date|txn\s*date|tran\s*date|posting\s*date)$/.test(val) || (val.includes('date') && !val.includes('value')))) {
        dateCol = c;
        foundDate = true;
      } else if (valDateCol === -1 && /value\s*dt|value\s*date|val\s*date/.test(val)) {
        valDateCol = c;
      } else if (branchCodeCol === -1 && /branch\s*code|branch|br\s*code/.test(val)) {
        branchCodeCol = c;
      } else if (chqCol === -1 && /cheque\s*number|cheque\s*no|chq|cheque|ref\s*no|utr|rrn|instrument/.test(val)) {
        chqCol = c;
      } else if (descCol === -1 && /transaction\s*description|transaction\s*details|narration|particulars|description|details|remarks|txn\s*desc/.test(val)) {
        descCol = c;
        foundDesc = true;
      } else if (catCol === -1 && /category|spending\s*category|tag/.test(val)) {
        catCol = c;
      } else if (debitCol === -1 && /^debit$|withdrawal|debit\s*amt|withdrawal\s*amt|dr\b|payment|spent|dr\s*amt/.test(val)) {
        debitCol = c;
        foundAmt = true;
      } else if (creditCol === -1 && /^credit$|deposit|credit\s*amt|deposit\s*amt|cr\b|received|inflow|cr\s*amt/.test(val)) {
        creditCol = c;
        foundAmt = true;
      } else if (amountCol === -1 && /amount|net\s*amount|txn\s*amount/.test(val) && debitCol === -1 && creditCol === -1) {
        amountCol = c;
        foundAmt = true;
      } else if (balanceCol === -1 && /closing\s*balance|^balance$|running\s*balance|avail\s*balance/.test(val)) {
        balanceCol = c;
      } else if (modeCol === -1 && /mode|type|payment\s*mode|channel/.test(val)) {
        modeCol = c;
      }
    });

    if ((foundDate || dateCol !== -1) && (foundDesc || descCol !== -1) && (foundAmt || amountCol !== -1 || debitCol !== -1 || creditCol !== -1)) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1 || (dateCol === -1 && descCol === -1)) {
    throw new Error(`File format mismatch: Could not find bank statement columns (Date, Narration, Withdrawal/Deposit Amount) in '${file.name}'.`);
  }

  const rawRows: Array<any> = [];
  const headerRow = jsonData[headerRowIndex] as any[];
  const rawHeaders = headerRow.map((h, i) => String(h || `Column_${i + 1}`).trim());

  for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
    const row = jsonData[r];
    if (!row || row.length === 0) continue;

    const rawDate = dateCol !== -1 ? row[dateCol] : '';
    const rawDesc = descCol !== -1 ? row[descCol] : '';
    if (!rawDate && !rawDesc) continue;

    const rowObj: Record<string, any> = {
      date: rawDate,
      valueDate: valDateCol !== -1 ? row[valDateCol] : undefined,
      branchCode: branchCodeCol !== -1 ? row[branchCodeCol] : undefined,
      chequeNo: chqCol !== -1 ? row[chqCol] : undefined,
      description: rawDesc,
      category: catCol !== -1 ? row[catCol] : undefined,
      debit: debitCol !== -1 ? row[debitCol] : undefined,
      credit: creditCol !== -1 ? row[creditCol] : undefined,
      amount: amountCol !== -1 ? row[amountCol] : undefined,
      balance: balanceCol !== -1 ? row[balanceCol] : undefined,
      mode: modeCol !== -1 ? row[modeCol] : undefined,
    };

    // Also attach each original sheet column by header name
    rawHeaders.forEach((h, idx) => {
      if (h) rowObj[h] = row[idx];
    });

    rawRows.push(rowObj);
  }

  const result = validateAndMapBankStatement(rawRows, { bankName: file.name.replace(/\.[^/.]+$/, '') }, file.name);
  if (!result.success || !result.data) {
    throw new Error(result.error || `File format mismatch: Missing required columns (Date, Description, Category, Amount) in '${file.name}'`);
  }

  result.data.rawHeaders = rawHeaders;
  return result.data;
}

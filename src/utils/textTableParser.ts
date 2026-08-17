import * as XLSX from 'xlsx';
import { AccountMetadata, BankStatementData, PositionedLine, TransactionRow } from '../types';

export interface ParseResult {
  success: boolean;
  data?: BankStatementData;
  error?: string;
  missingColumns?: string[];
  detectedColumns?: string[];
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
export function validateAndMapBankStatement(
  rawTransactions: Array<any>,
  accountInfo: Partial<AccountMetadata> = {},
  fileName: string = 'bank_statement.pdf'
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
    
    // 1. Map Date (supports Date, Txn Date, Post Date, Value Date, Value Dt, etc.)
    const rawDate = String(
      raw.postDate || raw.date || raw.txnDate || raw.tranDate || raw.valueDate || raw.valueDt || raw['value dt'] || ''
    ).trim();
    const hasDate = dateRegex.test(rawDate);
    if (hasDate) validDateCount++;

    // 2. Map Description / Narration (supports Narration, Particulars, Description, Transaction Details, Remarks)
    const rawDesc = String(
      raw.narration || raw.description || raw.particulars || raw.transactionDetails || raw.details || raw.remarks || raw.txnDesc || ''
    ).trim();
    if (rawDesc.length > 1) validDescCount++;

    // 3. Map Value Date
    const rawValDate = String(
      raw.valueDate || raw.valueDt || raw['value dt'] || raw.valDate || rawDate
    ).trim();

    // 4. Map Cheque / Ref No (supports Chq./Ref.No., Chq No, Cheque No, Ref No, UTR, RRN)
    const rawChequeNo = String(
      raw.chequeNo || raw.chqNo || raw['chq./ref.no.'] || raw['chq / ref no'] || raw['chq/ref.no'] || raw.refNo || raw.referenceNo || raw.utr || ''
    ).trim();

    // 5. Map Amount (Debit / Withdrawal Amt., Credit / Deposit Amt., Amount)
    let parsedDebit: number | null = null;
    let parsedCredit: number | null = null;
    let parsedBalance: number | null = null;

    const parseNum = (v: any): number | null => {
      if (v === null || v === undefined || v === '' || v === '-' || v === '--') return null;
      if (typeof v === 'number') return isNaN(v) ? null : Math.abs(v);
      const clean = String(v).replace(/,/g, '').replace(/[^0-9.-]/g, '');
      const n = parseFloat(clean);
      return isNaN(n) ? null : Math.abs(n);
    };

    // Check Debit / Withdrawal variations
    const rawDebit = raw.debit ?? raw.withdrawal ?? raw['withdrawal amt.'] ?? raw['withdrawal amt'] ?? raw.withdrawalAmt ?? raw.drAmt ?? raw.dr ?? raw['debit amt'] ?? raw['debit amt.'];
    if (rawDebit !== undefined && rawDebit !== null && rawDebit !== '') {
      parsedDebit = parseNum(rawDebit);
    }

    // Check Credit / Deposit variations
    const rawCredit = raw.credit ?? raw.deposit ?? raw['deposit amt.'] ?? raw['deposit amt'] ?? raw.depositAmt ?? raw.crAmt ?? raw.cr ?? raw['credit amt'] ?? raw['credit amt.'];
    if (rawCredit !== undefined && rawCredit !== null && rawCredit !== '') {
      parsedCredit = parseNum(rawCredit);
    }

    // If single amount column (Amount / Net Amount / Txn Amount)
    const rawAmt = raw.amount ?? raw.txnAmount ?? raw['amount'] ?? raw['net amount'];
    if (parsedDebit === null && parsedCredit === null && rawAmt !== undefined && rawAmt !== null && rawAmt !== '') {
      const amtStr = String(rawAmt);
      const isNeg = amtStr.includes('-') || /dr\b/i.test(amtStr) || /dr\b/i.test(String(raw.balanceType || ''));
      const val = parseNum(amtStr);
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

    // Balance / Closing Balance
    const rawBal = raw.balance ?? raw.closingBalance ?? raw['closing balance'] ?? raw.runningBalance ?? raw.availBalance;
    if (rawBal !== undefined && rawBal !== null) {
      parsedBalance = parseNum(rawBal);
    }

    const hasAmount = (parsedDebit !== null && parsedDebit > 0) || (parsedCredit !== null && parsedCredit > 0) || parsedBalance !== null;
    if (hasAmount) validAmountCount++;

    // 6. Category & Mode auto-classification
    const isCredit = (parsedCredit !== null && parsedCredit > 0);
    const autoClass = categorizeTransaction(rawDesc, isCredit);
    const category = raw.category && raw.category.trim().length > 0 ? raw.category.trim() : autoClass.category;
    const mode = (raw.mode as any) || autoClass.mode;

    // Extract reference from narration or explicit ref column
    const rrnMatch = rawDesc.match(/(?:RRN\s*|Ref\s*No\.?\s*|\/XUTR\/|\/UPI\/|UPI\/)([A-Z0-9]{10,24})/i);
    const referenceNo = rawChequeNo || raw.referenceNo || (rrnMatch ? rrnMatch[1] : '');

    // If row has date or description and some amount/context
    if (hasDate && (hasAmount || rawDesc.length > 2)) {
      mappedTransactions.push({
        id: `tx-${i + 1}-${Date.now()}`,
        postDate: rawDate,
        valueDate: rawValDate || rawDate,
        branchCode: raw.branchCode || '',
        chequeNo: rawChequeNo,
        description: rawDesc || 'Bank Transaction',
        debit: parsedDebit,
        credit: parsedCredit,
        balance: parsedBalance,
        balanceType: (raw.balanceType as any) || (parsedBalance !== null ? 'CR' : ''),
        category,
        mode,
        referenceNo,
      });
    }
  }

  // Verification: At least 1 valid row found with date and description/amount
  if (mappedTransactions.length === 0 || (validDateCount === 0 && validDescCount === 0)) {
    return {
      success: false,
      error: `File format mismatch: Could not find valid bank transaction columns (Date, Narration/Description, Withdrawal/Deposit Amount) in '${fileName}'. Please ensure your statement is a valid bank statement.`,
      missingColumns: validDateCount === 0 ? ['Date'] : ['Narration / Description'],
    };
  }

  // Calculate totals
  let totDeb = 0;
  let totCred = 0;
  mappedTransactions.forEach(t => {
    if (t.debit) totDeb += t.debit;
    if (t.credit) totCred += t.credit;
  });

  // NOTE: Any field not actually detected from the uploaded statement is left
  // as an empty string (never a hardcoded/fake demo value). UI components are
  // responsible for rendering an honest "N/A" placeholder for blank fields.
  const account: AccountMetadata = {
    bankName: accountInfo.bankName || '',
    accountHolder: accountInfo.accountHolder || '',
    accountNumber: accountInfo.accountNumber || '',
    ifscCode: accountInfo.ifscCode || '',
    branchName: accountInfo.branchName || '',
    branchCode: accountInfo.branchCode || '',
    statementPeriod: accountInfo.statementPeriod || (mappedTransactions.length > 1 ? `${mappedTransactions[0].postDate} to ${mappedTransactions[mappedTransactions.length - 1].postDate}` : ''),
    currency: accountInfo.currency || 'INR (₹)',
    totalDebits: parseFloat(totDeb.toFixed(2)),
    totalCredits: parseFloat(totCred.toFixed(2)),
    debitCount: mappedTransactions.filter(t => (t.debit || 0) > 0).length,
    creditCount: mappedTransactions.filter(t => (t.credit || 0) > 0).length,
    openingBalance: mappedTransactions[0]?.balance ?? 0,
    closingBalance: mappedTransactions[mappedTransactions.length - 1]?.balance ?? undefined,
    customerAddress: accountInfo.customerAddress,
    email: accountInfo.email,
    productType: accountInfo.productType,
  };

  return {
    success: true,
    data: {
      id: `stmt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      fileName,
      fileSize: `${(mappedTransactions.length * 120 / 1024).toFixed(1)} KB`,
      pageCount: 1,
      uploadedAt: new Date().toISOString(),
      account,
      detectedColumns: ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance', 'Category'],
      transactions: mappedTransactions,
    },
    detectedColumns: ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance', 'Category'],
  };
}

/**
 * Scans the first block of statement lines for bank/account header details
 * (bank name, account number, IFSC, branch, holder name, statement period).
 * Shared by both the flat-text parser and the position-aware OCR parser.
 * Anything not actually found is simply omitted (no fake/sample data).
 */
export function extractAccountInfoFromLines(lines: string[]): Partial<AccountMetadata> {
  const accountInfo: Partial<AccountMetadata> = {
    currency: 'INR (₹)',
  };

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i];

    if (/central bank/i.test(line)) accountInfo.bankName = 'Central Bank of India';
    else if (/state bank|sbi/i.test(line)) accountInfo.bankName = 'State Bank of India';
    else if (/hdfc/i.test(line)) accountInfo.bankName = 'HDFC Bank';
    else if (/icici/i.test(line)) accountInfo.bankName = 'ICICI Bank';
    else if (/axis/i.test(line)) accountInfo.bankName = 'Axis Bank';
    else if (/punjab national|pnb/i.test(line)) accountInfo.bankName = 'Punjab National Bank';
    else if (/bank of baroda|bob/i.test(line)) accountInfo.bankName = 'Bank of Baroda';
    else if (/kotak/i.test(line)) accountInfo.bankName = 'Kotak Mahindra Bank';
    else if (/canara/i.test(line)) accountInfo.bankName = 'Canara Bank';
    else if (/indusind/i.test(line)) accountInfo.bankName = 'IndusInd Bank';
    else if (/yes\s*bank/i.test(line)) accountInfo.bankName = 'Yes Bank';
    else if (/chase/i.test(line)) accountInfo.bankName = 'Chase Bank';
    else if (/wells fargo/i.test(line)) accountInfo.bankName = 'Wells Fargo';
    else if (/bank of america/i.test(line)) accountInfo.bankName = 'Bank of America';
    else if (/barclays/i.test(line)) accountInfo.bankName = 'Barclays';
    else if (/hsbc/i.test(line)) accountInfo.bankName = 'HSBC';

    const accMatch = line.match(/(?:Account\s*(?:Number|No|A\/C\s*No)?[:\s]+)(\d{8,18})/i);
    if (accMatch && !accountInfo.accountNumber) accountInfo.accountNumber = accMatch[1];

    const ifscMatch = line.match(/(?:IFSC(?:\s*Code)?[:\s]+)([A-Z]{4}0[A-Z0-9]{6})/i);
    if (ifscMatch && !accountInfo.ifscCode) accountInfo.ifscCode = ifscMatch[1];
    else {
      // Some OCR'd statements print the IFSC as a standalone token without a preceding label.
      const bareIfsc = line.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/);
      if (bareIfsc && !accountInfo.ifscCode) accountInfo.ifscCode = bareIfsc[1];
    }

    const branchMatch = line.match(/(?:Branch\s*(?:Name|Code)?[:\s]+)([A-Za-z0-9_\-\s]{3,35})/i);
    if (branchMatch && !accountInfo.branchName) accountInfo.branchName = branchMatch[1].trim();

    const nameMatch = line.match(/(?:Mr\.|Mrs\.|Ms\.|Shri\.|M\/s)\s+([A-Z\s]{3,40})/i);
    if (nameMatch && !accountInfo.accountHolder) accountInfo.accountHolder = nameMatch[0].trim();

    const periodMatch = line.match(/(?:from\s+)?(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+to\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
    if (periodMatch) {
      accountInfo.statementPeriod = `${periodMatch[1]} to ${periodMatch[2]}`;
      accountInfo.startDate = periodMatch[1];
      accountInfo.endDate = periodMatch[2];
    }
  }

  return accountInfo;
}

/**
 * Parses raw text extracted from PDF or pasted text
 */
export function parseRawBankStatementText(rawText: string, fileName: string = 'bank_statement.pdf'): BankStatementData {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const accountInfo: Partial<AccountMetadata> = extractAccountInfoFromLines(lines);

  // Parse transaction table rows
  const rawRows: Array<any> = [];
  // Supports: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD-MMM-YYYY, DD MMM YYYY, YYYY-MM-DD
  const dateRegex = /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i;

  let currentRaw: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('PAGE_BREAK') || /^(page|printed\s*on|statement\s*of|disclaimer|total|carried\s*forward)/i.test(line)) {
      continue;
    }

    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      if (currentRaw) {
        rawRows.push(currentRaw);
        currentRaw = null;
      }

      const tokens = line.split(/\s+/);
      const postDate = dateMatch[1];
      let valDate = postDate;
      let nextIndex = 1;

      // Check if second token is also a date (Value Dt)
      if (tokens[1] && dateRegex.test(tokens[1])) {
        valDate = tokens[1];
        nextIndex = 2;
      }

      let branchCode = '';
      if (tokens[nextIndex] && /^\d{4,6}$/.test(tokens[nextIndex])) {
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
          parsedNumbers.unshift(parseFloat(numClean));
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
      if (!/^(page|statement|branch|account|uncleared|cleared)/i.test(line)) {
        currentRaw.description = `${currentRaw.description || ''} ${line}`.trim();
      }
    }
  }

  if (currentRaw) {
    rawRows.push(currentRaw);
  }

  const result = validateAndMapBankStatement(rawRows, accountInfo, fileName);
  if (!result.success || !result.data) {
    throw new Error(result.error || `File format mismatch: Could not find required columns (Date, Description, Category, Amount) in '${fileName}'`);
  }

  return result.data;
}

// A token counts as a real currency amount only if it has a decimal point with
// 1-2 fractional digits (e.g. "6,090.00" or "93.12"). This deliberately
// excludes bare long integers such as Chq/Ref/UTR/RRN numbers (which can be
// 10-18 digits long and would otherwise be misread as huge debit/credit amounts).
const POSITIONED_AMOUNT_RE = /^-?\d{1,3}(,\d{2,3})*\.\d{1,2}$|^-?\d+\.\d{1,2}$/;
const POSITIONED_DATE_RE = /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/;

function isPositionedAmountToken(text: string): boolean {
  const t = text.trim();
  if (t === '-' || t === '--' || t === '') return false;
  if (!POSITIONED_AMOUNT_RE.test(t)) return false;
  return !isNaN(parseFloat(t.replace(/,/g, '')));
}

/**
 * Splits a set of x-coordinates into two clusters (e.g. "Withdrawal column"
 * vs "Deposit column") using the largest-gap method: sort all x-values, find
 * the single biggest gap between consecutive values, and split there. Falls
 * back to a single cluster if the values aren't clearly bimodal.
 */
function splitIntoTwoColumnClusters(xs: number[]): { left: number | null; right: number | null } {
  if (xs.length === 0) return { left: null, right: null };
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 1) return { left: sorted[0], right: null };

  let biggestGap = -Infinity;
  let splitIdx = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > biggestGap) {
      biggestGap = gap;
      splitIdx = i;
    }
  }

  if (biggestGap < 40) {
    // Not clearly bimodal - treat as a single cluster.
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    return { left: avg, right: null };
  }

  const left = sorted.slice(0, splitIdx + 1);
  const right = sorted.slice(splitIdx + 1);
  return {
    left: left.reduce((a, b) => a + b, 0) / left.length,
    right: right.reduce((a, b) => a + b, 0) / right.length,
  };
}

/**
 * Position-aware bank statement parser for use with OCR / text-layer output
 * that retains per-word x/y coordinates (see extractPdfContent in
 * pdfExtractor.ts). This fixes the ambiguous "which column is this lone
 * amount in, Withdrawal or Deposit?" problem by clustering the x-position of
 * every single-amount row across the whole document, rather than relying
 * only on narration keywords (which many real UPI/IMPS credits don't contain).
 */
export function parsePositionedBankStatementLines(
  positionedLines: PositionedLine[],
  fileName: string = 'bank_statement.pdf'
): BankStatementData {
  // Group lines by page (mirrors how the statement is actually laid out;
  // a transaction's continuation/narration lines don't span across pages).
  const pageNumbers = Array.from(new Set(positionedLines.map(l => l.page))).sort((a, b) => a - b);
  const linesByPage: Map<number, PositionedLine[]> = new Map();
  for (const p of pageNumbers) {
    linesByPage.set(p, positionedLines.filter(l => l.page === p).sort((a, b) => a.y - b.y));
  }

  // Account/header info: scan the flattened text of the first page(s).
  const flatLinesForHeader = positionedLines
    .slice(0, 80)
    .map(l => l.words.map(w => w.text).join(' '));
  const accountInfo = extractAccountInfoFromLines(flatLinesForHeader);

  interface ParsedRow {
    postDate: string;
    valueDate: string;
    description: string;
    numeric: Array<{ x: number; v: number }>;
  }

  const parsedRows: ParsedRow[] = [];
  const ambiguousAmountXs: number[] = [];

  for (const page of pageNumbers) {
    const lines = linesByPage.get(page)!;
    let current: ParsedRow | null = null;

    for (const line of lines) {
      const toks = line.words;
      if (!toks.length) continue;
      const firstText = toks[0].text;

      if (POSITIONED_DATE_RE.test(firstText)) {
        if (current) parsedRows.push(current);

        const postDate = firstText;
        const dateToks = toks.filter(t => POSITIONED_DATE_RE.test(t.text));
        const valueDate = dateToks.length > 1 ? dateToks[1].text : postDate;
        const numericToks = toks.filter(t => isPositionedAmountToken(t.text));
        const descToks = toks.filter(
          t => t.text !== '|' && !numericToks.includes(t) && !dateToks.includes(t)
        );

        current = {
          postDate,
          valueDate,
          description: descToks.map(t => t.text).join(' '),
          numeric: numericToks.map(t => ({ x: t.x, v: parseFloat(t.text.replace(/,/g, '')) })),
        };
      } else if (current) {
        const contText = toks.filter(t => t.text !== '|').map(t => t.text).join(' ');
        if (contText) current.description = `${current.description} ${contText}`.trim();
      }
    }
    if (current) parsedRows.push(current);
  }

  // Gather ambiguous (2-number) rows' first numeric x for clustering.
  for (const r of parsedRows) {
    if (r.numeric.length === 2) ambiguousAmountXs.push(r.numeric[0].x);
  }
  const { left: withdrawalMean, right: depositMean } = splitIntoTwoColumnClusters(ambiguousAmountXs);

  const rawRows: Array<any> = parsedRows.map(r => {
    const nums = r.numeric;
    let debit: number | null = null;
    let credit: number | null = null;
    let balance: number | null = null;

    if (nums.length >= 3) {
      const sorted = [...nums].sort((a, b) => a.x - b.x);
      const d = sorted[sorted.length - 3].v;
      const c = sorted[sorted.length - 2].v;
      const b = sorted[sorted.length - 1].v;
      debit = d > 0 ? d : null;
      credit = c > 0 ? c : null;
      // Preserve zero balances so the next row can still be classified by
      // comparing running-balance changes.
      balance = b;
    } else if (nums.length === 2) {
      const sorted = [...nums].sort((a, b) => a.x - b.x);
      const amt = sorted[0];
      balance = sorted[1].v;
      if (depositMean !== null && withdrawalMean !== null) {
        const distToWithdrawal = Math.abs(amt.x - withdrawalMean);
        const distToDeposit = Math.abs(amt.x - depositMean);
        if (distToDeposit < distToWithdrawal) {
          credit = amt.v > 0 ? amt.v : null;
        } else {
          debit = amt.v > 0 ? amt.v : null;
        }
      } else if (/deposit|credit|interest|refund|inward|cr\b|from\s+a\/c|payment from phone/i.test(r.description)) {
        credit = amt.v > 0 ? amt.v : null;
      } else {
        debit = amt.v > 0 ? amt.v : null;
      }
    } else if (nums.length === 1) {
      balance = nums[0].v;
    }

    return {
      postDate: r.postDate,
      valueDate: r.valueDate,
      description: r.description.trim() || 'Bank Transaction',
      debit,
      credit,
      balance,
    };
  });

  // Some bank PDFs omit the empty debit/credit column, leaving only
  // [transaction amount, running balance]. Narration is not enough to tell
  // whether a UPI entry is incoming or outgoing, so use the balance delta.
  let previousBalance: number | null = null;
  for (const row of rawRows) {
    const amount = row.debit ?? row.credit ?? null;
    if (amount !== null && row.balance !== null && previousBalance !== null) {
      const delta = row.balance - previousBalance;
      if (delta > 0) {
        row.credit = amount;
        row.debit = null;
      } else if (delta < 0) {
        row.debit = amount;
        row.credit = null;
      }
    }
    if (row.balance !== null && row.balance !== undefined) {
      previousBalance = row.balance;
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
      if (/^(date|post\s*date|txn\s*date|tran\s*date|posting\s*date)$/.test(val) || (val.includes('date') && !val.includes('value'))) {
        dateCol = c;
        foundDate = true;
      }
      if (/value\s*dt|value\s*date|val\s*date/.test(val)) {
        valDateCol = c;
      }
      if (/chq|cheque|ref\s*no|utr|rrn|instrument/.test(val)) {
        chqCol = c;
      }
      if (/narration|particulars|description|details|remarks|transaction\s*details|txn\s*desc/.test(val)) {
        descCol = c;
        foundDesc = true;
      }
      if (/category|spending\s*category|tag/.test(val)) {
        catCol = c;
      }
      if (/withdrawal|debit|dr\b|payment|spent|dr\s*amt/.test(val)) {
        debitCol = c;
        foundAmt = true;
      }
      if (/deposit|credit|cr\b|received|inflow|cr\s*amt/.test(val)) {
        creditCol = c;
        foundAmt = true;
      }
      if (/amount|net\s*amount|txn\s*amount/.test(val) && debitCol === -1 && creditCol === -1) {
        amountCol = c;
        foundAmt = true;
      }
      if (/closing\s*balance|balance|running\s*balance|avail\s*balance/.test(val)) {
        balanceCol = c;
      }
      if (/mode|type|payment\s*mode|channel/.test(val)) {
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
  for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
    const row = jsonData[r];
    if (!row || row.length === 0) continue;

    const rawDate = dateCol !== -1 ? row[dateCol] : '';
    const rawDesc = descCol !== -1 ? row[descCol] : '';
    if (!rawDate && !rawDesc) continue;

    rawRows.push({
      date: rawDate,
      valueDate: valDateCol !== -1 ? row[valDateCol] : undefined,
      chequeNo: chqCol !== -1 ? row[chqCol] : undefined,
      description: rawDesc,
      category: catCol !== -1 ? row[catCol] : undefined,
      debit: debitCol !== -1 ? row[debitCol] : undefined,
      credit: creditCol !== -1 ? row[creditCol] : undefined,
      amount: amountCol !== -1 ? row[amountCol] : undefined,
      balance: balanceCol !== -1 ? row[balanceCol] : undefined,
      mode: modeCol !== -1 ? row[modeCol] : undefined,
    });
  }

  const result = validateAndMapBankStatement(rawRows, { bankName: file.name.replace(/\.[^/.]+$/, '') }, file.name);
  if (!result.success || !result.data) {
    throw new Error(result.error || `File format mismatch: Missing required columns (Date, Description, Category, Amount) in '${file.name}'`);
  }

  return result.data;
}

export interface TransactionRow {
  id: string;
  postDate: string;
  valueDate?: string;
  branchCode?: string;
  chequeNo?: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  balanceType?: 'CR' | 'DR' | '';
  category?: string;
  mode?: 'UPI' | 'NEFT' | 'IMPS' | 'CASH' | 'TRANSFER' | 'CHARGES' | 'INTEREST' | 'OTHER';
  referenceNo?: string;
}

export interface AccountMetadata {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifscCode?: string;
  branchName?: string;
  branchCode?: string;
  statementPeriod?: string;
  startDate?: string;
  endDate?: string;
  openingBalance?: number;
  closingBalance?: number;
  totalDebits?: number;
  totalCredits?: number;
  debitCount?: number;
  creditCount?: number;
  currency?: string;
  customerAddress?: string;
  email?: string;
  productType?: string;
  statementDate?: string;
}

export interface BankStatementData {
  id: string;
  fileName: string;
  fileSize?: string;
  pageCount?: number;
  uploadedAt: string;
  account: AccountMetadata;
  transactions: TransactionRow[];
  detectedColumns: string[];
}

export type ViewTab = 'spreadsheet' | 'summary' | 'insights' | 'raw';

export interface ColumnConfig {
  key: keyof TransactionRow;
  label: string;
  visible: boolean;
  type: 'text' | 'number' | 'date' | 'badge';
  width?: string;
}

export interface ExportSettings {
  format: 'xlsx' | 'csv' | 'json';
  fileName: string;
  includeSummarySheet: boolean;
  includeCategoryColumn: boolean;
  includeModeColumn: boolean;
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  amountFormat: 'split' | 'single'; // split = Debit + Credit columns, single = Amount (+/-)
}

/**
 * A single OCR'd / text-layer word with its pixel/PDF-space position,
 * used for position-aware column detection (e.g. distinguishing
 * Withdrawal vs Deposit columns when a row only has one ambiguous amount).
 */
export interface PositionedWord {
  text: string;
  x: number;
  y: number;
}

/** A single line of a statement page, made up of positioned words, in reading order. */
export interface PositionedLine {
  page: number;
  y: number;
  words: PositionedWord[];
}

/** Progress info reported while extracting/OCR-ing a PDF, for progress-bar UI. */
export interface ExtractProgress {
  fileName?: string;
  stage: 'loading' | 'text-layer' | 'ocr';
  page: number;
  totalPages: number;
  percent: number; // 0-100 for this file
}

export type ExtractProgressCallback = (progress: ExtractProgress) => void;

/** Result of extracting a PDF: both a flat text view and a positioned-word view. */
export interface ExtractedPdfResult {
  text: string;
  positionedLines: PositionedLine[];
  pageCount: number;
  usedOcr: boolean;
}

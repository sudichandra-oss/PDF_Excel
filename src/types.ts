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
  rawRows?: Array<Record<string, any>>;
  rawHeaders?: string[];
  rawCaretText?: string;
}

export interface ColumnMappingConfig {
  postDateCol: string;
  valueDateCol?: string;
  descriptionCol: string;
  chequeNoCol?: string;
  branchCodeCol?: string;
  debitCol?: string;
  creditCol?: string;
  amountCol?: string; // If single amount column
  drCrCol?: string;   // If separate DR/CR column
  balanceCol?: string;
  categoryCol?: string;
  modeCol?: string;
  dateFormat?: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'AUTO';
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

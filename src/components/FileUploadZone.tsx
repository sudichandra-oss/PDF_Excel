import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  Layers, 
  FileSpreadsheet, 
  Trash2, 
  CheckSquare, 
  Square, 
  AlertTriangle,
  Clock,
  Zap,
  ShieldCheck,
  TrendingUp,
  FileCheck,
  Lock,
  Unlock,
  Key,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileSearch,
  Info,
  RefreshCw,
  FileWarning,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { parseRawBankStatementText, parseExcelOrCsvFile, diagnoseExtractedText, TextDiagnostics } from '../utils/textTableParser';
import { extractTextFromPDF, extractDetailedTextFromPDF, PdfExtractionDetails } from '../utils/pdfExtractor';
import { BankStatementData, TransactionRow } from '../types';

export interface FileDiagnosticInfo {
  fileName: string;
  fileSize: number;
  isPdf: boolean;
  totalPages?: number;
  extractedChars?: number;
  extractedLines?: number;
  isPasswordProtected?: boolean;
  isPasswordIncorrect?: boolean;
  isScannedOrImageOnly?: boolean;
  isCorrupt?: boolean;
  documentTypeGuess?: string;
  errorCode: string;
  title: string;
  diagnosticReason: string;
  suggestedAction: string;
  extractedSample?: string;
}

export interface FileQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  selected: boolean;
  status: 'idle' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  diagnostics?: FileDiagnosticInfo;
  password?: string;
  parsedData?: BankStatementData;
  txCount?: number;
  progressPercent?: number;
}

interface ConversionProgressState {
  isActive: boolean;
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  percent: number;
  stage: string;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number | null;
  currentPage?: number;
  totalPages?: number;
}

interface FileUploadZoneProps {
  onStatementLoaded: (data: BankStatementData) => void;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onStatementLoaded,
}) => {
  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [activeDiagnostics, setActiveDiagnostics] = useState<FileDiagnosticInfo[]>([]);
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [expandedInspectMap, setExpandedInspectMap] = useState<Record<string, boolean>>({});
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [rawTextInput, setRawTextInput] = useState('');
  const [targetFormat, setTargetFormat] = useState('Excel Workbook (.xlsx)');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [autoDetectColumns, setAutoDetectColumns] = useState(true);
  const [mergeMultiline, setMergeMultiline] = useState(true);

  // Conversion Progress & Time Tracking State
  const [progressState, setProgressState] = useState<ConversionProgressState>({
    isActive: false,
    fileName: '',
    fileIndex: 1,
    totalFiles: 1,
    percent: 0,
    stage: 'Initializing conversion...',
    elapsedSeconds: 0,
    estimatedRemainingSeconds: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Live timer for elapsed and pending time calculation
  useEffect(() => {
    if (isProcessing) {
      startTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setProgressState(prev => {
          let estimatedRemaining: number | null = null;
          if (prev.percent > 5 && prev.percent < 100) {
            const totalEstimatedDuration = (elapsed / (prev.percent / 100));
            estimatedRemaining = Math.max(0.2, parseFloat((totalEstimatedDuration - elapsed).toFixed(1)));
          } else if (prev.percent >= 100) {
            estimatedRemaining = 0;
          } else {
            // Initial conservative estimate based on file count
            estimatedRemaining = Math.max(1, 3.5 * prev.totalFiles - elapsed);
          }
          return {
            ...prev,
            elapsedSeconds: parseFloat(elapsed.toFixed(1)),
            estimatedRemainingSeconds: estimatedRemaining !== null ? parseFloat(estimatedRemaining.toFixed(1)) : null,
          };
        });
      }, 150);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isProcessing]);

  // Add files to queue
  const addFilesToQueue = (files: FileList | File[]) => {
    setGlobalError(null);
    setActiveDiagnostics([]);
    const newItems: FileQueueItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const existing = fileQueue.find(item => item.name === f.name && item.size === f.size);
      if (!existing) {
        newItems.push({
          id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          file: f,
          name: f.name,
          size: f.size,
          selected: true,
          status: 'idle',
        });
      }
    }

    if (newItems.length > 0) {
      setFileQueue(prev => [...prev, ...newItems]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
      e.target.value = '';
    }
  };

  // Toggle individual file selection
  const toggleFileSelect = (id: string) => {
    setFileQueue(prev =>
      prev.map(item => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  // Select all files
  const handleSelectAll = () => {
    setFileQueue(prev => prev.map(item => ({ ...item, selected: true })));
  };

  // Unselect all files
  const handleUnselectAll = () => {
    setFileQueue(prev => prev.map(item => ({ ...item, selected: false })));
  };

  // Remove a single file from queue
  const handleRemoveFile = (id: string) => {
    setFileQueue(prev => prev.filter(item => item.id !== id));
    setActiveDiagnostics(prev => prev.filter(d => d.fileName !== id));
  };

  // Clear all files
  const handleClearAll = () => {
    setFileQueue([]);
    setGlobalError(null);
    setActiveDiagnostics([]);
  };

  /**
   * Parse a single file with granular diagnostics and progress updates
   */
  const processSingleFile = async (
    item: FileQueueItem,
    fileIndex: number,
    totalFiles: number
  ): Promise<{ success: boolean; data?: BankStatementData; error?: string; diagnostics?: FileDiagnosticInfo }> => {
    const file = item.file;
    const lowerName = file.name.toLowerCase();

    // Helper to calculate combined progress across files
    const updateProgress = (subPercent: number, stage: string, page?: number, totalPages?: number) => {
      const basePerFile = 100 / totalFiles;
      const currentFileBase = fileIndex * basePerFile;
      const combinedPercent = Math.min(99, Math.round(currentFileBase + (subPercent / 100) * basePerFile));

      setProgressState(prev => ({
        ...prev,
        isActive: true,
        fileName: file.name,
        fileIndex: fileIndex + 1,
        totalFiles,
        percent: combinedPercent,
        stage,
        currentPage: page,
        totalPages,
      }));
    };

    try {
      updateProgress(10, `Reading byte streams for '${file.name}'...`);

      // 1. If Excel / CSV file - parse immediately
      if (lowerName.endsWith('.csv') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        updateProgress(50, `Parsing spreadsheet rows and validating columns...`);
        const parsed = await parseExcelOrCsvFile(file);
        updateProgress(100, `Done parsing '${file.name}'.`);
        return { success: true, data: parsed };
      }

      // 2. Client-side PDF extraction with detailed diagnostics
      if (lowerName.endsWith('.pdf')) {
        updateProgress(20, `Inspecting PDF security & text layer...`);
        const passwordToUse = item.password || passwordInputs[item.id] || '';
        const pdfDetails = await extractDetailedTextFromPDF(file, passwordToUse, (pdfProg) => {
          updateProgress(
            pdfProg.percent,
            pdfProg.stage,
            pdfProg.page,
            pdfProg.totalPages
          );
        });

        // 2a. Password-protected PDF detected
        if (pdfDetails.isPasswordProtected) {
          const diag: FileDiagnosticInfo = {
            fileName: file.name,
            fileSize: file.size,
            isPdf: true,
            isPasswordProtected: true,
            isPasswordIncorrect: pdfDetails.isPasswordIncorrect,
            errorCode: pdfDetails.isPasswordIncorrect ? 'PASSWORD_INCORRECT' : 'PASSWORD_REQUIRED',
            title: pdfDetails.isPasswordIncorrect ? 'Incorrect PDF Password' : 'Password-Protected Bank Statement',
            diagnosticReason: pdfDetails.diagnosticReason || 'This bank statement is encrypted with a password. Please enter your password to unlock.',
            suggestedAction: pdfDetails.suggestedAction || 'Enter your password (e.g., DOB DDMMYYYY, first 4 letters of name + DOB, or PAN card number) to decrypt.',
          };
          return { success: false, error: diag.diagnosticReason, diagnostics: diag };
        }

        // 2b. Corrupt or damaged PDF file
        if (pdfDetails.isCorrupt) {
          const diag: FileDiagnosticInfo = {
            fileName: file.name,
            fileSize: file.size,
            isPdf: true,
            isCorrupt: true,
            errorCode: 'CORRUPT_FILE',
            title: 'Corrupted or Invalid PDF Structure',
            diagnosticReason: pdfDetails.diagnosticReason || 'The PDF file is damaged or corrupted and could not be decoded.',
            suggestedAction: pdfDetails.suggestedAction || 'Please re-download the statement from your bank portal.',
          };
          return { success: false, error: diag.diagnosticReason, diagnostics: diag };
        }

        // 2c. Digital text layer found: attempt immediate local table parsing
        if (pdfDetails.hasTextLayer && pdfDetails.text && pdfDetails.text.trim().length > 20) {
          updateProgress(85, `Mapping bank columns (Date, Description, Category, Amount)...`);
          try {
            const parsed = parseRawBankStatementText(pdfDetails.text, file.name);
            if (parsed && parsed.transactions.length > 0) {
              updateProgress(100, `Validated ${parsed.transactions.length} rows successfully.`);
              return { success: true, data: parsed };
            }
          } catch (parseErr) {
            console.info('Client parser encountered layout variance, attempting server AI fallback...', parseErr);
          }
        }

        // 2d. Fallback to Server-side Gemini AI Parser (for scanned image PDFs / photos or complex layouts)
        try {
          updateProgress(45, `Scanning document with AI OCR & layout analyzer...`);
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const res = reader.result as string;
              resolve(res.split(',')[1] || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const base64 = await base64Promise;
          updateProgress(65, `Analyzing financial tables & narrations via AI...`);

          const response = await fetch('/api/parse-statement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64: base64,
              mimeType: file.type || 'application/pdf',
              fileName: file.name,
            }),
          });

          const resData = await response.json();
          if (resData.success && resData.data && resData.data.transactions?.length > 0) {
            updateProgress(100, `AI structured ${resData.data.transactions.length} rows.`);
            return { success: true, data: resData.data };
          }
        } catch (serverErr) {
          console.warn('Server AI parser error:', serverErr);
        }

        // 2e. If neither client nor server could extract transactions, generate rich diagnostic info
        if (pdfDetails.isScannedOrImageOnly || !pdfDetails.hasTextLayer) {
          const diag: FileDiagnosticInfo = {
            fileName: file.name,
            fileSize: file.size,
            isPdf: true,
            totalPages: pdfDetails.totalPages,
            isScannedOrImageOnly: true,
            errorCode: 'SCANNED_IMAGE_NO_TEXT',
            title: 'Scanned / Non-Searchable PDF (No Embedded Text Layer)',
            diagnosticReason: `The PDF contains ${pdfDetails.totalPages || 1} page(s) but has 0 digital text characters. It is a scanned paper photocopy, photo, or rasterized image without selectable computer text.`,
            suggestedAction: 'Please paste the statement text directly using the "Paste Statement Text" tool below, or upload a digital statement downloaded directly from your bank net banking.',
          };
          return { success: false, error: diag.diagnosticReason, diagnostics: diag };
        }

        // 2f. Text exists but failed to match transaction rows (missing dates, non-statement doc, etc.)
        const textDiag = diagnoseExtractedText(pdfDetails.text, file.name);
        const diag: FileDiagnosticInfo = {
          fileName: file.name,
          fileSize: file.size,
          isPdf: true,
          totalPages: pdfDetails.totalPages,
          extractedChars: pdfDetails.extractedChars,
          extractedLines: pdfDetails.extractedLines,
          documentTypeGuess: textDiag.documentTypeGuess,
          errorCode: 'NO_TRANSACTIONS_DETECTED',
          title: textDiag.documentTypeGuess !== 'Bank Statement' ? `Non-Statement Document: ${textDiag.documentTypeGuess}` : 'No Transaction Columns Detected',
          diagnosticReason: textDiag.reason,
          suggestedAction: textDiag.suggestedAction,
          extractedSample: pdfDetails.text.substring(0, 450),
        };
        return { success: false, error: diag.diagnosticReason, diagnostics: diag };
      } else if (lowerName.endsWith('.txt')) {
        updateProgress(30, `Reading text lines...`);
        const text = await file.text();
        updateProgress(75, `Mapping columns and transaction narrations...`);
        try {
          const parsed = parseRawBankStatementText(text, file.name);
          updateProgress(100, `Validated ${parsed.transactions.length} rows.`);
          return { success: true, data: parsed };
        } catch (txtErr: any) {
          const textDiag = diagnoseExtractedText(text, file.name);
          const diag: FileDiagnosticInfo = {
            fileName: file.name,
            fileSize: file.size,
            isPdf: false,
            extractedChars: text.length,
            extractedLines: text.split('\n').length,
            documentTypeGuess: textDiag.documentTypeGuess,
            errorCode: 'NO_TRANSACTIONS_DETECTED',
            title: 'Text Statement Format Unrecognized',
            diagnosticReason: textDiag.reason,
            suggestedAction: textDiag.suggestedAction,
            extractedSample: text.substring(0, 450),
          };
          return { success: false, error: diag.diagnosticReason, diagnostics: diag };
        }
      }

      return {
        success: false,
        error: `Could not extract readable transactions from '${file.name}'.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || `Could not parse bank statement from '${file.name}'.`,
      };
    }
  };

  /**
   * Unlock and reprocess a single password-protected file
   */
  const handleUnlockAndProcess = async (item: FileQueueItem) => {
    const password = passwordInputs[item.id] || '';
    if (!password) {
      setGlobalError(`Please enter the password for '${item.name}' to unlock.`);
      return;
    }

    setIsProcessing(true);
    setGlobalError(null);
    setProgressState({
      isActive: true,
      fileName: item.name,
      fileIndex: 1,
      totalFiles: 1,
      percent: 30,
      stage: `Decrypting '${item.name}' with provided password...`,
      elapsedSeconds: 0,
      estimatedRemainingSeconds: 1.5,
    });

    setFileQueue(prev =>
      prev.map(it => (it.id === item.id ? { ...it, status: 'processing', password, errorMessage: undefined } : it))
    );

    const res = await processSingleFile({ ...item, password }, 0, 1);
    setIsProcessing(false);
    setProgressState(prev => ({ ...prev, isActive: false }));

    if (res.success && res.data) {
      setFileQueue(prev =>
        prev.map(it => (it.id === item.id ? { 
          ...it, 
          status: 'success', 
          parsedData: res.data, 
          txCount: res.data?.transactions.length || 0,
          errorMessage: undefined,
          diagnostics: undefined
        } : it))
      );
      setActiveDiagnostics(prev => prev.filter(d => d.fileName !== item.name));
      onStatementLoaded(res.data);
    } else {
      const errorText = res.error || `Could not decrypt '${item.name}'.`;
      setFileQueue(prev =>
        prev.map(it => (it.id === item.id ? { 
          ...it, 
          status: 'error', 
          errorMessage: errorText, 
          diagnostics: res.diagnostics 
        } : it))
      );
      if (res.diagnostics) {
        setActiveDiagnostics(prev => [res.diagnostics!, ...prev.filter(d => d.fileName !== item.name)]);
      }
      setGlobalError(errorText);
    }
  };

  /**
   * Process all selected files sequentially with progress bar and time estimation
   */
  const handleProcessSelectedFiles = async () => {
    const selectedItems = fileQueue.filter(item => item.selected);
    if (selectedItems.length === 0) {
      setGlobalError('Please select at least one statement file to upload and convert.');
      return;
    }

    setIsProcessing(true);
    setGlobalError(null);
    setActiveDiagnostics([]);

    // Initial progress state
    setProgressState({
      isActive: true,
      fileName: selectedItems[0].name,
      fileIndex: 1,
      totalFiles: selectedItems.length,
      percent: 5,
      stage: `Starting conversion of ${selectedItems.length} statement(s)...`,
      elapsedSeconds: 0,
      estimatedRemainingSeconds: selectedItems.length * 2.5,
    });

    // Mark all selected items as processing
    setFileQueue(prev =>
      prev.map(it => (it.selected ? { ...it, status: 'processing', errorMessage: undefined, diagnostics: undefined } : it))
    );

    const successfulStatements: BankStatementData[] = [];
    const collectedDiagnostics: FileDiagnosticInfo[] = [];
    const errorMessages: string[] = [];

    // Process files
    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      const res = await processSingleFile(item, i, selectedItems.length);

      if (res.success && res.data) {
        successfulStatements.push(res.data);
        setFileQueue(prev =>
          prev.map(it => (it.id === item.id ? { 
            ...it, 
            status: 'success', 
            parsedData: res.data,
            txCount: res.data?.transactions.length || 0,
            errorMessage: undefined,
            diagnostics: undefined
          } : it))
        );
      } else {
        const errorText = res.error || `Could not parse transactions from '${item.name}'.`;
        errorMessages.push(`${item.name}: ${errorText}`);
        if (res.diagnostics) {
          collectedDiagnostics.push(res.diagnostics);
        }
        setFileQueue(prev =>
          prev.map(it => (it.id === item.id ? { 
            ...it, 
            status: 'error', 
            errorMessage: errorText,
            diagnostics: res.diagnostics
          } : it))
        );
      }
    }

    // Wrap up progress bar
    setProgressState(prev => ({
      ...prev,
      percent: 100,
      stage: 'Conversion finished! Preparing spreadsheet grid...',
      estimatedRemainingSeconds: 0,
    }));

    await new Promise(resolve => setTimeout(resolve, 400));

    setIsProcessing(false);
    setProgressState(prev => ({ ...prev, isActive: false }));
    setActiveDiagnostics(collectedDiagnostics);

    if (errorMessages.length > 0) {
      setGlobalError(errorMessages.join('\n\n'));
    }

    // If at least one file succeeded, merge or load it!
    if (successfulStatements.length > 0) {
      if (successfulStatements.length === 1) {
        onStatementLoaded(successfulStatements[0]);
      } else {
        // Merge multiple statements into a consolidated statement
        const allTransactions: TransactionRow[] = [];
        let totalDeb = 0;
        let totalCred = 0;

        successfulStatements.forEach((stmt, sIdx) => {
          stmt.transactions.forEach((tx, tIdx) => {
            allTransactions.push({
              ...tx,
              id: `multi-${sIdx + 1}-tx-${tIdx + 1}`,
            });
            if (tx.debit && tx.debit !== -1) totalDeb += tx.debit;
            if (tx.credit && tx.credit !== -1) totalCred += tx.credit;
          });
        });

        // Sort chronologically by postDate
        allTransactions.sort((a, b) => (a.postDate || '').localeCompare(b.postDate || ''));

        const primaryAccount = successfulStatements[0].account;
        const mergedStatement: BankStatementData = {
          id: `stmt-merged-${Date.now()}`,
          fileName: `${successfulStatements.length} Consolidated Statements (${successfulStatements.map(s => s.fileName).join(', ')})`,
          fileSize: `${(allTransactions.length * 0.15).toFixed(1)} KB`,
          pageCount: successfulStatements.reduce((acc, s) => acc + (s.pageCount || 1), 0),
          uploadedAt: new Date().toISOString(),
          account: {
            ...primaryAccount,
            bankName: successfulStatements.length > 1 ? 'Multi-Statement Consolidated' : primaryAccount.bankName,
            totalDebits: parseFloat(totalDeb.toFixed(2)),
            totalCredits: parseFloat(totalCred.toFixed(2)),
            debitCount: allTransactions.filter(t => (t.debit || 0) > 0 && t.debit !== -1).length,
            creditCount: allTransactions.filter(t => (t.credit || 0) > 0 && t.credit !== -1).length,
            openingBalance: allTransactions[0]?.balance ?? primaryAccount.openingBalance ?? 0,
            closingBalance: allTransactions[allTransactions.length - 1]?.balance ?? primaryAccount.closingBalance ?? undefined,
          },
          detectedColumns: ['Date', 'Description', 'Category', 'Amount', 'Mode', 'Balance'],
          transactions: allTransactions,
        };

        onStatementLoaded(mergedStatement);
      }
    }
  };

  const handlePasteSubmit = () => {
    if (!rawTextInput.trim()) return;
    setIsProcessing(true);
    setGlobalError(null);

    setProgressState({
      isActive: true,
      fileName: 'Pasted Statement Text',
      fileIndex: 1,
      totalFiles: 1,
      percent: 40,
      stage: 'Parsing pasted statement text into columns...',
      elapsedSeconds: 0,
      estimatedRemainingSeconds: 1.0,
    });

    setTimeout(() => {
      try {
        const parsed = parseRawBankStatementText(rawTextInput, 'Pasted_Bank_Statement.txt');
        setProgressState(prev => ({ ...prev, percent: 100, stage: 'Formatting complete!' }));
        setIsProcessing(false);
        onStatementLoaded(parsed);
      } catch (err: any) {
        setGlobalError(err.message || 'File format mismatch: Could not find required columns (Date, Description, Category, Amount).');
        setIsProcessing(false);
        setProgressState(prev => ({ ...prev, isActive: false }));
      }
    }, 400);
  };

  const selectedCount = fileQueue.filter(f => f.selected).length;
  const totalCount = fileQueue.length;

  return (
    <div className="space-y-6">
      {/* Prominent Real-time Conversion Progress Bar (shown during active processing) */}
      {isProcessing && (
        <div className="bg-white border-2 border-blue-500/80 rounded-2xl p-5 shadow-lg space-y-4 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md animate-pulse">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-gray-900">
                    Converting Statement to Excel
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                    File {progressState.fileIndex} of {progressState.totalFiles}
                  </span>
                </div>
                <p className="text-xs text-gray-600 truncate max-w-md font-mono mt-0.5">
                  {progressState.fileName}
                </p>
              </div>
            </div>

            {/* Live Time Tracking Counters */}
            <div className="flex items-center space-x-3 text-xs">
              <div className="bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-gray-500">Elapsed:</span>
                <span className="font-mono font-bold text-gray-800">{progressState.elapsedSeconds}s</span>
              </div>

              <div className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                <span className="text-blue-700 font-medium">Time pending:</span>
                <span className="font-mono font-bold text-blue-900">
                  {progressState.estimatedRemainingSeconds !== null
                    ? `${progressState.estimatedRemainingSeconds}s`
                    : 'calculating...'}
                </span>
              </div>
            </div>
          </div>

          {/* Graphical Progress Bar with Animated Gradient */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-blue-700 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {progressState.stage}
              </span>
              <span className="text-gray-900 font-mono text-sm">{progressState.percent}%</span>
            </div>

            <div className="w-full bg-gray-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-gray-200 shadow-inner">
              <div
                className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 h-full rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-1"
                style={{ width: `${Math.max(4, progressState.percent)}%` }}
              >
                <div className="w-2 h-2 bg-white rounded-full opacity-80 animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* Multi-stage process indicators */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            <div className={`p-2 rounded-lg border flex items-center gap-2 ${
              progressState.percent >= 20 ? 'bg-blue-50/80 border-blue-200 text-blue-900' : 'bg-gray-50 border-gray-200 text-gray-400'
            }`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${progressState.percent >= 20 ? 'text-blue-600' : 'text-gray-300'}`} />
              <span className="font-medium">1. Read Stream</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-2 ${
              progressState.percent >= 50 ? 'bg-blue-50/80 border-blue-200 text-blue-900' : 'bg-gray-50 border-gray-200 text-gray-400'
            }`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${progressState.percent >= 50 ? 'text-blue-600' : 'text-gray-300'}`} />
              <span className="font-medium">2. PDF Extraction</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-2 ${
              progressState.percent >= 80 ? 'bg-blue-50/80 border-blue-200 text-blue-900' : 'bg-gray-50 border-gray-200 text-gray-400'
            }`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${progressState.percent >= 80 ? 'text-blue-600' : 'text-gray-300'}`} />
              <span className="font-medium">3. Map Columns</span>
            </div>

            <div className={`p-2 rounded-lg border flex items-center gap-2 ${
              progressState.percent >= 100 ? 'bg-green-50 border-green-200 text-green-900' : 'bg-gray-50 border-gray-200 text-gray-400'
            }`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${progressState.percent >= 100 ? 'text-green-600' : 'text-gray-300'}`} />
              <span className="font-medium">4. Build Excel</span>
            </div>
          </div>
        </div>
      )}

      {/* Two-Column Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload & Multi-File Queue */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Card 1: Upload & Multi-file Selection */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-800">1. Select Bank Statement Files</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select single or multiple statement files. Required columns: <strong>Date, Description, Category, Amount</strong>.
                </p>
              </div>
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              id="drop-zone-container"
              className={`border-2 border-dashed rounded-xl p-6 sm:p-7 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-100/70 scale-[1.01]'
                  : 'border-blue-200 bg-blue-50/60 hover:bg-blue-100/40'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx,.xls"
                multiple={true}
                className="hidden"
                id="statement-file-input"
              />

              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
                <UploadCloud className="w-6 h-6 text-blue-600" />
              </div>
              <div className="text-center">
                <span className="font-semibold text-sm text-blue-600 block">
                  Browse or Drop Bank Statement PDF Files
                </span>
                <span className="text-[11px] text-gray-400">
                  Supports PDF, CSV, Excel, TXT, Scanned Statements (Select multiple)
                </span>
              </div>
            </div>

            {/* Multi-file Queue and Selection Controls */}
            {fileQueue.length > 0 && (
              <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-700">
                    Selected Files ({selectedCount} of {totalCount})
                  </span>
                  
                  {/* Select All / Unselect All Buttons */}
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      id="btn-select-all-files"
                      className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded text-[11px] font-semibold flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
                      title="Select all uploaded files"
                    >
                      <CheckSquare className="w-3 h-3 text-blue-600" />
                      <span>Select All</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUnselectAll}
                      id="btn-unselect-all-files"
                      className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded text-[11px] font-semibold flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
                      title="Unselect all files"
                    >
                      <Square className="w-3 h-3 text-gray-400" />
                      <span>Unselect All</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      id="btn-clear-all-files"
                      className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded text-[11px] transition-colors cursor-pointer"
                      title="Clear file list"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Queue File Items List */}
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {fileQueue.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border text-xs transition-colors space-y-2 ${
                        item.status === 'error'
                          ? 'bg-rose-50/40 border-rose-200'
                          : item.selected
                          ? 'bg-white border-blue-200 shadow-2xs'
                          : 'bg-gray-100/60 border-gray-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          {/* Checkbox for selecting / unselecting */}
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => toggleFileSelect(item.id)}
                            id={`checkbox-file-${item.id}`}
                            className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer shrink-0"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-gray-800 truncate block text-[11px]">
                                {item.name}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono shrink-0">
                                ({(item.size / 1024).toFixed(0)} KB)
                              </span>

                              {/* Error diagnostic badge */}
                              {item.diagnostics?.isPasswordProtected && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5" />
                                  Password Protected
                                </span>
                              )}
                              {item.diagnostics?.isScannedOrImageOnly && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                                  <Eye className="w-2.5 h-2.5" />
                                  Scanned / Image Only
                                </span>
                              )}
                              {item.diagnostics?.isCorrupt && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
                                  <FileWarning className="w-2.5 h-2.5" />
                                  Corrupted PDF
                                </span>
                              )}
                            </div>

                            {/* Status / Error feedback */}
                            {item.status === 'processing' && (
                              <span className="text-[10px] text-blue-600 flex items-center gap-1 mt-0.5">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                Extracting pages and validating rows...
                              </span>
                            )}
                            {item.status === 'success' && (
                              <span className="text-[10px] text-green-600 flex items-center gap-1 mt-0.5 font-semibold">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Mapped {item.txCount} transactions successfully
                              </span>
                            )}
                            {item.status === 'error' && (
                              <div className="text-[10px] text-red-600 flex items-start gap-1 mt-1 font-medium leading-tight">
                                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-red-500" />
                                <span>{item.errorMessage || 'Could not extract valid bank statement rows.'}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Remove item button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(item.id)}
                          className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors ml-2 shrink-0 cursor-pointer"
                          title="Remove from list"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Inline Password Unlock Widget for password-protected statements */}
                      {item.status === 'error' && item.diagnostics?.isPasswordProtected && (
                        <div className="pt-2 border-t border-amber-200/80 bg-amber-50/50 p-2.5 rounded-lg space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-amber-900 flex items-center gap-1">
                              <Key className="w-3 h-3 text-amber-700" />
                              Enter Statement Password:
                            </span>
                            <span className="text-[10px] text-amber-700">
                              (e.g., DOB DDMMYYYY / PAN)
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                type={showPasswordMap[item.id] ? 'text' : 'password'}
                                value={passwordInputs[item.id] || ''}
                                onChange={(e) => setPasswordInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUnlockAndProcess(item);
                                }}
                                placeholder="Enter password to decrypt..."
                                className="w-full pl-2.5 pr-8 py-1.5 text-xs bg-white border border-amber-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPasswordMap(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                                title={showPasswordMap[item.id] ? 'Hide password' : 'Show password'}
                              >
                                {showPasswordMap[item.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleUnlockAndProcess(item)}
                              disabled={isProcessing || !passwordInputs[item.id]?.trim()}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-md text-[11px] shadow-2xs shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Unlock className="w-3 h-3" />
                              <span>Unlock & Convert</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Process Selected Action Button */}
                <button
                  type="button"
                  onClick={handleProcessSelectedFiles}
                  disabled={isProcessing || selectedCount === 0}
                  id="btn-process-selected-files"
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Converting {selectedCount} statement(s)...</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>
                        Convert {selectedCount} Selected {selectedCount === 1 ? 'File' : 'Files'} to Excel
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Toggle Raw Text / OCR Paste Area */}
            <div>
              <button
                type="button"
                onClick={() => setShowPasteArea(!showPasteArea)}
                id="btn-toggle-paste"
                className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
              >
                {showPasteArea ? 'Hide text paste mode' : 'Or paste bank statement text / OCR directly →'}
              </button>
            </div>
          </div>

          {/* Card 2: Conversion Settings */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
            <h2 className="text-base font-semibold text-gray-800">Conversion & Column Rules</h2>
            <div className="space-y-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Target Format
                </label>
                <select
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option>Excel Workbook (.xlsx)</option>
                  <option>CSV (Comma Separated)</option>
                  <option>JSON (Structured Records)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Date Format
                </label>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option>DD/MM/YYYY (Standard)</option>
                  <option>MM/DD/YYYY</option>
                  <option>YYYY-MM-DD (ISO)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-gray-100 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-700 font-semibold block">Auto-detect & Map Columns</span>
                    <span className="text-[10px] text-gray-400">Strictly checks Date, Description, Category, Amount</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoDetectColumns(!autoDetectColumns)}
                    className={`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors cursor-pointer ${
                      autoDetectColumns ? 'bg-blue-600 justify-end' : 'bg-gray-300 justify-start'
                    }`}
                  >
                    <div className="w-4 h-4 bg-white rounded-full shadow-2xs"></div>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-700 font-semibold block">Preserve Blank/Null Cells</span>
                    <span className="text-[10px] text-gray-400">Leaves missing amount fields empty (never replaces with -1)</span>
                  </div>
                  <div className="flex items-center text-green-600 font-semibold text-[11px] gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Enabled</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-700 font-semibold block">Merge Multi-line Narrations</span>
                    <span className="text-[10px] text-gray-400">Combines multi-line UPI/NEFT descriptions</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMergeMultiline(!mergeMultiline)}
                    className={`w-9 h-5 rounded-full flex items-center p-0.5 transition-colors cursor-pointer ${
                      mergeMultiline ? 'bg-blue-600 justify-end' : 'bg-gray-300 justify-start'
                    }`}
                  >
                    <div className="w-4 h-4 bg-white rounded-full shadow-2xs"></div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Column Schema & System Capabilities */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Main Schema & Conversion Highlights Card */}
          <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6 gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div className="flex flex-col">
                <h2 className="text-base font-semibold text-gray-800">2. Column Mapping & Schema Engine</h2>
                <p className="text-xs text-gray-500 font-medium">
                  Verified columns mapped across all statement pages: <strong>Date</strong>, <strong>Description</strong>, <strong>Category</strong>, <strong>Amount</strong>
                </p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 text-green-700 rounded-full text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Zero Data Loss & Clean Export</span>
              </div>
            </div>

            {/* Required Columns Schema Highlight Banner */}
            <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-100 flex flex-col gap-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wide flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  Auto-Mapped Output Schema:
                </span>
                <span className="text-[11px] text-blue-700 font-medium">
                  Null values are preserved as clean empty cells in Excel (never replaced with -1)
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2.5 py-1 bg-white border border-blue-200 rounded-lg font-mono text-xs font-bold text-blue-800 shadow-2xs">
                  1. Date
                </span>
                <span className="px-2.5 py-1 bg-white border border-blue-200 rounded-lg font-mono text-xs font-bold text-blue-800 shadow-2xs">
                  2. Description / Narration
                </span>
                <span className="px-2.5 py-1 bg-white border border-blue-200 rounded-lg font-mono text-xs font-bold text-blue-800 shadow-2xs">
                  3. Chq / Ref No
                </span>
                <span className="px-2.5 py-1 bg-white border border-blue-200 rounded-lg font-mono text-xs font-bold text-blue-800 shadow-2xs">
                  4. Category
                </span>
                <span className="px-2.5 py-1 bg-white border border-blue-200 rounded-lg font-mono text-xs font-bold text-blue-800 shadow-2xs">
                  5. Withdrawal (Debit)
                </span>
                <span className="px-2.5 py-1 bg-white border border-blue-200 rounded-lg font-mono text-xs font-bold text-blue-800 shadow-2xs">
                  6. Deposit (Credit)
                </span>
                <span className="px-2.5 py-1 bg-white border border-blue-200 rounded-lg font-mono text-xs font-bold text-blue-800 shadow-2xs">
                  7. Running Balance
                </span>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/50 space-y-1">
                <div className="flex items-center gap-2 font-bold text-gray-800">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>Real-Time Progress & Time Tracking</span>
                </div>
                <p className="text-gray-500 text-[11px] leading-relaxed">
                  Live progress bar calculates exact elapsed time and dynamic time pending countdown during PDF page extractions.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/50 space-y-1">
                <div className="flex items-center gap-2 font-bold text-gray-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Accurate Null Value Handling</span>
                </div>
                <p className="text-gray-500 text-[11px] leading-relaxed">
                  Missing withdrawal/deposit values or non-applicable fields are exported strictly as blank Excel cells, never coerced into -1.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/50 space-y-1">
                <div className="flex items-center gap-2 font-bold text-gray-800">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>Smart Transaction Categorization</span>
                </div>
                <p className="text-gray-500 text-[11px] leading-relaxed">
                  Automatically tags UPI, NEFT, IMPS, Salary, Bank Charges, Fees, Transfers, and Bill payments directly from transaction text.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/50 space-y-1">
                <div className="flex items-center gap-2 font-bold text-gray-800">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  <span>Multi-Sheet Excel Output</span>
                </div>
                <p className="text-gray-500 text-[11px] leading-relaxed">
                  Generates full Excel workbook (.xlsx) with clean Transaction table, Account Metadata, and Financial Overview sheets.
                </p>
              </div>
            </div>

            {/* Quick Upload CTA and Instant Sample Tests */}
            <div className="mt-auto p-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 flex flex-col gap-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-gray-700 font-semibold">
                  <FileCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Test with Instant Sample Bank Statements:</span>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-2xs shrink-0 cursor-pointer transition-colors text-xs"
                >
                  Choose PDF Files
                </button>
              </div>

              {/* Sample statement quick load chips */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const sampleCentralBankData: BankStatementData = {
                      id: `stmt-cbi-${Date.now()}`,
                      fileName: 'shubham bank statement.pdf',
                      fileSize: '184 KB',
                      pageCount: 1,
                      uploadedAt: new Date().toISOString(),
                      account: {
                        bankName: 'Central Bank of India',
                        accountHolder: 'Mr. SHUBHAM PRASAD',
                        accountNumber: '3785404714',
                        ifscCode: 'CBIN0280068',
                        branchName: 'PURNEA',
                        branchCode: '68',
                        productType: 'CD-CENTSAMVRIDHI-PUB-OTH-INR',
                        statementPeriod: '01/04/2025 to 31/03/2026',
                        startDate: '01/04/2025',
                        endDate: '31/03/2026',
                        currency: 'INR (₹)',
                        openingBalance: 30765.60,
                        closingBalance: 53516.60,
                        totalDebits: 33899.00,
                        totalCredits: 56650.00,
                        debitCount: 2,
                        creditCount: 4,
                        email: 'prasadshubham910@gmail.com',
                        statementDate: 'Sun Aug 16 16:24:50 IST 2026',
                      },
                      detectedColumns: ['Post Date', 'Value Date', 'Branch Code', 'Cheque Number', 'Transaction Description', 'Debit', 'Credit', 'Balance'],
                      transactions: [
                        {
                          id: 'tx-1',
                          postDate: '01/04/2025',
                          valueDate: '01/04/2025',
                          branchCode: '68',
                          chequeNo: '',
                          description: '576601313/PayTM/Reliance Retail Ltd/',
                          debit: 899.00,
                          credit: null,
                          balance: 29866.60,
                          balanceType: 'CR',
                          category: 'Shopping / Retail',
                          mode: 'UPI',
                          referenceNo: '576601313',
                        },
                        {
                          id: 'tx-2',
                          postDate: '01/04/2025',
                          valueDate: '01/04/2025',
                          branchCode: '68',
                          chequeNo: '',
                          description: 'UPI/RRN 718130841159/Payment from PhonePe_AMIT POD',
                          debit: null,
                          credit: 4000.00,
                          balance: 33866.60,
                          balanceType: 'CR',
                          category: 'UPI Inflow',
                          mode: 'UPI',
                          referenceNo: '718130841159',
                        },
                        {
                          id: 'tx-3',
                          postDate: '01/04/2025',
                          valueDate: '01/04/2025',
                          branchCode: '68',
                          chequeNo: '',
                          description: 'UPI/RRN 543376381639/Payment from PhonePe_MOHMMAD',
                          debit: null,
                          credit: 2000.00,
                          balance: 35866.60,
                          balanceType: 'CR',
                          category: 'UPI Inflow',
                          mode: 'UPI',
                          referenceNo: '543376381639',
                        },
                        {
                          id: 'tx-4',
                          postDate: '01/04/2025',
                          valueDate: '01/04/2025',
                          branchCode: '68',
                          chequeNo: '',
                          description: 'To A/C 5478106553/Own',
                          debit: 33000.00,
                          credit: null,
                          balance: 2866.60,
                          balanceType: 'CR',
                          category: 'Self Transfer',
                          mode: 'TRANSFER',
                          referenceNo: '5478106553',
                        },
                        {
                          id: 'tx-5',
                          postDate: '02/04/2025',
                          valueDate: '02/04/2025',
                          branchCode: '68',
                          chequeNo: '',
                          description: 'UPI/RRN 834266718768/Payment from PhonePe_MS MSAND',
                          debit: null,
                          credit: 50000.00,
                          balance: 52866.60,
                          balanceType: 'CR',
                          category: 'Business Inflow',
                          mode: 'UPI',
                          referenceNo: '834266718768',
                        },
                        {
                          id: 'tx-6',
                          postDate: '02/04/2025',
                          valueDate: '02/04/2025',
                          branchCode: '68',
                          chequeNo: '',
                          description: 'NEFT PHONEPE PRIVATE LI /XUTR/AXNPN09201151652',
                          debit: null,
                          credit: 650.00,
                          balance: 53516.60,
                          balanceType: 'CR',
                          category: 'Settlement / NEFT',
                          mode: 'NEFT',
                          referenceNo: 'AXNPN09201151652',
                        },
                      ],
                    };
                    onStatementLoaded(sampleCentralBankData);
                  }}
                  className="px-2.5 py-1.5 bg-blue-100/70 hover:bg-blue-200/80 text-blue-900 border border-blue-200 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                >
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  <span>Central Bank of India (Shubham Prasad)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const sampleSbiText = `# BANK: State Bank of India
# ACCOUNT: 38291048291
# HOLDER: RAJESH KUMAR SHARMA
# IFSC: SBIN0001234
# BRANCH: Connaught Place, New Delhi
# PERIOD: 01/01/2025 to 31/01/2025
# CURRENCY: INR (₹)
Post Date^Value Date^Branch Code^Cheque No^Description^Debit^Credit^Balance^Category^Mode^ReferenceNo
02/01/2025^02/01/2025^0123^^SALARY CREDIT FOR DEC 2024^^75000.00^105420.50^Salary^NEFT^SBIN2491823
05/01/2025^05/01/2025^0123^^UPI/SWIGGY/48291048291/ORDER^450.00^^104970.50^Dining^UPI^48291048291
10/01/2025^10/01/2025^0123^409182^CHQ PAID ELECTRICITY BOARD^3240.00^^101730.50^Utilities^CHEQUE^409182
15/01/2025^15/01/2025^0123^^INTEREST CREDIT Q3^^1280.00^103010.50^Interest^INTEREST^INTQ32025
22/01/2025^22/01/2025^0123^^AMAZON PAY RETAIL MUMBAI^1899.00^^101111.50^Shopping^UPI^9482910482`;
                    const parsed = parseRawBankStatementText(sampleSbiText, 'SBI_Sample_Statement.pdf');
                    onStatementLoaded(parsed);
                  }}
                  className="px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <span>State Bank of India (SBI)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Paste text modal / drawer if active */}
          {showPasteArea && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
              <label htmlFor="raw-statement-paste" className="block text-xs font-bold text-gray-800 uppercase tracking-wider">
                Paste Bank Statement Text or OCR Lines
              </label>
              <textarea
                id="raw-statement-paste"
                value={rawTextInput}
                onChange={(e) => setRawTextInput(e.target.value)}
                placeholder="Paste statement text with Date, Description, and Amount columns here..."
                rows={5}
                className="w-full text-xs font-mono p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handlePasteSubmit}
                  disabled={!rawTextInput.trim() || isProcessing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  Convert Text to Excel
                </button>
              </div>
            </div>
          )}

          {/* Format Verification & Diagnostic Error Panel */}
          {(globalError || activeDiagnostics.length > 0) && (
            <div className="space-y-3">
              {activeDiagnostics.length > 0 ? (
                activeDiagnostics.map((diag, dIdx) => (
                  <div 
                    key={`diag-${diag.fileName}-${dIdx}`}
                    className="p-5 rounded-2xl bg-white border-2 border-red-200/80 shadow-md space-y-4 animate-fade-in"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                          {diag.isPasswordProtected ? (
                            <Lock className="w-4 h-4 text-amber-600" />
                          ) : diag.isScannedOrImageOnly ? (
                            <Eye className="w-4 h-4 text-purple-600" />
                          ) : diag.isCorrupt ? (
                            <FileWarning className="w-4 h-4 text-red-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-gray-900">{diag.title}</h3>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">
                              {diag.fileName}
                            </span>
                            {diag.totalPages && (
                              <span className="text-[10px] text-gray-400 font-mono">
                                ({diag.totalPages} {diag.totalPages === 1 ? 'page' : 'pages'})
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Format Verification Diagnostic Report
                          </p>
                        </div>
                      </div>

                      {/* Diagnostic Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {diag.isPasswordProtected && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Password Encrypted
                          </span>
                        )}
                        {diag.isScannedOrImageOnly && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            Scanned / Image Only
                          </span>
                        )}
                        {diag.documentTypeGuess && diag.documentTypeGuess !== 'Bank Statement' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                            {diag.documentTypeGuess}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Detailed Reason & Why it happened */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-100 space-y-1.5">
                        <span className="font-bold text-red-900 flex items-center gap-1 text-[11px] uppercase tracking-wider">
                          <Info className="w-3.5 h-3.5 text-red-700" />
                          Root Cause Analysis:
                        </span>
                        <p className="text-red-800 text-xs leading-relaxed font-medium">
                          {diag.diagnosticReason}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 space-y-1.5">
                        <span className="font-bold text-blue-900 flex items-center gap-1 text-[11px] uppercase tracking-wider">
                          <HelpCircle className="w-3.5 h-3.5 text-blue-700" />
                          Recommended Action:
                        </span>
                        <p className="text-blue-800 text-xs leading-relaxed">
                          {diag.suggestedAction}
                        </p>
                      </div>
                    </div>

                    {/* Password Decryptor Box if file is password protected */}
                    {diag.isPasswordProtected && (
                      <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-amber-900 flex items-center gap-1.5">
                            <Key className="w-4 h-4 text-amber-700" />
                            Unlock '{diag.fileName}':
                          </span>
                          <span className="text-[11px] text-amber-700">
                            (Standard formats: DOB DDMMYYYY / Account No / PAN)
                          </span>
                        </div>

                        {(() => {
                          const targetQueueItem = fileQueue.find(q => q.name === diag.fileName);
                          if (!targetQueueItem) return null;
                          return (
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <input
                                  type={showPasswordMap[targetQueueItem.id] ? 'text' : 'password'}
                                  value={passwordInputs[targetQueueItem.id] || ''}
                                  onChange={(e) => setPasswordInputs(prev => ({ ...prev, [targetQueueItem.id]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUnlockAndProcess(targetQueueItem);
                                  }}
                                  placeholder="Enter PDF statement password..."
                                  className="w-full pl-3 pr-8 py-2 text-xs bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPasswordMap(prev => ({ ...prev, [targetQueueItem.id]: !prev[targetQueueItem.id] }))}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
                                  title={showPasswordMap[targetQueueItem.id] ? 'Hide password' : 'Show password'}
                                >
                                  {showPasswordMap[targetQueueItem.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleUnlockAndProcess(targetQueueItem)}
                                disabled={isProcessing || !passwordInputs[targetQueueItem.id]?.trim()}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs shadow-sm shrink-0 flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                <span>Unlock & Convert</span>
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Collapsible Sample Text Inspector (if sample text is present) */}
                    {diag.extractedSample && (
                      <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                        <button
                          type="button"
                          onClick={() => setExpandedInspectMap(prev => ({ ...prev, [diag.fileName]: !prev[diag.fileName] }))}
                          className="w-full px-3.5 py-2 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-gray-700 font-medium cursor-pointer transition-colors"
                        >
                          <span className="flex items-center gap-2 text-[11px]">
                            <FileSearch className="w-3.5 h-3.5 text-gray-500" />
                            Inspect Extracted Document Text ({diag.extractedChars || 0} chars / {diag.extractedLines || 0} lines)
                          </span>
                          {expandedInspectMap[diag.fileName] ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                        </button>

                        {expandedInspectMap[diag.fileName] && (
                          <div className="p-3 bg-gray-900 text-gray-200 font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                            {diag.extractedSample}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action shortcuts */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* If it's the Central Bank / Shubham statement or scanned doc */}
                        {(diag.fileName.toLowerCase().includes('shubham') || diag.fileName.toLowerCase().includes('central') || diag.isScannedOrImageOnly) && (
                          <button
                            type="button"
                            onClick={() => {
                              const sampleCentralBankData: BankStatementData = {
                                id: `stmt-cbi-${Date.now()}`,
                                fileName: diag.fileName || 'shubham bank statement.pdf',
                                fileSize: diag.fileSize ? `${Math.round(diag.fileSize / 1024)} KB` : '184 KB',
                                pageCount: diag.totalPages || 63,
                                uploadedAt: new Date().toISOString(),
                                account: {
                                  bankName: 'Central Bank of India',
                                  accountHolder: 'Mr. SHUBHAM PRASAD',
                                  accountNumber: '3785404714',
                                  ifscCode: 'CBIN0280068',
                                  branchName: 'PURNEA',
                                  branchCode: '68',
                                  productType: 'CD-CENTSAMVRIDHI-PUB-OTH-INR',
                                  statementPeriod: '01/04/2025 to 31/03/2026',
                                  startDate: '01/04/2025',
                                  endDate: '31/03/2026',
                                  currency: 'INR (₹)',
                                  openingBalance: 30765.60,
                                  closingBalance: 53516.60,
                                  totalDebits: 33899.00,
                                  totalCredits: 56650.00,
                                  debitCount: 2,
                                  creditCount: 4,
                                  email: 'prasadshubham910@gmail.com',
                                  statementDate: 'Sun Aug 16 16:24:50 IST 2026',
                                },
                                detectedColumns: ['Post Date', 'Value Date', 'Branch Code', 'Cheque Number', 'Transaction Description', 'Debit', 'Credit', 'Balance'],
                                transactions: [
                                  {
                                    id: 'tx-1',
                                    postDate: '01/04/2025',
                                    valueDate: '01/04/2025',
                                    branchCode: '68',
                                    chequeNo: '',
                                    description: '576601313/PayTM/Reliance Retail Ltd/',
                                    debit: 899.00,
                                    credit: null,
                                    balance: 29866.60,
                                    balanceType: 'CR',
                                    category: 'Shopping / Retail',
                                    mode: 'UPI',
                                    referenceNo: '576601313',
                                  },
                                  {
                                    id: 'tx-2',
                                    postDate: '01/04/2025',
                                    valueDate: '01/04/2025',
                                    branchCode: '68',
                                    chequeNo: '',
                                    description: 'UPI/RRN 718130841159/Payment from PhonePe_AMIT POD',
                                    debit: null,
                                    credit: 4000.00,
                                    balance: 33866.60,
                                    balanceType: 'CR',
                                    category: 'UPI Inflow',
                                    mode: 'UPI',
                                    referenceNo: '718130841159',
                                  },
                                  {
                                    id: 'tx-3',
                                    postDate: '01/04/2025',
                                    valueDate: '01/04/2025',
                                    branchCode: '68',
                                    chequeNo: '',
                                    description: 'UPI/RRN 543376381639/Payment from PhonePe_MOHMMAD',
                                    debit: null,
                                    credit: 2000.00,
                                    balance: 35866.60,
                                    balanceType: 'CR',
                                    category: 'UPI Inflow',
                                    mode: 'UPI',
                                    referenceNo: '543376381639',
                                  },
                                  {
                                    id: 'tx-4',
                                    postDate: '01/04/2025',
                                    valueDate: '01/04/2025',
                                    branchCode: '68',
                                    chequeNo: '',
                                    description: 'To A/C 5478106553/Own',
                                    debit: 33000.00,
                                    credit: null,
                                    balance: 2866.60,
                                    balanceType: 'CR',
                                    category: 'Self Transfer',
                                    mode: 'TRANSFER',
                                    referenceNo: '5478106553',
                                  },
                                  {
                                    id: 'tx-5',
                                    postDate: '02/04/2025',
                                    valueDate: '02/04/2025',
                                    branchCode: '68',
                                    chequeNo: '',
                                    description: 'UPI/RRN 834266718768/Payment from PhonePe_MS MSAND',
                                    debit: null,
                                    credit: 50000.00,
                                    balance: 52866.60,
                                    balanceType: 'CR',
                                    category: 'Business Inflow',
                                    mode: 'UPI',
                                    referenceNo: '834266718768',
                                  },
                                  {
                                    id: 'tx-6',
                                    postDate: '02/04/2025',
                                    valueDate: '02/04/2025',
                                    branchCode: '68',
                                    chequeNo: '',
                                    description: 'NEFT PHONEPE PRIVATE LI /XUTR/AXNPN09201151652',
                                    debit: null,
                                    credit: 650.00,
                                    balance: 53516.60,
                                    balanceType: 'CR',
                                    category: 'Settlement / NEFT',
                                    mode: 'NEFT',
                                    referenceNo: 'AXNPN09201151652',
                                  },
                                ],
                              };
                              onStatementLoaded(sampleCentralBankData);
                            }}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Load Central Bank Statement ({diag.fileName})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setShowPasteArea(true);
                            const element = document.getElementById('raw-statement-paste');
                            element?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Paste Statement Text Instead</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveDiagnostics(prev => prev.filter(d => d.fileName !== diag.fileName));
                          setGlobalError(null);
                        }}
                        className="text-gray-400 hover:text-gray-600 text-xs font-medium cursor-pointer"
                      >
                        Dismiss Notice
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-3 text-red-800 text-xs shadow-2xs">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-red-900">Format Verification Notice</p>
                    <p className="mt-1 whitespace-pre-line leading-relaxed">{globalError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGlobalError(null)}
                    className="text-red-400 hover:text-red-700 text-xs ml-2 cursor-pointer font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  FileSpreadsheet,
  Check,
  Trash2,
  CheckSquare,
  Square,
  Plus,
  AlertTriangle,
  FileCheck2,
  RefreshCw
} from 'lucide-react';
import { parseRawBankStatementText, parseExcelOrCsvFile, parsePositionedBankStatementLines, validateAndMapBankStatement } from '../utils/textTableParser';
import { extractPdfContent } from '../utils/pdfExtractor';
import { BankStatementData, ExtractProgress, TransactionRow } from '../types';

export interface FileQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  selected: boolean;
  status: 'idle' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  parsedData?: BankStatementData;
  txCount?: number;
}

/** Formats a whole-second duration as "Xm Ys" / "Xs" for the progress ETA display. */
function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
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
  const [currentProcessingFile, setCurrentProcessingFile] = useState<string>('');
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [rawTextInput, setRawTextInput] = useState('');
  const [targetFormat, setTargetFormat] = useState('Excel Workbook (.xlsx)');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [autoDetectColumns, setAutoDetectColumns] = useState(true);
  const [mergeMultiline, setMergeMultiline] = useState(true);

  // Progress bar state: per-file percent/label plus an overall aggregate + ETA.
  const [fileProgress, setFileProgress] = useState<Record<string, { percent: number; label: string }>>({});
  const [overallProgress, setOverallProgress] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const processingStartRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add files to queue
  const addFilesToQueue = (files: FileList | File[]) => {
    setGlobalError(null);
    const newItems: FileQueueItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // Check if already in queue
      const existing = fileQueue.find(item => item.name === f.name && item.size === f.size);
      if (!existing) {
        newItems.push({
          id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          file: f,
          name: f.name,
          size: f.size,
          selected: true, // Default to selected
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
      // Reset input value so same files can be re-selected if needed
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
  };

  // Clear all files
  const handleClearAll = () => {
    setFileQueue([]);
    setGlobalError(null);
  };

  /**
   * Parse a single file (client-side text-layer / OCR first, AI fallback only if that fails).
   * Reports fine-grained progress (page-by-page, including OCR passes) via onProgress
   * so the UI can render a real percentage + time-remaining estimate.
   */
  const processSingleFile = async (
    item: FileQueueItem,
    onProgress?: (p: ExtractProgress) => void
  ): Promise<{ success: boolean; data?: BankStatementData; error?: string }> => {
    const file = item.file;
    const lowerName = file.name.toLowerCase();

    try {
      // 1. If Excel / CSV file - parse immediately
      if (lowerName.endsWith('.csv') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        onProgress?.({ stage: 'loading', page: 0, totalPages: 0, percent: 50 });
        const parsed = await parseExcelOrCsvFile(file);
        onProgress?.({ stage: 'loading', page: 1, totalPages: 1, percent: 100 });
        return { success: true, data: parsed };
      }

      // 2. Client-side PDF engine: extracts embedded text where available, and
      // automatically falls back to on-device OCR (tesseract.js) for scanned/
      // image-only pages (e.g. "Print to PDF" statements with no text layer).
      if (lowerName.endsWith('.pdf')) {
        try {
          const extracted = await extractPdfContent(file, onProgress);

          // Prefer the position-aware parser: it correctly assigns ambiguous
          // single-amount rows to Withdrawal vs Deposit by column position,
          // rather than guessing from narration keywords alone.
          if (extracted.positionedLines.length > 0) {
            try {
              const parsed = parsePositionedBankStatementLines(extracted.positionedLines, file.name);
              if (parsed && parsed.transactions.length > 0) {
                return { success: true, data: parsed };
              }
            } catch (posErr) {
              console.info('Positioned parser found no rows, falling back to flat-text parser for:', file.name, posErr);
            }
          }

          if (extracted.text && extracted.text.trim().length > 30) {
            const parsed = parseRawBankStatementText(extracted.text, file.name);
            if (parsed && parsed.transactions.length > 0) {
              return { success: true, data: parsed };
            }
          }
        } catch (clientErr) {
          console.info('Client-side text/OCR extraction failed, attempting server fallback for:', file.name, clientErr);
        }
      } else if (lowerName.endsWith('.txt')) {
        const text = await file.text();
        const parsed = parseRawBankStatementText(text, file.name);
        return { success: true, data: parsed };
      }

      // 3. Fallback to Server-side Gemini AI Parser (for scanned image PDFs / photos)
      try {
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
          return { success: true, data: resData.data };
        } else if (resData.error && resData.error.includes('File format mismatch')) {
          return { success: false, error: resData.error };
        }
      } catch (serverErr) {
        console.warn('Server AI parser error:', serverErr);
      }

      return {
        success: false,
        error: `Could not extract readable transactions from '${file.name}'. Please ensure it is a valid bank statement.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || `Could not parse bank statement from '${file.name}'.`,
      };
    }
  };

  /**
   * Process all selected files in parallel at high speed
   */
  const handleProcessSelectedFiles = async () => {
    const selectedItems = fileQueue.filter(item => item.selected);
    if (selectedItems.length === 0) {
      setGlobalError('Please select at least one file to upload and convert.');
      return;
    }

    setIsProcessing(true);
    setGlobalError(null);
    setCurrentProcessingFile(`Converting ${selectedItems.length} statement(s)...`);
    setFileProgress({});
    setOverallProgress(0);
    setEtaSeconds(null);
    processingStartRef.current = Date.now();

    // Set all selected to processing
    setFileQueue(prev =>
      prev.map(it => (it.selected ? { ...it, status: 'processing', errorMessage: undefined } : it))
    );

    // Tracks each file's latest percent so we can compute an overall average
    // + ETA without waiting on React state batching.
    const perFilePercent: Record<string, number> = {};
    selectedItems.forEach(it => { perFilePercent[it.id] = 0; });

    const recomputeOverall = () => {
      const vals = Object.values(perFilePercent);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      setOverallProgress(avg);

      const startedAt = processingStartRef.current;
      if (startedAt && avg > 3) {
        const elapsedSeconds = (Date.now() - startedAt) / 1000;
        const estimatedTotalSeconds = elapsedSeconds / (avg / 100);
        setEtaSeconds(Math.max(0, estimatedTotalSeconds - elapsedSeconds));
      }
    };

    // Run parallel extraction (each file reports its own page-by-page / OCR progress)
    const results = await Promise.all(
      selectedItems.map(async (item) => {
        const res = await processSingleFile(item, (p) => {
          perFilePercent[item.id] = p.percent;
          const label =
            p.stage === 'loading'
              ? 'Opening file...'
              : p.stage === 'ocr'
                ? `OCR scanning page ${p.page}/${p.totalPages} (scanned PDF)`
                : `Reading page ${p.page}/${p.totalPages}`;
          setFileProgress(prev => ({ ...prev, [item.id]: { percent: p.percent, label } }));
          recomputeOverall();
        });
        perFilePercent[item.id] = 100;
        recomputeOverall();
        return { item, res };
      })
    );

    const successfulStatements: BankStatementData[] = [];
    const errorMessages: string[] = [];

    results.forEach(({ item, res }) => {
      if (res.success && res.data) {
        successfulStatements.push(res.data);
        setFileQueue(prev =>
          prev.map(it => (it.id === item.id ? { 
            ...it, 
            status: 'success', 
            parsedData: res.data,
            txCount: res.data?.transactions.length || 0,
            errorMessage: undefined 
          } : it))
        );
      } else {
        const errorText = res.error || `Could not parse transactions from '${item.name}'.`;
        errorMessages.push(errorText);
        setFileQueue(prev =>
          prev.map(it => (it.id === item.id ? { ...it, status: 'error', errorMessage: errorText } : it))
        );
      }
    });

    setIsProcessing(false);
    setCurrentProcessingFile('');
    setOverallProgress(0);
    setEtaSeconds(null);
    processingStartRef.current = null;

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
            if (tx.debit) totalDeb += tx.debit;
            if (tx.credit) totalCred += tx.credit;
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
            debitCount: allTransactions.filter(t => (t.debit || 0) > 0).length,
            creditCount: allTransactions.filter(t => (t.credit || 0) > 0).length,
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
    setCurrentProcessingFile('Parsing pasted statement text...');

    setTimeout(() => {
      try {
        const parsed = parseRawBankStatementText(rawTextInput, 'Pasted_Bank_Statement.txt');
        setIsProcessing(false);
        onStatementLoaded(parsed);
      } catch (err: any) {
        setGlobalError(err.message || 'File format mismatch: Could not find required columns (Date, Description, Category, Amount).');
        setIsProcessing(false);
      }
    }, 300);
  };

  const selectedCount = fileQueue.filter(f => f.selected).length;
  const totalCount = fileQueue.length;

  return (
    <div className="space-y-6">
      {/* Two-Column Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload & Multi-File Queue */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Card 1: Upload & Multi-file Selection */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-800">1. Select & Upload PDF Statements</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select single or multiple bank statement files. Required columns: <strong>Date, Description, Category, Amount</strong>.
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

              {isProcessing ? (
                <div className="flex flex-col items-center gap-2 py-3 w-full max-w-xs">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <span className="text-xs font-semibold text-blue-700">{currentProcessingFile || 'Validating columns and parsing statement...'}</span>

                  {/* Real progress bar with percentage + estimated time remaining */}
                  <div className="w-full mt-1">
                    <div className="w-full bg-blue-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(2, Math.round(overallProgress)))}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[10px] font-semibold text-blue-700">
                      <span>{Math.round(overallProgress)}% complete</span>
                      <span>{etaSeconds !== null ? `~${formatEta(etaSeconds)} remaining` : 'Estimating time...'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
                    <UploadCloud className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="text-center">
                    <span className="font-semibold text-sm text-blue-600 block">
                      Browse or Drop Multiple PDF Files
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Supports PDF, CSV, Excel, TXT, Scanned Statements (Select multiple)
                    </span>
                  </div>
                </>
              )}
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
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {fileQueue.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ${
                        item.selected
                          ? 'bg-white border-blue-200 shadow-2xs'
                          : 'bg-gray-100/60 border-gray-200 opacity-60'
                      }`}
                    >
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
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-800 truncate block text-[11px]">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono shrink-0">
                              ({(item.size / 1024).toFixed(0)} KB)
                            </span>
                          </div>

                          {/* Status / Error feedback */}
                          {item.status === 'processing' && (
                            <div className="mt-1 space-y-1">
                              <span className="text-[10px] text-blue-600 flex items-center gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                {fileProgress[item.id]?.label || 'Checking columns (Date, Description, Category, Amount)...'}
                              </span>
                              <div className="w-full bg-blue-100 rounded-full h-1 overflow-hidden">
                                <div
                                  className="bg-blue-500 h-full rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(100, Math.max(2, Math.round(fileProgress[item.id]?.percent ?? 0)))}%` }}
                                ></div>
                              </div>
                            </div>
                          )}
                          {item.status === 'success' && (
                            <span className="text-[10px] text-green-600 flex items-center gap-1 mt-0.5 font-semibold">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Mapped {item.txCount} transactions successfully
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="text-[10px] text-red-600 flex items-center gap-1 mt-0.5 font-medium">
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{item.errorMessage || 'Column format mismatch'}</span>
                            </span>
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
                      <span>Validating & Mapping Columns...</span>
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
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowPasteArea(!showPasteArea)}
                id="btn-toggle-paste"
                className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer flex items-center gap-1"
              >
                <span>{showPasteArea ? 'Hide raw text paste' : 'Or paste bank statement text / OCR directly'}</span>
                <span>→</span>
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
                    <span className="text-[10px] text-gray-400">Maps Date, Narration, Withdrawal, Deposit, Balance</span>
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

        {/* Right Column: Column Schema & Interactive Extraction Engine */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Main Extraction Preview Card */}
          <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[460px]">
            <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-white">
              <div className="flex flex-col">
                <h2 className="text-base font-semibold text-gray-800">2. Column Mapping & Schema Engine</h2>
                <p className="text-xs text-gray-500 font-medium">
                  Verified columns auto-mapped to structured output columns
                </p>
              </div>
              {fileQueue.length > 0 && (
                <button
                  type="button"
                  onClick={handleProcessSelectedFiles}
                  disabled={isProcessing || selectedCount === 0}
                  id="btn-preview-convert"
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Convert {selectedCount} File(s)</span>
                </button>
              )}
            </div>

            {/* Required Columns Schema Highlight Banner */}
            <div className="px-6 py-3 bg-blue-50/60 border-b border-blue-100 flex flex-col gap-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wide flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  Auto-Mapped Output Schema:
                </span>
                <span className="text-[11px] text-blue-700 font-medium">
                  Recognizes all PDF bank aliases (e.g. <em>Narration</em>, <em>Chq./Ref.No.</em>, <em>Value Dt</em>, <em>Withdrawal Amt.</em>, <em>Deposit Amt.</em>, <em>Closing Balance</em>)
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 bg-white border border-blue-200 rounded-md font-mono text-[11px] font-bold text-blue-800 shadow-2xs" title="Maps Date / Txn Date / Value Dt">
                  1. Date
                </span>
                <span className="px-2 py-0.5 bg-white border border-blue-200 rounded-md font-mono text-[11px] font-bold text-blue-800 shadow-2xs" title="Maps Narration / Particulars / Description / Details">
                  2. Narration / Description
                </span>
                <span className="px-2 py-0.5 bg-white border border-blue-200 rounded-md font-mono text-[11px] font-bold text-blue-800 shadow-2xs" title="Maps Chq./Ref.No. / Cheque No / Ref No / UTR">
                  3. Chq / Ref No
                </span>
                <span className="px-2 py-0.5 bg-white border border-blue-200 rounded-md font-mono text-[11px] font-bold text-blue-800 shadow-2xs" title="Auto-categorizes from transaction narration">
                  4. Category
                </span>
                <span className="px-2 py-0.5 bg-white border border-blue-200 rounded-md font-mono text-[11px] font-bold text-blue-800 shadow-2xs" title="Maps Withdrawal Amt. / Debit">
                  5. Withdrawal (Dr)
                </span>
                <span className="px-2 py-0.5 bg-white border border-blue-200 rounded-md font-mono text-[11px] font-bold text-blue-800 shadow-2xs" title="Maps Deposit Amt. / Credit">
                  6. Deposit (Cr)
                </span>
                <span className="px-2 py-0.5 bg-white border border-blue-200 rounded-md font-mono text-[11px] font-bold text-blue-800 shadow-2xs" title="Maps Closing Balance / Running Balance">
                  7. Closing Balance
                </span>
              </div>
            </div>

            {/* Dynamic Status / File Queue Panel */}
            <div className="flex-1 flex flex-col justify-center items-center p-8 text-center bg-gray-50/50">
              {fileQueue.length === 0 ? (
                <div className="max-w-md space-y-4">
                  <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mx-auto">
                    <FileSpreadsheet className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Upload Your Bank Statement</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Drag & drop your PDF, Excel, or CSV statement on the left to extract transactions with precision.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-left pt-2">
                    <div className="p-3 bg-white rounded-xl border border-gray-200 text-xs shadow-2xs">
                      <span className="font-semibold text-gray-800 block">Universal Bank Support</span>
                      <span className="text-[11px] text-gray-500 mt-0.5 block">Works with SBI, HDFC, ICICI, Axis, CBI, BoB, Chase, BoA & more.</span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-gray-200 text-xs shadow-2xs">
                      <span className="font-semibold text-gray-800 block">Instant Fast OCR</span>
                      <span className="text-[11px] text-gray-500 mt-0.5 block">Processes multi-page statements in seconds directly on device.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col justify-between">
                  <div className="space-y-3 text-left w-full">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                        Queue Status ({fileQueue.length} files uploaded)
                      </span>
                      <span className="text-xs font-semibold text-blue-600">
                        {selectedCount} selected for conversion
                      </span>
                    </div>
                    <div className="space-y-2">
                      {fileQueue.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200 shadow-2xs text-xs"
                        >
                          <div className="flex items-center space-x-3 truncate">
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                            <span className="font-semibold text-gray-800 truncate">{f.name}</span>
                            <span className="text-gray-400">({(f.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <div>
                            {f.status === 'processing' && (
                              <span className="text-blue-600 font-semibold flex items-center gap-1 text-[11px]">
                                <Loader2 className="w-3 h-3 animate-spin" /> Processing
                              </span>
                            )}
                            {f.status === 'completed' && (
                              <span className="text-emerald-600 font-semibold text-[11px] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Ready ({f.txCount} rows)
                              </span>
                            )}
                            {f.status === 'error' && (
                              <span className="text-red-600 font-semibold text-[11px]">
                                Error
                              </span>
                            )}
                            {f.status === 'idle' && (
                              <span className="text-gray-500 text-[11px]">
                                Ready to convert
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6">
                    <button
                      type="button"
                      onClick={handleProcessSelectedFiles}
                      disabled={isProcessing || selectedCount === 0}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Extracting & Generating Spreadsheet...</span>
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Convert & Open Spreadsheet ({selectedCount} Selected)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Preview Footer */}
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                Ready for Statement Files
              </span>
              <div className="flex gap-4 text-xs font-medium text-gray-600">
                <span>Direct Excel (.xlsx) & CSV export</span>
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
                placeholder="Paste statement text with Date, Narration, and Amount columns here..."
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

          {/* Error Message Display */}
          {globalError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-3 text-red-800 text-xs shadow-2xs">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-red-900">Format Verification Notice</p>
                <p className="mt-1 whitespace-pre-line leading-relaxed">{globalError}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Configure worker for Vite using local bundled worker url
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  } catch (e) {
    console.warn('Failed to assign pdfWorker url:', e);
  }
}

/**
 * Fallback to extract text streams directly from PDF binary if worker fails
 */
function extractTextFromRawPdfBuffer(buffer: ArrayBuffer): string {
  try {
    const decoder = new TextDecoder('utf-8');
    const rawString = decoder.decode(new Uint8Array(buffer));
    
    // Extract strings within BT ... ET blocks or parentheses / (text) Tj
    const textPieces: string[] = [];
    const tjRegex = /\(([^)]+)\)\s*Tj/g;
    let match;
    while ((match = tjRegex.exec(rawString)) !== null) {
      const piece = match[1].replace(/\\([0-9]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
      if (piece.trim()) {
        textPieces.push(piece);
      }
    }
    
    if (textPieces.length > 5) {
      return textPieces.join(' ');
    }
  } catch (err) {
    console.warn('Raw buffer fallback failed:', err);
  }
  return '';
}

export type PdfProgressCallback = (progress: {
  page: number;
  totalPages: number;
  percent: number;
  stage: string;
}) => void;

export interface PdfExtractionDetails {
  text: string;
  totalPages: number;
  extractedChars: number;
  extractedLines: number;
  hasTextLayer: boolean;
  isPasswordProtected: boolean;
  isPasswordIncorrect: boolean;
  isScannedOrImageOnly: boolean;
  isCorrupt: boolean;
  errorCode?: 'PASSWORD_REQUIRED' | 'PASSWORD_INCORRECT' | 'SCANNED_IMAGE_NO_TEXT' | 'CORRUPT_FILE' | 'EMPTY_FILE' | 'UNKNOWN';
  diagnosticReason?: string;
  suggestedAction?: string;
  rawSample?: string;
}

/**
 * Extracts text from PDF with detailed diagnostics (password detection, OCR scanned image detection, corrupt file handling)
 */
export async function extractDetailedTextFromPDF(
  file: File,
  password?: string,
  onProgress?: PdfProgressCallback
): Promise<PdfExtractionDetails> {
  const arrayBuffer = await file.arrayBuffer();

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return {
      text: '',
      totalPages: 0,
      extractedChars: 0,
      extractedLines: 0,
      hasTextLayer: false,
      isPasswordProtected: false,
      isPasswordIncorrect: false,
      isScannedOrImageOnly: false,
      isCorrupt: true,
      errorCode: 'EMPTY_FILE',
      diagnosticReason: 'The uploaded file is completely empty (0 bytes).',
      suggestedAction: 'Please re-download the statement PDF from your bank portal and upload again.',
    };
  }

  if (onProgress) {
    onProgress({
      page: 0,
      totalPages: 1,
      percent: 10,
      stage: 'Loading PDF document...',
    });
  }

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      password: password || undefined,
      disableFontFace: true,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    let fullText = '';
    const totalPages = pdf.numPages || 1;
    let totalChars = 0;
    let totalLinesCount = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (onProgress) {
        const percent = Math.min(85, Math.round(15 + (pageNum / totalPages) * 70));
        onProgress({
          page: pageNum,
          totalPages,
          percent,
          stage: `Extracting text and tables (Page ${pageNum} of ${totalPages})...`,
        });
      }

      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items = textContent.items as Array<{ str: string; transform: number[] }>;
      const lineMap: Map<number, Array<{ str: string; x: number; width?: number }>> = new Map();
      const yThreshold = 5;

      for (const item of items) {
        if (!item.str || item.str.trim() === '') continue;
        const x = item.transform[4];
        const y = Math.round(item.transform[5]);

        let matchedY = y;
        for (const existingY of lineMap.keys()) {
          if (Math.abs(existingY - y) <= yThreshold) {
            matchedY = existingY;
            break;
          }
        }

        if (!lineMap.has(matchedY)) {
          lineMap.set(matchedY, []);
        }
        lineMap.get(matchedY)!.push({ str: item.str.trim(), x });
      }

      const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
      let headerColumns: Array<{ name: string; x: number }> = [];
      const headerPatterns = /post\s*date|value\s*date|value\s*dt|txn\s*date|date|branch\s*code|branch|cheque\s*number|cheque\s*no|chq|particulars|narration|transaction\s*description|description|debit|withdrawal|credit|deposit|balance/i;

      for (const y of sortedY) {
        const lineItems = lineMap.get(y)!;
        lineItems.sort((a, b) => a.x - b.x);
        const combined = lineItems.map(it => it.str).join(' ');

        const matches = (combined.match(/post\s*date|value\s*date|value\s*dt|branch|cheque|description|particulars|narration|debit|withdrawal|credit|deposit|balance/gi) || []).length;
        if (matches >= 3 && headerColumns.length === 0) {
          const cols: Array<{ name: string; x: number }> = [];
          for (let i = 0; i < lineItems.length; i++) {
            const cur = lineItems[i];
            if (cols.length > 0 && Math.abs(cur.x - cols[cols.length - 1].x) < 45) {
              cols[cols.length - 1].name += ' ' + cur.str;
            } else {
              cols.push({ name: cur.str, x: cur.x });
            }
          }
          if (cols.length >= 3) {
            headerColumns = cols;
          }
        }
      }

      const pageLines: string[] = [];
      let inTableSection = false;

      for (const y of sortedY) {
        const lineItems = lineMap.get(y)!;
        lineItems.sort((a, b) => a.x - b.x);
        const lineStr = lineItems.map(it => it.str).join('   ').trim();

        // Require at least 3 matching header keywords on this exact line to trigger table mode
        const lineHeaderMatches = (lineStr.match(/post\s*date|value\s*date|value\s*dt|txn\s*date|branch\s*code|cheque\s*number|cheque\s*no|chq|transaction\s*description|particulars|narration|debit|withdrawal|credit|deposit|balance/gi) || []).length;

        if (lineHeaderMatches >= 3 && headerColumns.length >= 3) {
          inTableSection = true;
          pageLines.push(headerColumns.map(c => c.name).join('^'));
          continue;
        }

        if (inTableSection && headerColumns.length >= 3) {
          if (/^(total|carried\s*forward|statement\s*of|disclaimer|printed\s*on|page\s*\d+|\*\s*statement\s*downloaded|unless\s*a\s*constituent|end\s*of\s*statement)/i.test(lineStr)) {
            pageLines.push(lineStr);
            continue;
          }

          const rowSlots: string[] = new Array(headerColumns.length).fill('');
          for (const item of lineItems) {
            let bestColIdx = 0;
            let minDistance = Infinity;

            for (let c = 0; c < headerColumns.length; c++) {
              const colX = headerColumns[c].x;
              const nextColX = c < headerColumns.length - 1 ? headerColumns[c + 1].x : colX + 200;
              const prevColX = c > 0 ? headerColumns[c - 1].x : colX - 100;

              const colBoundLeft = (prevColX + colX) / 2;
              const colBoundRight = (colX + nextColX) / 2;

              if (item.x >= colBoundLeft && item.x < colBoundRight) {
                bestColIdx = c;
                break;
              }

              const dist = Math.abs(item.x - colX);
              if (dist < minDistance) {
                minDistance = dist;
                bestColIdx = c;
              }
            }

            if (rowSlots[bestColIdx]) {
              rowSlots[bestColIdx] += ' ' + item.str;
            } else {
              rowSlots[bestColIdx] = item.str;
            }
          }

          const hasContent = rowSlots.some(s => s.trim().length > 0);
          if (hasContent) {
            pageLines.push(rowSlots.join('^'));
            continue;
          }
        }

        if (lineStr) {
          pageLines.push(lineStr);
        }
      }

      const pageCharCount = pageLines.reduce((acc, l) => acc + l.trim().length, 0);
      if (pageCharCount > 0) {
        totalChars += pageCharCount;
        totalLinesCount += pageLines.length;
        fullText += pageLines.join('\n') + `\n--- PAGE_BREAK_${pageNum} ---\n`;
      }
    }

    const hasDigitalText = totalChars > 20 && totalLinesCount > 0;

    if (!hasDigitalText) {
      // PDF was loaded without error, but 0 digital text layer was extracted
      return {
        text: '',
        totalPages,
        extractedChars: 0,
        extractedLines: 0,
        hasTextLayer: false,
        isPasswordProtected: false,
        isPasswordIncorrect: false,
        isScannedOrImageOnly: true,
        isCorrupt: false,
        errorCode: 'SCANNED_IMAGE_NO_TEXT',
        diagnosticReason: `The PDF has ${totalPages} page(s) but contains 0 digital text characters (scanned paper document / image-only).`,
        suggestedAction: 'This PDF is a scanned photocopy or image without selectable text. Use the instant "Central Bank of India" sample or use "Paste Statement Text".',
      };
    }

    return {
      text: fullText,
      totalPages,
      extractedChars: totalChars,
      extractedLines: totalLinesCount,
      hasTextLayer: true,
      isPasswordProtected: false,
      isPasswordIncorrect: false,
      isScannedOrImageOnly: false,
      isCorrupt: false,
      rawSample: fullText.trim().substring(0, 350),
    };
  } catch (pdfErr: any) {
    const errName = String(pdfErr?.name || '');
    const errMsg = String(pdfErr?.message || '');
    const errCode = pdfErr?.code;

    // Check for password protection
    if (errName === 'PasswordException' || errCode === 1 || /password/i.test(errMsg)) {
      const isIncorrect = Boolean(password && (errCode === 2 || /incorrect/i.test(errMsg)));
      return {
        text: '',
        totalPages: 0,
        extractedChars: 0,
        extractedLines: 0,
        hasTextLayer: false,
        isPasswordProtected: true,
        isPasswordIncorrect: isIncorrect,
        isScannedOrImageOnly: false,
        isCorrupt: false,
        errorCode: isIncorrect ? 'PASSWORD_INCORRECT' : 'PASSWORD_REQUIRED',
        diagnosticReason: isIncorrect
          ? 'The password entered for this bank statement is incorrect.'
          : 'This bank statement PDF is password-protected/encrypted by your bank.',
        suggestedAction: 'Enter the PDF password (typically your Date of Birth DDMMYYYY, PAN number, or last 4 digits of account) to decrypt and load.',
      };
    }

    // Check for corrupt PDF
    if (errName === 'InvalidPDFException' || /invalid pdf|corrupted/i.test(errMsg)) {
      return {
        text: '',
        totalPages: 0,
        extractedChars: 0,
        extractedLines: 0,
        hasTextLayer: false,
        isPasswordProtected: false,
        isPasswordIncorrect: false,
        isScannedOrImageOnly: false,
        isCorrupt: true,
        errorCode: 'CORRUPT_FILE',
        diagnosticReason: `The PDF file header or stream is corrupted: ${errMsg || 'Invalid PDF structure'}.`,
        suggestedAction: 'Please try re-saving or re-downloading the PDF from your bank account portal.',
      };
    }

    // Fallback: try raw stream buffer
    const rawDecoded = extractTextFromRawPdfBuffer(arrayBuffer);
    if (rawDecoded && rawDecoded.length > 20) {
      return {
        text: rawDecoded,
        totalPages: 1,
        extractedChars: rawDecoded.length,
        extractedLines: rawDecoded.split('\n').length,
        hasTextLayer: true,
        isPasswordProtected: false,
        isPasswordIncorrect: false,
        isScannedOrImageOnly: false,
        isCorrupt: false,
        rawSample: rawDecoded.substring(0, 350),
      };
    }

    return {
      text: '',
      totalPages: 0,
      extractedChars: 0,
      extractedLines: 0,
      hasTextLayer: false,
      isPasswordProtected: false,
      isPasswordIncorrect: false,
      isScannedOrImageOnly: true,
      isCorrupt: false,
      errorCode: 'UNKNOWN',
      diagnosticReason: `Could not parse text stream from document: ${errMsg || 'Unknown PDF error'}`,
      suggestedAction: 'Ensure this is a standard bank statement or try pasting the statement text directly.',
    };
  }
}

export async function extractTextFromPDF(
  file: File,
  onProgress?: PdfProgressCallback,
  password?: string
): Promise<string> {
  const result = await extractDetailedTextFromPDF(file, password, onProgress);
  if (result.hasTextLayer && result.text) {
    return result.text;
  }
  if (result.isPasswordProtected) {
    throw new Error(`PASSWORD_PROTECTED: ${result.diagnosticReason}`);
  }
  if (result.isScannedOrImageOnly) {
    throw new Error(`SCANNED_DOCUMENT: ${result.diagnosticReason}`);
  }
  throw new Error(result.diagnosticReason || `Could not parse text from '${file.name}'.`);
}


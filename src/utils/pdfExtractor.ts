import { ExtractedPdfResult, ExtractProgressCallback, PositionedLine, PositionedWord } from '../types';

// Load PDF.js only when a PDF is actually opened. This keeps its browser-only
// globals out of the initial app bootstrap so the upload screen can render in
// production browsers and server/static preview environments.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.mjs?url'),
    ]).then(([pdfjsLib, worker]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjsLib;
    });
  }
  return pdfjsPromise;
}

// A page is considered "scanned / image-only" (and therefore needs OCR) if its
// embedded text layer yields fewer than this many non-whitespace characters.
const MIN_TEXT_LAYER_CHARS_PER_PAGE = 25;

// Render scale used when rasterizing a page for OCR. Higher = more accurate
// but slower. ~2.2 gives roughly 200 DPI on a standard Letter/A4 page, which
// is a good speed/accuracy tradeoff for tesseract.js in the browser.
const OCR_RENDER_SCALE = 2.2;

/**
 * Fallback to extract text streams directly from PDF binary if the pdfjs worker fails entirely.
 */
function extractTextFromRawPdfBuffer(buffer: ArrayBuffer): string {
  try {
    const decoder = new TextDecoder('utf-8');
    const rawString = decoder.decode(new Uint8Array(buffer));

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

/** Group a flat list of positioned words into reading-order lines by y-proximity. */
function groupWordsIntoLines(words: PositionedWord[], page: number, yThreshold: number): PositionedLine[] {
  const lineMap: Map<number, PositionedWord[]> = new Map();

  for (const w of words) {
    let matchedY = w.y;
    for (const existingY of lineMap.keys()) {
      if (Math.abs(existingY - w.y) <= yThreshold) {
        matchedY = existingY;
        break;
      }
    }
    if (!lineMap.has(matchedY)) lineMap.set(matchedY, []);
    lineMap.get(matchedY)!.push(w);
  }

  const lines: PositionedLine[] = [];
  for (const [y, lineWords] of lineMap.entries()) {
    lineWords.sort((a, b) => a.x - b.x);
    lines.push({ page, y, words: lineWords });
  }
  lines.sort((a, b) => a.y - b.y);
  return lines;
}

/**
 * Render a pdfjs page to an offscreen canvas for OCR.
 */
async function renderPageToCanvas(page: any, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context for PDF rendering.');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * OCR a single rendered page using tesseract.js and return positioned words
 * (in the same coordinate convention as pdfjs text-layer extraction: y grows
 * downward is fine here since we only ever compare y values within one page/document
 * consistently).
 */
async function ocrCanvasToWords(canvas: HTMLCanvasElement, scale: number): Promise<PositionedWord[]> {
  // Loaded lazily so that projects which never encounter a scanned PDF don't
  // pay the (~2MB) tesseract.js + language-data cost upfront.
  const Tesseract: any = await import('tesseract.js');
  const worker = await Tesseract.createWorker('eng');
  try {
    const { data } = await worker.recognize(canvas);
    const words: PositionedWord[] = [];
    const rawWords = data?.words || [];
    for (const w of rawWords) {
      const text = (w.text || '').trim();
      if (!text) continue;
      const bbox = w.bbox || {};
      // Normalize back down from the render scale so OCR-derived x/y are
      // comparable in magnitude to pdfjs text-layer coordinates.
      const x = (bbox.x0 ?? 0) / scale;
      const y = (bbox.y0 ?? 0) / scale;
      words.push({ text, x, y });
    }
    return words;
  } finally {
    await worker.terminate();
  }
}

/**
 * Extracts both a flat text representation AND a positioned (x/y per word)
 * representation of a PDF's content. Automatically falls back to on-device
 * OCR (tesseract.js) for pages that have no usable embedded text layer
 * (e.g. scanned statements saved as "Print to PDF" images).
 */
export async function extractPdfContent(file: File, onProgress?: ExtractProgressCallback): Promise<ExtractedPdfResult> {
  const arrayBuffer = await file.arrayBuffer();
  const positionedLines: PositionedLine[] = [];
  const pageTexts: string[] = [];
  let usedOcr = false;

  onProgress?.({ fileName: file.name, stage: 'loading', page: 0, totalPages: 0, percent: 0 });

  try {
    const pdfjsLib = await getPdfjs();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      disableFontFace: true,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items as Array<{ str: string; transform: number[] }>;

      const words: PositionedWord[] = [];
      let charCount = 0;
      for (const item of items) {
        const str = item.str;
        if (!str || str.trim() === '') continue;
        words.push({ text: str.trim(), x: item.transform[4], y: Math.round(item.transform[5]) });
        charCount += str.trim().length;
      }

      if (charCount >= MIN_TEXT_LAYER_CHARS_PER_PAGE) {
        // Usable embedded text layer - use it directly (fast path).
        onProgress?.({ fileName: file.name, stage: 'text-layer', page: pageNum, totalPages, percent: Math.round((pageNum / totalPages) * 100) });
        const lines = groupWordsIntoLines(words, pageNum, 4);
        positionedLines.push(...lines);
        pageTexts.push(lines.map(l => l.words.map(w => w.text).join('   ')).join('\n'));
      } else {
        // Scanned / image-only page - fall back to on-device OCR.
        usedOcr = true;
        onProgress?.({ fileName: file.name, stage: 'ocr', page: pageNum, totalPages, percent: Math.round(((pageNum - 0.5) / totalPages) * 100) });
        try {
          const canvas = await renderPageToCanvas(page, OCR_RENDER_SCALE);
          const ocrWords = await ocrCanvasToWords(canvas, OCR_RENDER_SCALE);
          const lines = groupWordsIntoLines(ocrWords, pageNum, 15);
          positionedLines.push(...lines);
          pageTexts.push(lines.map(l => l.words.map(w => w.text).join('   ')).join('\n'));
        } catch (ocrErr) {
          console.warn(`OCR failed for page ${pageNum} of ${file.name}:`, ocrErr);
          // Keep whatever (possibly empty) text-layer words we already had for this page.
          const lines = groupWordsIntoLines(words, pageNum, 4);
          positionedLines.push(...lines);
          pageTexts.push(lines.map(l => l.words.map(w => w.text).join('   ')).join('\n'));
        }
        onProgress?.({ fileName: file.name, stage: 'ocr', page: pageNum, totalPages, percent: Math.round((pageNum / totalPages) * 100) });
      }
    }

    const fullText = pageTexts.join('\n--- PAGE_BREAK ---\n');

    if (fullText.trim().length > 10) {
      return { text: fullText, positionedLines, pageCount: totalPages, usedOcr };
    }
  } catch (pdfErr) {
    console.warn('pdfjs extraction failed or worker error:', pdfErr);
  }

  // Last-resort fallback to direct raw PDF buffer text extraction (works only
  // for PDFs with an uncompressed text layer; scanned PDFs will still fail
  // here and should have already been handled by the OCR path above).
  const rawDecoded = extractTextFromRawPdfBuffer(arrayBuffer);
  if (rawDecoded && rawDecoded.length > 20) {
    return { text: rawDecoded, positionedLines, pageCount: positionedLines.length ? Math.max(...positionedLines.map(l => l.page)) : 1, usedOcr };
  }

  throw new Error(`Could not extract any text or perform OCR on '${file.name}'. Please ensure it is a valid, readable bank statement PDF, or use the paste text option.`);
}

/**
 * Backward-compatible flat-text extractor (used by callers that only need
 * plain text, e.g. the raw-text preview tab). Internally uses the same
 * OCR-capable extraction pipeline as extractPdfContent.
 */
export async function extractTextFromPDF(file: File, onProgress?: ExtractProgressCallback): Promise<string> {
  const result = await extractPdfContent(file, onProgress);
  return result.text;
}

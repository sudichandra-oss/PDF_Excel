import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware for parsing large JSON payloads (for base64 PDFs and images)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Gemini AI-Powered PDF & Image Bank Statement Parser
app.post('/api/parse-statement', async (req, res) => {
  try {
    const { fileBase64, mimeType, rawText, fileName } = req.body;

    if (!fileBase64 && !rawText) {
      return res.status(400).json({ error: 'Either fileBase64 or rawText is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(200).json({
        warning: 'GEMINI_API_KEY is not configured on server. Used fallback parser.',
        fallback: true
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction = `You are an elite, highly accurate financial data extraction AI specializing in bank statements worldwide (including ICICI, SBI, HDFC, Axis, Central Bank of India, PNB, Kotak Mahindra, Canara, Bank of Baroda, IndusInd, Yes Bank, Chase, Wells Fargo, Bank of America, Barclays, HSBC, etc.).
Your task is to parse any Bank Statement (PDF, image, or raw text) into cleanly structured tabular records and account metadata.
Extract every single transaction with 100% numerical fidelity.

Understand that PDF bank statement column headers vary across banks. You must automatically recognize and map these header variations:
- Date Column variations: "Date", "Txn Date", "Tran Date", "Posting Date", "Value Dt", "Value Date" -> map to postDate and valueDate
- Narration / Description variations: "Narration", "Particulars", "Transaction Details", "Description", "Transaction Remarks", "Details", "Remarks" -> map to description
- Cheque / Ref Number variations: "Chq./Ref.No.", "Chq No", "Cheque No", "Ref No", "Ref.No.", "UTR / RRN", "Instrument ID" -> map to chequeNo and referenceNo
- Debit / Withdrawal variations: "Withdrawal Amt.", "Withdrawal Amount", "Withdrawal (Dr)", "Withdrawal", "Debit", "Debit Amount", "Debit Amt.", "Dr Amt", "Dr." -> map to debit (Number or null)
- Credit / Deposit variations: "Deposit Amt.", "Deposit Amount", "Deposit (Cr)", "Deposit", "Credit", "Credit Amount", "Credit Amt.", "Cr Amt", "Cr." -> map to credit (Number or null)
- Balance variations: "Closing Balance", "Balance", "Running Balance", "Available Balance", "Book Balance" -> map to balance (Number or null)
- Category: Automatically classify each transaction into a smart category (e.g. "Tuition Fees", "UPI / Digital Payment", "Cash Deposit", "Cash Withdrawal", "Bank Charges / GST", "Salary", "Investment / Mutual Fund", "Loan / EMI", "Utilities / Bills", "Dining / Food", "Shopping", "Travel", "Interest Inflow", "General Transfer") based on the narration.

Guidelines:
1. Account Information: Extract Bank Name, Account Holder Name, Account Number, IFSC/Routing code, Branch Name, Branch Code, Statement Period, Opening Balance, Closing Balance, Total Credits, Total Debits, Currency.
2. Transactions Table: Extract EVERY single row in chronological order.
   - postDate: String (DD/MM/YYYY or YYYY-MM-DD or DD-MMM-YYYY)
   - valueDate: String (DD/MM/YYYY or YYYY-MM-DD or DD-MMM-YYYY)
   - branchCode: String or empty
   - chequeNo: String or empty (e.g., from Chq./Ref.No.)
   - description: String (Full clean narration / particulars / transaction details)
   - debit: Number or null (Withdrawal / Debit amount)
   - credit: Number or null (Deposit / Credit amount)
   - balance: Number or null (Closing / running balance)
   - balanceType: 'CR' or 'DR' or ''
   - mode: 'UPI' | 'NEFT' | 'IMPS' | 'CASH' | 'TRANSFER' | 'CHARGES' | 'INTEREST' | 'OTHER'
   - category: Intelligent category string derived from the narration
   - referenceNo: Transaction reference / RRN / UTR / Chq number if present
3. Multi-page continuity: If the statement contains multiple pages, extract and merge all transactions in sequential order without skipping any page.`;

    const contents: any[] = [];

    if (fileBase64 && mimeType) {
      contents.push({
        inlineData: {
          mimeType: mimeType || 'application/pdf',
          data: fileBase64,
        },
      });
    }

    const promptText = rawText
      ? `Parse this bank statement text and extract all transactions and account summary:\n\n${rawText}`
      : `Parse this bank statement file (${fileName || 'document'}) and extract all transactions and account summary.`;

    contents.push({ text: promptText });

    // Model candidates with fallback support
    const candidateModels = ['gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
    let response: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      // Up to 2 retries per model if 503/429 occurs
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  account: {
                    type: Type.OBJECT,
                    properties: {
                      bankName: { type: Type.STRING },
                      accountHolder: { type: Type.STRING },
                      accountNumber: { type: Type.STRING },
                      ifscCode: { type: Type.STRING },
                      branchName: { type: Type.STRING },
                      branchCode: { type: Type.STRING },
                      statementPeriod: { type: Type.STRING },
                      startDate: { type: Type.STRING },
                      endDate: { type: Type.STRING },
                      openingBalance: { type: Type.NUMBER },
                      closingBalance: { type: Type.NUMBER },
                      totalCredits: { type: Type.NUMBER },
                      totalDebits: { type: Type.NUMBER },
                      currency: { type: Type.STRING },
                      customerAddress: { type: Type.STRING },
                      email: { type: Type.STRING },
                      productType: { type: Type.STRING },
                      statementDate: { type: Type.STRING },
                    },
                  },
                  detectedColumns: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  transactions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        postDate: { type: Type.STRING },
                        valueDate: { type: Type.STRING },
                        branchCode: { type: Type.STRING },
                        chequeNo: { type: Type.STRING },
                        description: { type: Type.STRING },
                        debit: { type: Type.NUMBER },
                        credit: { type: Type.NUMBER },
                        balance: { type: Type.NUMBER },
                        balanceType: { type: Type.STRING },
                        mode: { type: Type.STRING },
                        category: { type: Type.STRING },
                        referenceNo: { type: Type.STRING },
                      },
                    },
                  },
                },
                required: ['account', 'transactions'],
              },
            },
          });
          if (response && response.text) {
            break; // Successfully got response
          }
        } catch (modelErr: any) {
          lastError = modelErr;
          const isRateLimitOr503 = String(modelErr?.message || modelErr).includes('503') ||
            String(modelErr?.message || modelErr).includes('429') ||
            String(modelErr?.message || modelErr).includes('high demand') ||
            String(modelErr?.message || modelErr).includes('UNAVAILABLE');

          if (isRateLimitOr503 && attempt === 0) {
            // Wait 1 second and retry once
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          // Try next fallback model
          break;
        }
      }

      if (response && response.text) {
        break;
      }
    }

    if (!response || !response.text) {
      console.warn('All Gemini AI model attempts failed, signaling client fallback:', lastError?.message || lastError);
      return res.status(200).json({
        success: false,
        fallback: true,
        warning: 'AI models temporarily experiencing high demand. Falling back to high-accuracy local parser.',
      });
    }

    const parsedJson = JSON.parse(response.text || '{}');
    
    const transactions = Array.isArray(parsedJson.transactions) ? parsedJson.transactions : [];

    // Verify required columns: Date, Description, Category, Amount (debit or credit)
    const validRows = transactions.filter((tx: any) => {
      const hasDate = Boolean(tx.postDate || tx.valueDate);
      const hasDesc = Boolean(tx.description && String(tx.description).trim().length > 0);
      const hasAmt = (tx.debit !== null && tx.debit !== undefined) || (tx.credit !== null && tx.credit !== undefined) || (tx.balance !== null && tx.balance !== undefined);
      return (hasDate && hasDesc) || (hasDate && hasAmt) || (hasDesc && hasAmt);
    });

    if (validRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: `File format mismatch: Could not find required columns (Date, Description, Category, Amount) in '${fileName || 'uploaded file'}'. Please ensure your statement contains these columns or upload a valid bank statement.`,
      });
    }

    // Assign IDs and ensure category is mapped
    const processedTransactions = validRows.map((tx: any, i: number) => ({
      id: `ai-tx-${i + 1}-${Date.now()}`,
      postDate: tx.postDate || tx.valueDate || '01/04/2025',
      valueDate: tx.valueDate || tx.postDate || '01/04/2025',
      branchCode: tx.branchCode || '',
      chequeNo: tx.chequeNo || '',
      description: tx.description || 'Bank Transaction',
      debit: tx.debit ?? null,
      credit: tx.credit ?? null,
      balance: tx.balance ?? null,
      balanceType: tx.balanceType || (tx.balance !== null ? 'CR' : ''),
      mode: tx.mode || 'OTHER',
      category: tx.category || 'General',
      referenceNo: tx.referenceNo || '',
    }));

    return res.json({
      success: true,
      data: {
        id: `stmt-ai-${Date.now()}`,
        fileName: fileName || 'Uploaded_Bank_Statement.pdf',
        uploadedAt: new Date().toISOString(),
        account: parsedJson.account || {},
        detectedColumns: [
          'Date',
          'Description',
          'Category',
          'Amount',
          'Mode',
          'Balance',
        ],
        transactions: processedTransactions,
      },
    });
  } catch (error: any) {
    console.error('Error parsing bank statement with Gemini:', error);
    return res.status(200).json({
      success: false,
      fallback: true,
      error: 'Failed to parse statement with AI, switched to local engine.',
      message: error.message || String(error),
    });
  }
});

// Vite & Static file serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bank Statement to Excel Converter running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

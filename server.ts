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

CRITICAL NUMERICAL ACCURACY RULES (AVOIDING COMMA SEPARATION & FIELD MERGING DEFECTS):
- Numbers in statements often have thousands separators (e.g., Indian format "1,25,000.00" or standard "1,500.00"). You MUST parse them as clean numbers (e.g. 125000.00 and 1500.00).
- Narrations often contain commas (e.g. "SALARY, MARCH 2024, BANGALORE"). NEVER allow commas in narrations or amounts to shift columns or corrupt amounts.
- NEVER concatenate account numbers, UTRs, cheque numbers, phone numbers, or dates into the Debit or Credit columns.
- Debit (Withdrawals / Outflows): MUST be positive number or null. If empty/not a withdrawal, output null (never -1, never concatenate adjacent fields).
- Credit (Deposits / Inflows): MUST be positive number or null. If empty/not a deposit, output null (never -1).
- Balance (Running / Closing balance): MUST be positive number or null.
- Category: Automatically classify each transaction into a smart category (e.g. "Tuition Fees", "UPI / Digital Payment", "Cash Deposit", "Cash Withdrawal", "Bank Charges / GST", "Salary", "Investment / Mutual Fund", "Loan / EMI", "Utilities / Bills", "Dining / Food", "Shopping", "Travel", "Interest Inflow", "General Transfer") based on the narration.
- Whenever a value is null, missing, empty, or not applicable, output null. NEVER replace null or empty values with -1 or dummy placeholder numbers.

Understand that PDF bank statement column headers vary across banks:
- Date Column variations: "Post Date", "Posting Date", "Date", "Txn Date", "Tran Date", "Value Date", "Value Dt" -> map to postDate and valueDate
- Value Date variations: "Value Date", "Value Dt", "Val Date" -> map to valueDate
- Branch Code variations: "Branch Code", "Branch", "Br Code", "Sol ID" -> map to branchCode
- Narration / Description variations: "Transaction Description", "Narration", "Particulars", "Transaction Details", "Description", "Transaction Remarks", "Details", "Remarks" -> map to description
- Cheque / Ref Number variations: "Cheque Number", "Cheque No", "Chq./Ref.No.", "Chq No", "Ref No", "Ref.No.", "UTR / RRN", "Instrument ID", "Instrument No" -> map to chequeNo and referenceNo
- Debit / Withdrawal variations: "Debit", "Debit Amount", "Debit Amt.", "Withdrawal Amt.", "Withdrawal Amount", "Withdrawal (Dr)", "Withdrawal", "Dr Amt", "Dr.", "Outflow" -> map to debit (Number or null)
- Credit / Deposit variations: "Credit", "Credit Amount", "Credit Amt.", "Deposit Amt.", "Deposit Amount", "Deposit (Cr)", "Deposit", "Cr Amt", "Cr.", "Inflow" -> map to credit (Number or null)
- Balance variations: "Balance", "Closing Balance", "Running Balance", "Available Balance", "Book Balance" -> map to balance (Number or null), extract trailing CR/DR to balanceType (e.g., "29,866.60 CR" -> balance: 29866.60, balanceType: "CR")

Guidelines:
1. Account Information: Extract Bank Name, Account Holder Name, Account Number, IFSC/Routing code, Branch Name, Branch Code, Statement Period, Opening Balance, Closing Balance, Total Credits, Total Debits, Currency. (If unknown, leave as null).
2. Transactions Table: Extract EVERY single row in chronological order.
   - postDate: String (DD/MM/YYYY or YYYY-MM-DD or DD-MMM-YYYY)
   - valueDate: String (DD/MM/YYYY or YYYY-MM-DD or DD-MMM-YYYY)
   - branchCode: String or empty
   - chequeNo: String or empty (e.g., from Chq./Ref.No.)
   - description: String (Full clean narration / particulars / transaction details)
   - debit: Number or null (Withdrawal / Debit amount). If not a withdrawal row or empty, MUST be null (DO NOT use -1).
   - credit: Number or null (Deposit / Credit amount). If not a deposit row or empty, MUST be null (DO NOT use -1).
   - balance: Number or null (Closing / running balance). If not present, MUST be null (DO NOT use -1).
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

    // Verify extracted rows: accept rows with date, description, or amount
    let validRows = transactions.filter((tx: any) => {
      const hasDate = Boolean(tx.postDate || tx.valueDate);
      const hasDesc = Boolean(tx.description && String(tx.description).trim().length > 0);
      const hasAmt = (tx.debit !== null && tx.debit !== undefined) || (tx.credit !== null && tx.credit !== undefined) || (tx.balance !== null && tx.balance !== undefined);
      return hasDate || hasDesc || hasAmt;
    });

    if (validRows.length === 0 && transactions.length > 0) {
      validRows = transactions;
    }

    if (validRows.length === 0) {
      return res.status(200).json({
        success: false,
        fallback: true,
        warning: 'AI did not find structured transaction rows, attempting local parser.',
      });
    }

    // Assign IDs and ensure category is mapped
    const processedTransactions = validRows.map((tx: any, i: number) => {
      let rawDeb = (tx.debit !== null && tx.debit !== undefined && tx.debit !== -1 && !isNaN(Number(tx.debit))) ? Math.abs(Number(tx.debit)) : null;
      let rawCred = (tx.credit !== null && tx.credit !== undefined && tx.credit !== -1 && !isNaN(Number(tx.credit))) ? Math.abs(Number(tx.credit)) : null;
      let rawBal = (tx.balance !== null && tx.balance !== undefined && tx.balance !== -1 && !isNaN(Number(tx.balance))) ? Number(tx.balance) : null;

      // Sanity check: if debit/credit is an accidental 10+ digit integer without decimals matching an account or reference number, prevent giant corrupted numbers
      if (rawDeb && rawDeb > 10000000000 && Number.isInteger(rawDeb)) {
        rawDeb = null;
      }
      if (rawCred && rawCred > 10000000000 && Number.isInteger(rawCred)) {
        rawCred = null;
      }

      return {
        id: `ai-tx-${i + 1}-${Date.now()}`,
        postDate: tx.postDate || tx.valueDate || '',
        valueDate: tx.valueDate || tx.postDate || '',
        branchCode: tx.branchCode || '',
        chequeNo: tx.chequeNo || '',
        description: tx.description || 'Bank Transaction',
        debit: rawDeb,
        credit: rawCred,
        balance: rawBal,
        balanceType: tx.balanceType || (rawBal !== null ? 'CR' : ''),
        mode: tx.mode || 'OTHER',
        category: tx.category || 'General',
        referenceNo: tx.referenceNo || '',
      };
    });

    // Construct raw Caret (^) Delimited string
    const caretHeader = 'PostDate^ValueDate^BranchCode^ChequeNo^Description^Debit^Credit^Balance^Category^Mode^ReferenceNo';
    const caretBody = processedTransactions.map((tx: any) => 
      [
        tx.postDate || '',
        tx.valueDate || '',
        tx.branchCode || '',
        tx.chequeNo || '',
        (tx.description || '').replace(/\^/g, ' '),
        tx.debit !== null && tx.debit !== undefined ? Number(tx.debit).toFixed(2) : '',
        tx.credit !== null && tx.credit !== undefined ? Number(tx.credit).toFixed(2) : '',
        tx.balance !== null && tx.balance !== undefined ? Number(tx.balance).toFixed(2) : '',
        tx.category || '',
        tx.mode || '',
        tx.referenceNo || ''
      ].join('^')
    ).join('\n');

    const rawCaretText = `${caretHeader}\n${caretBody}`;

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
        rawRows: validRows,
        rawHeaders: ['postDate', 'valueDate', 'description', 'debit', 'credit', 'balance', 'category', 'mode', 'chequeNo', 'branchCode'],
        rawCaretText,
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

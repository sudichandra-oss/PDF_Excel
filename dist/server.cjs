var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
});
app.post("/api/parse-statement", async (req, res) => {
  try {
    const { fileBase64, mimeType, rawText, fileName } = req.body;
    if (!fileBase64 && !rawText) {
      return res.status(400).json({ error: "Either fileBase64 or rawText is required." });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        warning: "GEMINI_API_KEY is not configured on server. Used fallback parser.",
        fallback: true
      });
    }
    const ai = new import_genai.GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
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
    const contents = [];
    if (fileBase64 && mimeType) {
      contents.push({
        inlineData: {
          mimeType: mimeType || "application/pdf",
          data: fileBase64
        }
      });
    }
    const promptText = rawText ? `Parse this bank statement text and extract all transactions and account summary:

${rawText}` : `Parse this bank statement file (${fileName || "document"}) and extract all transactions and account summary.`;
    contents.push({ text: promptText });
    const candidateModels = ["gemini-3.7-flash", "gemini-2.5-flash", "gemini-flash-latest"];
    let response = null;
    let lastError = null;
    for (const modelName of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: import_genai.Type.OBJECT,
                properties: {
                  account: {
                    type: import_genai.Type.OBJECT,
                    properties: {
                      bankName: { type: import_genai.Type.STRING },
                      accountHolder: { type: import_genai.Type.STRING },
                      accountNumber: { type: import_genai.Type.STRING },
                      ifscCode: { type: import_genai.Type.STRING },
                      branchName: { type: import_genai.Type.STRING },
                      branchCode: { type: import_genai.Type.STRING },
                      statementPeriod: { type: import_genai.Type.STRING },
                      startDate: { type: import_genai.Type.STRING },
                      endDate: { type: import_genai.Type.STRING },
                      openingBalance: { type: import_genai.Type.NUMBER },
                      closingBalance: { type: import_genai.Type.NUMBER },
                      totalCredits: { type: import_genai.Type.NUMBER },
                      totalDebits: { type: import_genai.Type.NUMBER },
                      currency: { type: import_genai.Type.STRING },
                      customerAddress: { type: import_genai.Type.STRING },
                      email: { type: import_genai.Type.STRING },
                      productType: { type: import_genai.Type.STRING },
                      statementDate: { type: import_genai.Type.STRING }
                    }
                  },
                  detectedColumns: {
                    type: import_genai.Type.ARRAY,
                    items: { type: import_genai.Type.STRING }
                  },
                  transactions: {
                    type: import_genai.Type.ARRAY,
                    items: {
                      type: import_genai.Type.OBJECT,
                      properties: {
                        postDate: { type: import_genai.Type.STRING },
                        valueDate: { type: import_genai.Type.STRING },
                        branchCode: { type: import_genai.Type.STRING },
                        chequeNo: { type: import_genai.Type.STRING },
                        description: { type: import_genai.Type.STRING },
                        debit: { type: import_genai.Type.NUMBER },
                        credit: { type: import_genai.Type.NUMBER },
                        balance: { type: import_genai.Type.NUMBER },
                        balanceType: { type: import_genai.Type.STRING },
                        mode: { type: import_genai.Type.STRING },
                        category: { type: import_genai.Type.STRING },
                        referenceNo: { type: import_genai.Type.STRING }
                      }
                    }
                  }
                },
                required: ["account", "transactions"]
              }
            }
          });
          if (response && response.text) {
            break;
          }
        } catch (modelErr) {
          lastError = modelErr;
          const isRateLimitOr503 = String(modelErr?.message || modelErr).includes("503") || String(modelErr?.message || modelErr).includes("429") || String(modelErr?.message || modelErr).includes("high demand") || String(modelErr?.message || modelErr).includes("UNAVAILABLE");
          if (isRateLimitOr503 && attempt === 0) {
            await new Promise((r) => setTimeout(r, 1e3));
            continue;
          }
          break;
        }
      }
      if (response && response.text) {
        break;
      }
    }
    if (!response || !response.text) {
      console.warn("All Gemini AI model attempts failed, signaling client fallback:", lastError?.message || lastError);
      return res.status(200).json({
        success: false,
        fallback: true,
        warning: "AI models temporarily experiencing high demand. Falling back to high-accuracy local parser."
      });
    }
    const parsedJson = JSON.parse(response.text || "{}");
    const transactions = Array.isArray(parsedJson.transactions) ? parsedJson.transactions : [];
    const validRows = transactions.filter((tx) => {
      const hasDate = Boolean(tx.postDate || tx.valueDate);
      const hasDesc = Boolean(tx.description && String(tx.description).trim().length > 0);
      const hasAmt = tx.debit !== null && tx.debit !== void 0 || tx.credit !== null && tx.credit !== void 0 || tx.balance !== null && tx.balance !== void 0;
      return hasDate && hasDesc || hasDate && hasAmt || hasDesc && hasAmt;
    });
    if (validRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: `File format mismatch: Could not find required columns (Date, Description, Category, Amount) in '${fileName || "uploaded file"}'. Please ensure your statement contains these columns or upload a valid bank statement.`
      });
    }
    const processedTransactions = validRows.map((tx, i) => ({
      id: `ai-tx-${i + 1}-${Date.now()}`,
      postDate: tx.postDate || tx.valueDate || "01/04/2025",
      valueDate: tx.valueDate || tx.postDate || "01/04/2025",
      branchCode: tx.branchCode || "",
      chequeNo: tx.chequeNo || "",
      description: tx.description || "Bank Transaction",
      debit: tx.debit ?? null,
      credit: tx.credit ?? null,
      balance: tx.balance ?? null,
      balanceType: tx.balanceType || (tx.balance !== null ? "CR" : ""),
      mode: tx.mode || "OTHER",
      category: tx.category || "General",
      referenceNo: tx.referenceNo || ""
    }));
    return res.json({
      success: true,
      data: {
        id: `stmt-ai-${Date.now()}`,
        fileName: fileName || "Uploaded_Bank_Statement.pdf",
        uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
        account: parsedJson.account || {},
        detectedColumns: [
          "Date",
          "Description",
          "Category",
          "Amount",
          "Mode",
          "Balance"
        ],
        transactions: processedTransactions
      }
    });
  } catch (error) {
    console.error("Error parsing bank statement with Gemini:", error);
    return res.status(200).json({
      success: false,
      fallback: true,
      error: "Failed to parse statement with AI, switched to local engine.",
      message: error.message || String(error)
    });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Bank Statement to Excel Converter running at http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map

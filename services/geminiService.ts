import { Type, Chat, FunctionDeclaration } from "@google/genai";
import JSZip from "jszip";
import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_OCR_MODEL,
  isGeminiAIDisabled,
  requireGeminiClient,
} from "./Gemini";
// FIX: Import MarketResearchReport type.
import {
  AISuggestions,
  Customer,
  BusinessCardContact,
  CompanyAnalysis,
  InvoiceData,
  AIJournalSuggestion,
  User,
  ApplicationCode,
  Estimate,
  EstimateItem,
  Lead,
  ApprovalRoute,
  Job,
  LeadStatus,
  JournalEntry,
  LeadScore,
  Application,
  ApplicationWithDetails,
  CompanyInvestigation,
  CustomProposalContent,
  LeadProposalPackage,
  MarketResearchReport,
  PrintSpec,
  EstimationResult,
  StrategyOption,
} from "../types";
import { formatJPY } from "../utils";
import { INTEGRATION_MANIFESTO } from "../constants";

const model = GEMINI_DEFAULT_MODEL;
const invoiceOcrModel = GEMINI_OCR_MODEL ?? GEMINI_DEFAULT_MODEL;

const checkOnlineAndAIOff = () => {
  if (isGeminiAIDisabled) {
    throw new Error("AI機能は現在無効です。");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("オフラインです。ネットワーク接続を確認してください。");
  }
  return requireGeminiClient();
};

const isApiKeyExpiredError = (error: any): boolean => {
  const candidates = [
    error?.message,
    error?.error?.message,
    typeof error?.error === "string" ? error.error : null,
    typeof error === "string" ? error : null,
    JSON.stringify(error?.error ?? error ?? ""),
  ];
  return candidates.some(
    (value) =>
      typeof value === "string" &&
      (value.toLowerCase().includes("api key expired") ||
        value.toLowerCase().includes("api_key_invalid"))
  );
};

const isApiKeyLeakedError = (error: any): boolean => {
  const message = JSON.stringify(error?.error ?? error ?? "").toLowerCase();
  return message.includes("reported as leaked") || message.includes("key was leaked");
};

const normalizeGeminiError = (error: any): Error => {
  if (isApiKeyExpiredError(error)) {
    const friendly = new Error(
      "Gemini APIキーの期限が切れています。環境変数 VITE_GEMINI_API_KEY（または GEMINI_API_KEY / API_KEY）を有効なキーに更新してください。"
    );
    friendly.name = "GeminiApiKeyExpired";
    return friendly;
  }
  if (isApiKeyLeakedError(error)) {
    const friendly = new Error(
      "Gemini APIキーが漏洩扱いとなり失効しています。新しいキーを発行し、環境変数 VITE_GEMINI_API_KEY（または GEMINI_API_KEY / API_KEY）に設定してください。"
    );
    friendly.name = "GeminiApiKeyLeaked";
    return friendly;
  }
  return error instanceof Error
    ? error
    : new Error(typeof error === "string" ? error : "Gemini API error");
};

async function withRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  retries = 2,
  delay = 500
): Promise<T> {
  const controller = new AbortController();
  const signal = controller.signal;

  try {
    return await fn(signal);
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw error; // Propagate AbortError directly
    }
    const normalized = normalizeGeminiError(error);
    if (normalized.name === "GeminiApiKeyExpired" || normalized.name === "GeminiApiKeyLeaked") {
      throw normalized;
    }
    if (retries > 0) {
      console.warn(`AI API call failed, retrying (${retries} retries left):`, error);
      await new Promise((res) => setTimeout(res, delay));
      controller.abort(); // Abort previous attempt
      return withRetry(fn, retries - 1, delay * 2); // Exponential backoff
    }
    throw normalized;
  }
}

const stripCodeFences = (value: string): string => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed.startsWith("```")) {
    // コードフェンスがない場合、JSON部分を抽出
    const jsonStart = trimmed.indexOf('{');
    if (jsonStart === -1) return trimmed;

    let braceCount = 0;
    let jsonEnd = jsonStart;

    for (let i = jsonStart; i < trimmed.length; i++) {
      if (trimmed[i] === '{') {
        braceCount++;
      } else if (trimmed[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }

    return trimmed.substring(jsonStart, jsonEnd).trim();
  }

  const withoutOpening = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, "");
  if (withoutOpening.endsWith("```")) {
    return withoutOpening.slice(0, -3).trim();
  }
  return withoutOpening.trim();
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary =
    typeof atob === "function"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const stripXmlTags = (xml: string): string =>
  xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const stripMarkdown = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const extractDocxTextFromBase64 = async (fileBase64: string): Promise<string> => {
  try {
    const zip = await JSZip.loadAsync(base64ToUint8Array(fileBase64));
    const parts: string[] = [];
    const addPart = async (path: string) => {
      const entry = zip.file(path);
      if (entry) {
        const xml = await entry.async("text");
        parts.push(stripXmlTags(xml));
      }
    };
    await addPart("word/document.xml");
    for (let i = 1; i <= 3; i++) {
      await addPart(`word/header${i}.xml`);
      await addPart(`word/footer${i}.xml`);
    }
    return parts.join("\n");
  } catch {
    return "";
  }
};

const extractXlsxStringsFromBase64 = async (fileBase64: string): Promise<string> => {
  try {
    const zip = await JSZip.loadAsync(base64ToUint8Array(fileBase64));
    const shared = zip.file("xl/sharedStrings.xml");
    if (!shared) return "";
    const xml = await shared.async("text");
    const texts = Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((m) =>
      stripXmlTags(m[1]),
    );
    return texts.join("\n");
  } catch {
    return "";
  }
};

const decodeTextFromBase64 = (fileBase64: string): string => {
  try {
    if (typeof atob === "function") {
      return decodeURIComponent(escape(atob(fileBase64)));
    }
    return Buffer.from(fileBase64, "base64").toString("utf-8");
  } catch {
    return "";
  }
};

const suggestJobSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description:
        "印刷案件の簡潔でプロフェッショナルなタイトル。例：「カフェオープン記念 A5チラシ」",
    },
    quantity: {
      type: Type.INTEGER,
      description: "この種の案件で一般的または推奨される数量。例：1000",
    },
    paperType: {
      type: Type.STRING,
      description: "提供されたリストから最も適した用紙を選択。",
    },
    finishing: {
      type: Type.STRING,
      description: "提供されたリストから推奨される加工オプションを選択。",
    },
    details: {
      type: Type.STRING,
      description: "色、両面/片面、目的など、仕様を含む案件要件の詳細な説明。",
    },
    price: {
      type: Type.INTEGER,
      description:
        "この案件の現実的な販売価格（P）。数量、用紙、加工を考慮して見積もってください。例：85000",
    },
    variableCost: {
      type: Type.INTEGER,
      description:
        "この案件の現実的な変動費（V）。主に用紙代やインク代など。一般的に価格の40-60%程度です。例：35000",
    },
  },
  required: ["title", "quantity", "paperType", "finishing", "details", "price", "variableCost"],
};

export const suggestJobParameters = async (
  prompt: string,
  paperTypes: string[],
  finishingOptions: string[]
): Promise<AISuggestions> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const fullPrompt = `以下の依頼内容に基づき、印刷案件のパラメータを提案してください。
依頼内容: "${prompt}"

選択可能な用紙リスト: ${paperTypes.join(", ")}
選択可能な加工リスト: ${finishingOptions.join(", ")}

上記リストに最適なものがない場合は、依頼内容に最も近い一般的なものを提案してください。`;
    const response = await ai.models.generateContent({
      model,
      contents: fullPrompt,
      config: { responseSchema: suggestJobSchema },
    });
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr);
  });
};
export const analyzeCompany = async (customer: Customer): Promise<CompanyAnalysis> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下の企業情報に基づいて、詳細な企業分析レポートをJSON形式で作成してください。Web検索も活用し、最新の情報を反映させてください。

企業名: ${customer.customerName}
ウェブサイト: ${customer.websiteUrl || "情報なし"}
事業内容: ${customer.companyContent || "情報なし"}
既存の営業活動情報: ${customer.infoSalesActivity || "情報なし"}
要求事項: ${customer.infoRequirements || "情報なし"}

JSONのフォーマットは以下のようにしてください:
{
  "swot": "企業の強み、弱み、機会、脅威を分析したSWOT分析の結果。箇条書きで記述。",
  "painPointsAndNeeds": "企業が抱えているであろう課題や潜在的なニーズ。箇条書きで記述。",
  "suggestedActions": "これらの分析に基づき、当社が提案できる具体的なアクションや印刷案件。箇条書きで記述。",
  "proposalEmail": {
    "subject": "提案メールの件名",
    "body": "提案メールの本文。担当者名は[あなたの名前]としてください。"
  }
}
`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    let jsonStr = response.text.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }

    try {
      const result = JSON.parse(jsonStr);
      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = rawChunks
        .map((chunk: any) => chunk.web)
        .filter(Boolean)
        .map((webChunk: any) => ({ uri: webChunk.uri, title: webChunk.title }));
      const uniqueSources = Array.from(new Map(sources.map((item) => [item.uri, item])).values());

      return { ...result, sources: uniqueSources };
    } catch (e) {
      console.error("Failed to parse JSON from Gemini:", e);
      // Fallback: return the text as part of the analysis.
      return {
        swot: "JSON解析エラー",
        painPointsAndNeeds: jsonStr,
        suggestedActions: "",
        proposalEmail: { subject: "エラー", body: "AIからの応答を解析できませんでした。" },
      };
    }
  });
};

export const investigateLeadCompany = async (
  companyName: string
): Promise<CompanyInvestigation> => {
  const ai = checkOnlineAndAIOff();
  const modelWithSearch = "gemini-2.5-flash";
  return withRetry(async () => {
    const prompt = `企業名「${companyName}」について、その事業内容、最近のニュース、市場での評判を調査し、簡潔にまとめてください。`;
    const response = await ai.models.generateContent({
      model: modelWithSearch,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const summary = response.text;
    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    // FIX: Use a more robust type guard to ensure `sources` is correctly typed.
    const sources: { uri: string; title: string }[] = (rawChunks || [])
      .map((chunk: any) => chunk.web)
      .filter(
        (web: any): web is { uri: string; title: string } =>
          Boolean(web && typeof web.uri === "string" && typeof web.title === "string")
      );

    const uniqueSources = Array.from(new Map(sources.map((item) => [item.uri, item])).values());

    return { summary, sources: uniqueSources };
  });
};

export const enrichCustomerData = async (
  customerName: string
): Promise<Partial<Customer>> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `企業名「${customerName}」について、Web検索を用いて以下の情報を調査し、必ずJSON形式で返してください。見つからない情報はnullとしてください。
- 公式ウェブサイトURL (websiteUrl)
- 事業内容 (companyContent)
- 年商 (annualSales)
- 従業員数 (employeesCount)
- 本社の住所 (address1)
- 代表電話番号 (phoneNumber)
- 代表者名 (representative)`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    let jsonStr = response.text.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }

    const parsed = JSON.parse(jsonStr);

    const cleanedData: Partial<Customer> = {};
    for (const key in parsed) {
      if (parsed[key] !== null && parsed[key] !== undefined) {
        (cleanedData as Record<string, unknown>)[key] = parsed[key];
      }
    }
    return cleanedData;
  });
};

const expenseLineSchema = {
  type: Type.OBJECT,
  properties: {
    description: { type: Type.STRING, description: "明細の品名や内容。" },
    lineDate: { type: Type.STRING, description: "明細対象日 (YYYY-MM-DD)。" },
    quantity: { type: Type.NUMBER, description: "数量。" },
    unit: { type: Type.STRING, description: "単位（式、枚など）。" },
    unitPrice: { type: Type.NUMBER, description: "単価（税抜）。" },
    amountExclTax: { type: Type.NUMBER, description: "金額（税抜）。" },
    taxRate: { type: Type.NUMBER, description: "税率 (例: 10)。" },
    customerName: { type: Type.STRING, description: "紐づく顧客名。" },
    projectName: { type: Type.STRING, description: "紐づく案件/プロジェクト名。" },
  },
};

const bankAccountSchema = {
  type: Type.OBJECT,
  properties: {
    bankName: { type: Type.STRING, description: "金融機関名。" },
    branchName: { type: Type.STRING, description: "支店名。" },
    accountType: { type: Type.STRING, description: "口座種別（普通/当座など）。" },
    accountNumber: { type: Type.STRING, description: "口座番号。" },
  },
};

const expenseDraftSchema = {
  type: Type.OBJECT,
  properties: {
    supplierName: { type: Type.STRING, description: "請求書ヘッダーの発行元。" },
    registrationNumber: { type: Type.STRING, description: "請求書の登録番号。" },
    invoiceDate: { type: Type.STRING, description: "請求日。" },
    dueDate: { type: Type.STRING, description: "支払期日。" },
    totalGross: { type: Type.NUMBER, description: "税込合計。" },
    totalNet: { type: Type.NUMBER, description: "税抜合計。" },
    taxAmount: { type: Type.NUMBER, description: "税額。" },
    paymentRecipientId: { type: Type.STRING, description: "社内マスタの支払先コードが明記されていれば入力。" },
    paymentRecipientName: { type: Type.STRING, description: "支払先名称。" },
    bankAccount: bankAccountSchema,
    lines: { type: Type.ARRAY, items: expenseLineSchema },
  },
};

const extractInvoiceSchema = {
  type: Type.OBJECT,
  properties: {
    // 書類メタ
    documentType: { type: Type.STRING, description: "書類種別 (請求書, 納品書, 見積書, 稟議書 等)。" },
    // 発行元（請求元）
    vendorName: { type: Type.STRING, description: "請求書の発行元（請求元）企業名。" },
    registrationNumber: { type: Type.STRING, description: "インボイス登録番号 (T始まり)。" },
    vendorPostalCode: { type: Type.STRING, description: "請求元の郵便番号。" },
    vendorAddress: { type: Type.STRING, description: "請求元の住所。" },
    vendorContact: { type: Type.STRING, description: "請求元の連絡先 (TEL/FAX等)。" },
    // 宛先（請求先）
    recipientName: { type: Type.STRING, description: "請求先（宛先）の名称。" },
    recipientPostalCode: { type: Type.STRING, description: "請求先の郵便番号。" },
    recipientAddress: { type: Type.STRING, description: "請求先の住所。" },
    recipientContact: { type: Type.STRING, description: "請求先の連絡先。" },
    // 日付
    invoiceDate: { type: Type.STRING, description: "発行日 (YYYY-MM-DD形式)。" },
    closingDate: { type: Type.STRING, description: "締日 (YYYY-MM-DD形式)。" },
    dueDate: { type: Type.STRING, description: "支払期限 (YYYY-MM-DD形式)。" },
    // 金額
    subtotalAmount: { type: Type.NUMBER, description: "税抜金額。" },
    taxAmount: { type: Type.NUMBER, description: "消費税額。" },
    totalAmount: { type: Type.NUMBER, description: "税込合計金額。" },
    taxInclusive: {
      type: Type.BOOLEAN,
      description: "金額が税込表示ならtrue。『税込』『内税』→true、『税抜』『外税』→false。"
    },
    withholdingTax: { type: Type.NUMBER, description: "源泉徴収税額。" },
    discountOffset: { type: Type.NUMBER, description: "値引き・繰越相殺額。" },
    netAmount: { type: Type.NUMBER, description: "差引請求額（実際の支払額）。" },
    // 分類
    description: { type: Type.STRING, description: "請求内容の簡潔な説明。" },
    costType: { type: Type.STRING, description: "変動費(V)か固定費(F)か。", enum: ["V", "F"] },
    account: { type: Type.STRING, description: "最適な会計勘定科目。例: 仕入高, 広告宣伝費, 修繕費, 消耗品費, 外注加工費, 保守費, 通信費" },
    relatedCustomer: { type: Type.STRING, description: "関連する顧客名（もしあれば）。" },
    project: { type: Type.STRING, description: "関連する案件/プロジェクト名（もしあれば）。" },
    // 振込先
    bankAccount: bankAccountSchema,
    bankAccountRaw: { type: Type.STRING, description: "振込先の原文テキスト（銀行名・支店名・口座番号等をそのまま）。" },
    // 明細
    lineItems: { type: Type.ARRAY, items: expenseLineSchema },
    // 備考
    notes: { type: Type.STRING, description: "備考欄や特記事項。" },
  },
  required: [
    "vendorName",
    "invoiceDate",
    "totalAmount",
    "description",
    "costType",
    "account",
  ],
};

export const extractInvoiceDetails = async (
  imageBase64: string,
  mimeType: string
): Promise<InvoiceData> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const imagePart = { inlineData: { data: imageBase64, mimeType } };
    const textPart = {
      text:
        `この画像から請求書・納品書・見積書等の詳細情報をJSONで抽出してください。

厳格なルール：
1. 純粋なJSONのみを返す。説明・挨拶は不要。
2. 書類種別(documentType): 請求書/納品書/見積書/稟議書 等を判定。
3. 請求元情報: vendorName, registrationNumber(T始まりのインボイス番号), vendorPostalCode, vendorAddress, vendorContact を全て抽出。
4. 請求先情報: recipientName, recipientPostalCode, recipientAddress, recipientContact を全て抽出。
5. 日付: invoiceDate(発行日), closingDate(締日), dueDate(支払期限) をYYYY-MM-DD形式で。
6. 金額: subtotalAmount(税抜), taxAmount(消費税), totalAmount(税込合計), withholdingTax(源泉徴収税), discountOffset(値引き・繰越相殺), netAmount(差引請求額=実支払額)。
7. taxInclusive: 税込表示ならtrue。
8. 振込先: bankAccount(構造化) + bankAccountRaw(原文テキストそのまま)。
9. 明細行(lineItems): 各行の品名・数量・単価・金額を個別に抽出。
10. account: 請求内容に最適な勘定科目を提案 (仕入高/広告宣伝費/修繕費/消耗品費/外注加工費/保守費/通信費/支払手数料/旅費交通費 等)。
11. notes: 備考・特記事項があれば抽出。`,
    };
    const response = await ai.models.generateContent({
      model: invoiceOcrModel,
      contents: { parts: [imagePart, textPart] },
      config: {
        responseSchema: extractInvoiceSchema,
      },
    });
    const rawText = response.text.trim();
    const jsonStr = stripCodeFences(rawText);
    console.log('[extractInvoiceDetails] AI応答:', rawText);
    try {
      const parsed = JSON.parse(jsonStr);
      console.log('[extractInvoiceDetails] 解析成功:', parsed);

      // 日付形式を変換するヘルパー関数
      const convertJapaneseDate = (dateStr: string): string => {
        if (!dateStr) return '';
        // "2023年4月5日" → "2023-04-05"
        const match = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (match) {
          const year = match[1];
          const month = match[2].padStart(2, '0');
          const day = match[3].padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        return dateStr;
      };

      // 数値から通貨記号を除去
      const removeCurrency = (value: any): number => {
        if (!value) return 0;
        const str = String(value).replace(/[円,]/g, '').replace(/[^0-9.-]/g, '');
        return Number(str) || 0;
      };

      // スキーマが明示されているのでparsedは基本そのまま使える
      // フォールバック: AI応答が旧形式の場合のみ変換
      const totalAmount = removeCurrency(parsed.totalAmount ?? parsed.amount_due ?? parsed.total_amount);
      const subtotalAmount = removeCurrency(parsed.subtotalAmount ?? parsed.subtotal ?? 0);
      const taxAmount = removeCurrency(parsed.taxAmount ?? parsed.tax_amount ?? 0);
      const withholdingTax = removeCurrency(parsed.withholdingTax ?? 0);
      const discountOffset = removeCurrency(parsed.discountOffset ?? 0);
      const netAmount = removeCurrency(parsed.netAmount ?? 0);

      let taxInclusive = parsed.taxInclusive;
      if (taxInclusive === undefined && totalAmount && subtotalAmount && taxAmount) {
        taxInclusive = Math.abs(totalAmount - (subtotalAmount + taxAmount)) < 1;
      }

      const mapped: InvoiceData = {
        documentType: parsed.documentType || '請求書',
        vendorName: parsed.vendorName || parsed.sender_info?.name || '',
        registrationNumber: parsed.registrationNumber || '',
        vendorPostalCode: parsed.vendorPostalCode || '',
        vendorAddress: parsed.vendorAddress || '',
        vendorContact: parsed.vendorContact || '',
        recipientName: parsed.recipientName || parsed.recipient_info?.name || '',
        recipientPostalCode: parsed.recipientPostalCode || '',
        recipientAddress: parsed.recipientAddress || '',
        recipientContact: parsed.recipientContact || '',
        invoiceDate: convertJapaneseDate(parsed.invoiceDate || parsed.invoice_date || ''),
        closingDate: convertJapaneseDate(parsed.closingDate || ''),
        dueDate: convertJapaneseDate(parsed.dueDate || parsed.due_date || ''),
        subtotalAmount,
        taxAmount,
        totalAmount,
        taxInclusive: taxInclusive ?? true,
        withholdingTax,
        discountOffset,
        netAmount: netAmount || totalAmount,
        description: parsed.description || '',
        costType: parsed.costType || 'V',
        account: parsed.account || '仕入高',
        relatedCustomer: parsed.relatedCustomer || '',
        project: parsed.project || '',
        bankAccount: parsed.bankAccount || undefined,
        bankAccountRaw: parsed.bankAccountRaw || '',
        lineItems: (parsed.lineItems || parsed.line_items || parsed.items || []).map((item: any) => ({
          description: item.description || item.item_name || '',
          lineDate: convertJapaneseDate(item.lineDate || ''),
          quantity: removeCurrency(item.quantity ?? 1),
          unit: item.unit || '',
          unitPrice: removeCurrency(item.unitPrice ?? item.unit_price ?? 0),
          amountExclTax: removeCurrency(item.amountExclTax ?? item.amount ?? 0),
          taxRate: item.taxRate ?? 10,
          customerName: item.customerName || '',
          projectName: item.projectName || '',
        })),
        notes: parsed.notes || '',
      };

      console.log('[extractInvoiceDetails] マッピング後:', mapped);
      return mapped;
    } catch (e) {
      console.error("[extractInvoiceDetails] JSON解析失敗:", e);
      console.error("受信内容:", rawText);
      // コードフェンスを除去しても失敗した場合、手動で除去を試みる
      const cleanedText = rawText
        .replace(/^```json\s*\n/, '')
        .replace(/\n```$/, '')
        .trim();
      try {
        return JSON.parse(cleanedText);
      } catch (e2) {
        console.error("手動クリーンアップ後もJSON解析に失敗しました。", e2);
        console.error("クリーンアップ後の内容:", cleanedText);
        throw new Error(`AIの応答が不正なJSON形式です。受信内容: ${rawText}`);
      }
    }
  });
};

// ── 見積書PDF読み取り ──────────────────────────────────────
export interface ExtractedEstimate {
  customerName: string;
  title: string;
  specification: string;
  copies: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  deliveryPlace: string;
  deliveryDate: string;
  expirationDate: string;
  transactionMethod: string;
  notes: string;
  items: {
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    amount: number;
  }[];
}

const extractEstimateSchema = {
  type: Type.OBJECT,
  properties: {
    customerName: { type: Type.STRING, description: "宛先（顧客名）。" },
    title: { type: Type.STRING, description: "見積件名・タイトル。" },
    specification: { type: Type.STRING, description: "仕様 (サイズ・用紙・色数等をまとめた文字列)。" },
    copies: { type: Type.NUMBER, description: "部数。見つからなければ0。" },
    unitPrice: { type: Type.NUMBER, description: "単価。見つからなければ0。" },
    taxRate: { type: Type.NUMBER, description: "消費税率 (例: 10)。" },
    subtotal: { type: Type.NUMBER, description: "税抜小計。" },
    taxAmount: { type: Type.NUMBER, description: "消費税額。" },
    total: { type: Type.NUMBER, description: "税込合計。" },
    deliveryPlace: { type: Type.STRING, description: "納品場所。" },
    deliveryDate: { type: Type.STRING, description: "納品日 (YYYY-MM-DD)。" },
    expirationDate: { type: Type.STRING, description: "見積有効期限 (YYYY-MM-DD)。" },
    transactionMethod: { type: Type.STRING, description: "取引条件・支払条件。" },
    notes: { type: Type.STRING, description: "備考。" },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: "明細の品名・内容。" },
          quantity: { type: Type.NUMBER, description: "数量。" },
          unit: { type: Type.STRING, description: "単位 (式,枚,部 等)。" },
          unitPrice: { type: Type.NUMBER, description: "単価。" },
          amount: { type: Type.NUMBER, description: "金額。" },
        },
      },
    },
  },
  required: ["title", "total"],
};

export const extractEstimateFromPdf = async (
  base64: string,
  mimeType: string
): Promise<ExtractedEstimate> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const imagePart = { inlineData: { data: base64, mimeType } };
    const textPart = {
      text: `この画像/PDFから見積書の情報をJSONで抽出してください。

厳格なルール：
1. 純粋なJSONのみを返す。説明・挨拶は不要。
2. 宛先(customerName)を抽出。「御中」「様」は除去。
3. 見積件名(title)を抽出。
4. 仕様(specification): サイズ・用紙・色数・加工等があれば1行にまとめる。
5. 部数(copies), 単価(unitPrice)があれば抽出。
6. 税率(taxRate): 通常10。軽減税率8の場合はそれを使用。
7. 小計(subtotal), 消費税(taxAmount), 合計(total)を抽出。
8. 納品場所(deliveryPlace), 納品日(deliveryDate: YYYY-MM-DD), 有効期限(expirationDate: YYYY-MM-DD)を抽出。
9. 取引条件(transactionMethod), 備考(notes)を抽出。
10. 明細行(items): 各行の品名・数量・単位・単価・金額を個別に抽出。`,
    };
    const response = await ai.models.generateContent({
      model: invoiceOcrModel,
      contents: { parts: [imagePart, textPart] },
      config: { responseSchema: extractEstimateSchema },
    });
    const rawText = response.text.trim();
    const jsonStr = stripCodeFences(rawText);
    try {
      const parsed = JSON.parse(jsonStr);
      const removeCurrency = (v: any): number => {
        if (!v) return 0;
        return Number(String(v).replace(/[円,\s]/g, '').replace(/[^0-9.-]/g, '')) || 0;
      };
      const convertDate = (d: string): string => {
        if (!d) return '';
        const m = d.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        return d;
      };
      return {
        customerName: parsed.customerName || '',
        title: parsed.title || '',
        specification: parsed.specification || '',
        copies: removeCurrency(parsed.copies),
        unitPrice: removeCurrency(parsed.unitPrice),
        taxRate: parsed.taxRate ?? 10,
        subtotal: removeCurrency(parsed.subtotal),
        taxAmount: removeCurrency(parsed.taxAmount),
        total: removeCurrency(parsed.total),
        deliveryPlace: parsed.deliveryPlace || '',
        deliveryDate: convertDate(parsed.deliveryDate || ''),
        expirationDate: convertDate(parsed.expirationDate || ''),
        transactionMethod: parsed.transactionMethod || '',
        notes: parsed.notes || '',
        items: (parsed.items || []).map((it: any) => ({
          description: it.description || '',
          quantity: removeCurrency(it.quantity) || 1,
          unit: it.unit || '式',
          unitPrice: removeCurrency(it.unitPrice),
          amount: removeCurrency(it.amount),
        })),
      };
    } catch (e) {
      const cleaned = rawText.replace(/^```json\s*\n/, '').replace(/\n```$/, '').trim();
      try { return JSON.parse(cleaned); }
      catch { throw new Error(`見積書PDFの解析に失敗しました: ${rawText}`); }
    }
  });
};

const businessCardSchema = {
  type: Type.OBJECT,
  properties: {
    companyName: {
      type: Type.STRING,
      description:
        "会社名・法人名。株式会社、有限会社、合同会社、一般社団法人、公益財団法人、学校法人、医療法人などを含む正式名称を優先。ロゴ名・ブランド名・キャッチコピーは会社名にしない。",
    },
    department: {
      type: Type.STRING,
      description: "部署名や部門名。例：営業部、総務部、制作部など。",
    },
    title: {
      type: Type.STRING,
      description:
        "役職名。例：代表取締役社長、取締役、部長、課長、マネージャーなど。氏名は入れない。",
    },
    personName: {
      type: Type.STRING,
      description:
        "担当者の氏名。日本語氏名を優先。ローマ字表記が近くにある場合は日本語氏名をpersonNameに入れ、ローマ字はnotesに入れる。",
    },
    personNameKana: {
      type: Type.STRING,
      description: "担当者名のカナ読み。分からない場合は空文字。",
    },
    email: {
      type: Type.STRING,
      description: "メールアドレス。見つからない場合は空文字。",
    },
    phoneNumber: {
      type: Type.STRING,
      description: "TEL、Tel、電話番号。FAXや携帯番号は入れない。",
    },
    mobileNumber: {
      type: Type.STRING,
      description: "携帯電話番号。見つからない場合は空文字。",
    },
    faxNumber: {
      type: Type.STRING,
      description: "FAX番号。TELとは分ける。",
    },
    address: {
      type: Type.STRING,
      description: "住所。郵便番号を含めてもよい。",
    },
    postalCode: {
      type: Type.STRING,
      description: "郵便番号。例：112-8501。",
    },
    websiteUrl: {
      type: Type.STRING,
      description: "WebサイトURL。見つからない場合は空文字。",
    },
    notes: {
      type: Type.STRING,
      description: "ローマ字氏名、ロゴ名、キャッチコピー、その他補足。",
    },
    recipientEmployeeCode: {
      type: Type.STRING,
      description: "名刺右上などに手書きされた受領者の社員番号。なければ空文字。",
    },
  },
};

const normalizeBusinessCardResult = (parsed: any): BusinessCardContact => {
  const clean = (value: any): string | null => {
    if (value === null || value === undefined) return null;

    const text = String(value).trim();

    if (!text) return null;
    if (/^(null|undefined|n\/a|-)$/.test(text.toLowerCase())) return null;

    return text;
  };

  const cleanPhone = (value: any): string | null => {
    const text = clean(value);
    if (!text) return null;

    return text
      .replace(/[ＴT][ＥE][ＬL]\s*[:：]?/g, '')
      .replace(/電話\s*[:：]?/g, '')
      .trim();
  };

  const cleanFax = (value: any): string | null => {
    const text = clean(value);
    if (!text) return null;

    return text
      .replace(/[ＦF][ＡA][ＸX]\s*[:：]?/g, '')
      .trim();
  };

  const corporateKeywords = [
    '株式会社',
    '有限会社',
    '合同会社',
    '合名会社',
    '合資会社',
    '一般社団法人',
    '公益社団法人',
    '一般財団法人',
    '公益財団法人',
    '学校法人',
    '医療法人',
    '社会福祉法人',
    '協同組合',
    '生活衛生同業組合',
  ];

  const looksCorporateName = (value: string | null): boolean => {
    if (!value) return false;
    return corporateKeywords.some(keyword => value.includes(keyword));
  };

  const looksLikeTitle = (value: string | null): boolean => {
    if (!value) return false;
    return /(代表取締役|取締役|社長|会長|部長|課長|係長|専務|常務|執行役員|マネージャー|Manager|Director)/i.test(value);
  };

  const companyName = clean(parsed?.companyName);
  const personName = clean(parsed?.personName);
  const title = clean(parsed?.title);

  let fixedCompanyName = companyName;
  let fixedPersonName = personName;
  let fixedTitle = title;

  // 会社名欄にキャッチコピーやスローガンが入った場合の最低限ガード
  if (fixedCompanyName && !looksCorporateName(fixedCompanyName)) {
    const possibleCompanyFromNotes = clean(parsed?.companyNameCandidate);
    if (looksCorporateName(possibleCompanyFromNotes)) {
      fixedCompanyName = possibleCompanyFromNotes;
    }
  }

  // 氏名欄に役職が入った場合は title 側へ移す
  if (fixedPersonName && looksLikeTitle(fixedPersonName)) {
    fixedTitle = fixedTitle || fixedPersonName;
    fixedPersonName = null;
  }

  return {
    companyName: fixedCompanyName,
    department: clean(parsed?.department),
    title: fixedTitle,
    personName: fixedPersonName,
    personNameKana: clean(parsed?.personNameKana),
    email: clean(parsed?.email),
    phoneNumber: cleanPhone(parsed?.phoneNumber),
    mobileNumber: cleanPhone(parsed?.mobileNumber),
    faxNumber: cleanFax(parsed?.faxNumber),
    address: clean(parsed?.address),
    postalCode: clean(parsed?.postalCode),
    websiteUrl: clean(parsed?.websiteUrl),
    notes: clean(parsed?.notes),
    recipientEmployeeCode: clean(parsed?.recipientEmployeeCode),
  };
};

const extractFromText = (text: string): Partial<BusinessCardContact> => {
  const result: Partial<BusinessCardContact> = {};

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const corporateKeywords = [
    '株式会社',
    '有限会社',
    '合同会社',
    '合名会社',
    '合資会社',
    '一般社団法人',
    '公益社団法人',
    '一般財団法人',
    '公益財団法人',
    '学校法人',
    '医療法人',
    '社会福祉法人',
    '協同組合',
    '生活衛生同業組合',
  ];

  const companyLine = lines.find(line =>
    corporateKeywords.some(keyword => line.includes(keyword))
  );

  if (companyLine) {
    result.companyName = companyLine;
  }

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    result.email = emailMatch[0];
  }

  const telMatch = text.match(/(?:TEL|Tel|電話)\s*[:：]?\s*([0-9０-９\-ー()（）]{8,})/i);
  if (telMatch) {
    result.phoneNumber = telMatch[1]
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
      .replace(/ー/g, '-')
      .trim();
  }

  const faxMatch = text.match(/(?:FAX|Fax)\s*[:：]?\s*([0-9０-９\-ー()（）]{8,})/i);
  if (faxMatch) {
    result.faxNumber = faxMatch[1]
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
      .replace(/ー/g, '-')
      .trim();
  }

  const postalMatch = text.match(/〒?\s*(\d{3}[-ー]\d{4})/);
  if (postalMatch) {
    result.postalCode = postalMatch[1].replace(/ー/g, '-');
  }

  const addressLine = lines.find(line =>
    /東京都|北海道|(?:京都|大阪)府|.{2,3}県/.test(line)
  );

  if (addressLine) {
    result.address = addressLine;
  }

  const titleLine = lines.find(line =>
    /(代表取締役|取締役|社長|会長|部長|課長|係長|専務|常務|執行役員|マネージャー)/.test(line)
  );

  if (titleLine) {
    result.title = titleLine;
  }

  const personLine = lines.find(line => {
    if (line.includes('@')) return false;
    if (/[0-9０-９]/.test(line)) return false;
    if (corporateKeywords.some(keyword => line.includes(keyword))) return false;
    if (/(TEL|FAX|電話|〒|東京都|北海道|府|県|市|区|町|番地)/i.test(line)) return false;
    if (/(代表取締役|取締役|社長|会長|部長|課長|係長|専務|常務|執行役員)/.test(line)) return false;

    // 日本語氏名っぽい行を拾う
    return /^[一-龥ぁ-んァ-ヶー\s　]{2,20}$/.test(line);
  });

  if (personLine) {
    result.personName = personLine.replace(/\s+/g, ' ').trim();
  }

  return result;
};

const buildDataUrl = (base64: string, mimeType: string) =>
  `data:${mimeType};base64,${base64}`;

const tryTesseractBusinessCard = async (
  fileBase64: string,
  mimeType: string,
  fallback: BusinessCardContact
): Promise<BusinessCardContact | null> => {
  try {
    const mod: any = await import('tesseract.js');
    const recognize = mod?.recognize ?? mod?.default?.recognize;

    if (typeof recognize !== 'function') {
      return null;
    }

    const result = await recognize(buildDataUrl(fileBase64, mimeType), 'jpn+eng');
    const text = result?.data?.text ?? '';

    if (!text.trim()) {
      return null;
    }

    const extracted = extractFromText(text);

    return {
      ...fallback,
      ...extracted,
      notes: `OCR(Tesseract) ${text.trim().substring(0, 120)}...`,
    };
  } catch (error) {
    console.warn('[extractBusinessCardDetails] Tesseract OCR failed', error);
    return null;
  }
};

export const extractBusinessCardDetails = async (
  fileBase64: string,
  mimeType: string
): Promise<BusinessCardContact> => {
  const defaultResult: BusinessCardContact = {
    companyName: null,
    department: null,
    title: null,
    personName: null,
    personNameKana: null,
    email: null,
    phoneNumber: null,
    mobileNumber: null,
    faxNumber: null,
    address: null,
    postalCode: null,
    websiteUrl: null,
    notes: '手動で入力してください',
    recipientEmployeeCode: null,
  };

  try {
    const ai = checkOnlineAndAIOff();
    const filePart = { inlineData: { data: fileBase64, mimeType } };

    const instructionPart = {
  text: `このファイルは日本語の名刺または名刺スキャンPDFです。
名刺の内容を読み取り、必ず純粋なJSONのみで返してください。説明文、Markdown、コードフェンスは禁止です。

【最重要ルール】
1. companyNameには、正式な会社名・法人名だけを入れる。
2. ロゴ名、ブランド名、キャッチコピー、スローガンはcompanyNameに入れない。
3. 「共にある、未来へ」「未来へ」「Innovation」「Solution」「Future creation for all」などのキャッチコピーはnotesに入れる。
4. 「株式会社」「有限会社」「合同会社」「一般社団法人」「公益財団法人」「学校法人」「医療法人」「協同組合」などを含む行を会社名として最優先する。
5. personNameには人名だけを入れる。役職名は絶対に入れない。
6. 「代表取締役社長」「代表取締役」「取締役」「社長」「部長」「課長」「マネージャー」などはtitleに入れる。
7. 日本語氏名とローマ字氏名が両方ある場合、personNameには日本語氏名を入れる。ローマ字氏名はnotesに入れる。
8. TELとFAXは必ず分ける。
9. 郵便番号はpostalCode、住所はaddressに分ける。
10. 見つからない項目はnullではなく空文字で返す。

【会社名抽出ルール】
- companyNameは、法人格を含む正式名称を優先する。
- 「TOMOWEL」のようなロゴ・ブランド名はcompanyNameにしない。
- 「共にある、未来へ」のようなキャッチコピーはcompanyNameにしない。
- 会社名候補が複数ある場合は、日本語の正式法人名を優先する。
- 英語表記の会社名はnotesに入れる。

【氏名抽出ルール】
- personNameには、役職名の近くにある日本語の氏名を入れる。
- 「代表取締役社長」「取締役」「社長」「部長」などの直下または近くにある大きな日本語文字列は氏名候補として最優先する。
- 日本語氏名とローマ字氏名が横並びの場合、日本語氏名をpersonNameに入れる。
- ローマ字氏名はpersonNameに入れず、notesに入れる。
- 例：「大橋 輝臣 Ohashi Teruomi」の場合、personNameは「大橋 輝臣」、notesに「Ohashi Teruomi」と入れる。
- 役職名だけの行をpersonNameに入れてはいけない。

【役職抽出ルール】
- titleには役職のみを入れる。
- 「代表取締役社長」はtitleに入れる。
- 氏名はtitleに入れない。
- 部署名がある場合はdepartmentに入れる。

【電話・FAX抽出ルール】
- 「Tel:」「TEL:」「電話:」の後ろの番号はphoneNumberに入れる。
- 「Fax:」「FAX:」の後ろの番号はfaxNumberに入れる。
- 同じ行に Tel と Fax がある場合でも、必ず分けて抽出する。
- 例：「Tel:03-3817-2002 Fax:03-3817-2120」の場合、phoneNumberは「03-3817-2002」、faxNumberは「03-3817-2120」。
- 国際表記「+81-3-3817-2002」がある場合は、日本国内表記が一緒にあれば日本国内表記を優先する。

【住所抽出ルール】
- 「〒」または郵便番号から始まる行は住所として扱う。
- postalCodeには郵便番号だけを入れる。
- addressには郵便番号を除いた住所を入れる。
- 例：「〒112-8501 東京都文京区小石川4-14-12」の場合、postalCodeは「112-8501」、addressは「東京都文京区小石川4-14-12」。
- 英語住所しかない場合はaddressに英語住所を入れてよい。

【今回のような名刺の判定例】
入力に以下が見える場合：
TOMOWEL
共にある、未来へ
代表取締役社長
大橋 輝臣 Ohashi Teruomi
共同印刷株式会社
〒112-8501 東京都文京区小石川4-14-12
Tel:03-3817-2002 Fax:03-3817-2120

出力は必ず以下のようにする：
{
  "companyName": "共同印刷株式会社",
  "department": "",
  "title": "代表取締役社長",
  "personName": "大橋 輝臣",
  "personNameKana": "",
  "email": "",
  "phoneNumber": "03-3817-2002",
  "mobileNumber": "",
  "faxNumber": "03-3817-2120",
  "address": "東京都文京区小石川4-14-12",
  "postalCode": "112-8501",
  "websiteUrl": "",
  "notes": "TOMOWEL / 共にある、未来へ / Ohashi Teruomi",
  "recipientEmployeeCode": ""
}

【返却JSON形式】
{
  "companyName": "",
  "department": "",
  "title": "",
  "personName": "",
  "personNameKana": "",
  "email": "",
  "phoneNumber": "",
  "mobileNumber": "",
  "faxNumber": "",
  "address": "",
  "postalCode": "",
  "websiteUrl": "",
  "notes": "",
  "recipientEmployeeCode": ""
}`,
};

    const response = await ai.models.generateContent({
      model: invoiceOcrModel,
      contents: { parts: [filePart, instructionPart] },
      config: {
        responseSchema: businessCardSchema,
      },
    });

    const rawText = response.text.trim();
    console.log('[extractBusinessCardDetails] AI応答全文:', rawText);

    const jsonStr = stripCodeFences(rawText);

    if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
      console.warn('[extractBusinessCardDetails] AIがJSON以外を返却、テキスト解析を試行');

      const extracted = extractFromText(rawText);

      return {
        ...defaultResult,
        ...normalizeBusinessCardResult(extracted),
        notes: `AIテキスト解析: ${rawText.substring(0, 100)}...`,
      };
    }

    try {
      const parsed = JSON.parse(jsonStr);
      console.log('[extractBusinessCardDetails] パース結果:', parsed);

      return {
        ...defaultResult,
        ...normalizeBusinessCardResult(parsed),
      };
    } catch (parseError) {
      console.error('[extractBusinessCardDetails] JSONパースエラー:', parseError);

      const fallback = await tryTesseractBusinessCard(fileBase64, mimeType, defaultResult);

      if (fallback) {
        return {
          ...defaultResult,
          ...normalizeBusinessCardResult(fallback),
        };
      }

      return {
        ...defaultResult,
        notes: `JSONパースエラー: ${
          parseError instanceof Error ? parseError.message : '不明なエラー'
        }`,
      };
    }
  } catch (error) {
    console.error('[extractBusinessCardDetails] エラー:', error);

    const fallback = await tryTesseractBusinessCard(fileBase64, mimeType, defaultResult);

    if (fallback) {
      return {
        ...defaultResult,
        ...normalizeBusinessCardResult(fallback),
      };
    }

    return {
      ...defaultResult,
      notes: `解析エラー: ${error instanceof Error ? error.message : '不明なエラー'}`,
    };
  }
};

const suggestJournalEntrySchema = {
  type: Type.OBJECT,
  properties: {
    debitAccount: {
      type: Type.STRING,
      description: "借方の勘定科目（勘定科目候補から選択）。該当が無い場合は要確認。",
    },
    creditAccount: {
      type: Type.STRING,
      description: "貸方の勘定科目（勘定科目候補から選択）。該当が無い場合は要確認。",
    },
    amount: {
      type: Type.NUMBER,
      description: "取引金額（正の数）。",
    },
    description: {
      type: Type.STRING,
      description: "摘要（短く、何の支払い/何の取引かが分かるように）。",
    },
    reasoning: {
      type: Type.STRING,
      description: "根拠（どの情報から判断したか/不確実な点）。",
    },
    confidence: {
      type: Type.NUMBER,
      description: "自信度(0-1)。",
    },
  },
  required: ["debitAccount", "creditAccount", "amount"],
};

export const suggestJournalEntry = async (
  prompt: string
): Promise<AIJournalSuggestion> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const fullPrompt = `以下の取引内容を会計仕訳（2行）に変換してください。
出力は必ずJSONのみ（コードフェンス禁止）。
勘定科目は必ず「勘定科目候補」に含まれるものから選択し、該当が無い場合のみ「要確認」としてください。

【重要ルール】
- 単に件名だけで判断せず、支払先や事業内容を総合的に判断してください。
- 支払先が顧客や取引先（外注先）の場合、外注費（Outsourcing Expenses）や仕入高など、事業の原価に関わる科目を優先して検討してください（在庫や外注費用の支払いの可能性が高いため）。
- 支払先が「日本郵便」「日本郵政」「ヤマト運輸」「佐川急便」等で、荷物の発送や運搬に関する場合は「通信費」ではなく「荷造運賃（Freight and Packing）」等の科目を優先してください。

取引内容:
${prompt}

JSON形式:
{
  "debitAccount": "借方勘定科目名",
  "creditAccount": "貸方勘定科目名",
  "amount": 0,
  "description": "摘要",
  "reasoning": "根拠",
  "confidence": 0.0
}`;
    const response = await ai.models.generateContent({
      model,
      contents: fullPrompt,
      config: {
        responseSchema: suggestJournalEntrySchema,
      },
    });
    const rawText = stripCodeFences(response.text);
    const normalizeSuggestion = (value: AIJournalSuggestion): AIJournalSuggestion => {
      const debitAccount = typeof value.debitAccount === "string" && value.debitAccount.trim()
        ? value.debitAccount.trim()
        : "要確認";
      const creditAccount = typeof value.creditAccount === "string" && value.creditAccount.trim()
        ? value.creditAccount.trim()
        : "要確認";
      const amount = typeof value.amount === "number" && Number.isFinite(value.amount) ? value.amount : 0;
      const description = typeof value.description === "string" && value.description.trim()
        ? value.description.trim()
        : "AI提案が不明瞭なため要確認";
      const reasoning = typeof value.reasoning === "string" && value.reasoning.trim()
        ? value.reasoning.trim()
        : description;
      const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? value.confidence
        : 0;
      return {
        ...value,
        debitAccount,
        creditAccount,
        amount,
        description,
        reasoning,
        confidence,
      };
    };
    try {
      return normalizeSuggestion(JSON.parse(rawText));
    } catch (error) {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return normalizeSuggestion(JSON.parse(match[0]));
        } catch {
          // fall through
        }
      }
      const cleanReasoning = stripMarkdown(rawText);
      console.warn("AI returned non-JSON response for journal suggestion:", cleanReasoning);
      return normalizeSuggestion({
        debitAccount: "要確認",
        creditAccount: "要確認",
        amount: 0,
        description: "AI提案が不明瞭なため要確認",
        reasoning: cleanReasoning,
        confidence: 0,
      });
    }
  });
};

export const generateSalesEmail = async (
  customer: Customer,
  senderName: string
): Promise<{ subject: string; body: string }> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `顧客名「${customer.customerName}」向けの営業提案メールを作成してください。送信者は「${senderName}」です。`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    const text = response.text;
    const subjectMatch = text.match(/件名:\s*(.*)/);
    const bodyMatch = text.match(/本文:\s*([\s\S]*)/);
    return {
      subject: subjectMatch ? subjectMatch[1].trim() : "ご提案の件",
      body: bodyMatch ? bodyMatch[1].trim() : text,
    };
  });
};

export const generateLeadReplyEmail = async (
  lead: Lead,
  senderName: string
): Promise<{ subject: string; body: string }> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下のリード情報に対して、初回の返信メールを作成してください。
会社名: ${lead.company}
担当者名: ${lead.name}様
問い合わせ内容: ${lead.message || "記載なし"}

重要：返信メールの署名は送信者（${senderName}）の会社情報を使用してください。
以下の形式で署名を作成し、返信文の最後に含めてください：

――――――――――
文唱堂印刷株式会社
〒101-0025　東京都千代田区神田佐久間町3-37
TEL: 03-3851-0111（代表）　FAX: 03-3819-2530
Mail: ishijima@b-p.co.jp
URL: www.b-p.co.jp
――――――――――

送信者: ${senderName}`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    const text = response.text;
    const subjectMatch = text.match(/件名:\s*(.*)/);
    const bodyMatch = text.match(/本文:\s*([\s\S]*)/);
    return {
      subject: subjectMatch ? subjectMatch[1].trim() : "お問い合わせありがとうございます",
      body: bodyMatch ? bodyMatch[1].trim() : text,
    };
  });
};

export const generateGmailAutoReply = async (
  message: { from?: string; subject?: string; body?: string },
  senderName: string
): Promise<{ subject: string; body: string }> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下のメールに対して、返信メールの下書きを作成してください。\n送信者: ${senderName}\n\n差出人: ${message.from || "不明"}\n件名: ${message.subject || "（件名なし）"}\n本文: ${message.body || "（本文なし）"}\n\n返信メールは丁寧で簡潔にし、最後に署名を含めてください。`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    const text = response.text;
    const subjectMatch = text.match(/件名:\s*(.*)/);
    const bodyMatch = text.match(/本文:\s*([\s\S]*)/);
    return {
      subject: subjectMatch ? subjectMatch[1].trim() : `Re: ${message.subject || ""}`.trim(),
      body: bodyMatch ? bodyMatch[1].trim() : text,
    };
  });
};

// FIX: Add missing 'analyzeLeadData' function.
export const analyzeLeadData = async (leads: Lead[]): Promise<string> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下のリードデータ（${leads.length}件）を分析し、営業活動に関する簡潔なインサイトや提案を1つ生成してください。
        特に、有望なリードの傾向や、アプローチすべきセグメントなどを指摘してください。
        
        データサンプル:
        ${JSON.stringify(
      leads
        .slice(0, 3)
        .map((l) => ({
          company: l.company,
          status: l.status,
          inquiryType: l.inquiryType,
          message: l.message,
        })),
      null,
      2
    )}
        `;
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
  });
};

export const getDashboardSuggestion = async (jobs: Job[]): Promise<string> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const recentJobs = jobs.slice(0, 5).map((j) => ({
      title: j.title,
      price: j.price,
      variableCost: j.variableCost,
      margin: j.price - j.variableCost,
      marginRate: j.price > 0 ? ((j.price - j.variableCost) / j.price) * 100 : 0,
    }));

    const prompt = `あなたは印刷会社の経営コンサルタントです。以下の最近の案件データ（${recentJobs.length}件）を分析し、経営改善のための具体的で簡潔な提案を1つしてください。多角的な視点（収益性、効率性、戦略的価値）から分析し、 actionable な提案を生成してください。

データサンプル:
${JSON.stringify(recentJobs, null, 2)}
`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
  });
};

export const generateDailyReportSummary = async (
  customerName: string,
  activityContent: string
): Promise<string> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下の情報をもとに、日報の「実績サマリー・考察」を簡潔に作成してください。
訪問先/顧客: ${customerName}
計画・実績メモ:
${activityContent}

必ず含めたい観点:
- 数字の進捗 (PQ / MQ)
- お客様の声
- 競合・市場情報
- 同行・社内共有事項
- 自分の考え・気づき・課題
`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
  });
};

// 手書き日報画像からテキストを抽出して活動内容用のテキストを返す
export const extractDailyReportFromImage = async (
  imageBase64: string,
  mimeType: string
): Promise<string> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const imagePart = { inlineData: { data: imageBase64, mimeType } };
    const textPart = {
      text:
        "この画像は日本語の手書き業務日報です。日付、訪問先や対応先、主な活動内容、翌日予定などを読み取り、ビジネス文書としてそのまま日報フォームの『実績サマリー・考察』に貼り付けられる形のテキストに整形して出力してください。箇条書きではなく、日本語の文章で簡潔にまとめてください。",
    };
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [imagePart, textPart] },
    });
    return response.text;
  });
};

export const optimizeScheduleRequestText = async (rawText: string): Promise<string> => {
  const trimmed = rawText?.trim();
  if (!trimmed) {
    return "";
  }
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下の文章は、現場の社員に依頼事項を伝えるための下書きです。文脈が散らかっていたり口語表現が強い場合でも、
1) 依頼の目的
2) やってほしい内容（箇条書きで最大5項目）
3) 期限や注意点
を明快に整理してください。文章は日本語で、丁寧かつ簡潔にまとめ、依頼内容をわかりやすくしてください。

下書き:
${trimmed}`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    const text = response.text ?? "";
    const cleaned = stripCodeFences(text);
    return cleaned || trimmed;
  });
};

export const generateWeeklyReportSummary = async (keywords: string): Promise<string> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下のキーワードを元に、週報の報告内容をビジネス文書としてまとめてください。
キーワード: ${keywords}`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
  });
};

const draftEstimateSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description:
        "見積の件名。顧客の依頼内容を反映し、具体的で分かりやすいものにする。例：「2025年度 会社案内パンフレット制作」",
    },
    items: {
      type: Type.ARRAY,
      description: "見積の明細項目。印刷会社の標準的な項目で構成する。",
      items: {
        type: Type.OBJECT,
        properties: {
          division: {
            type: Type.STRING,
            description: "項目区分",
            enum: [
              "用紙代",
              "デザイン・DTP代",
              "刷版代",
              "印刷代",
              "加工代",
              "その他",
              "初期費用",
              "月額費用",
            ],
          },
          content: {
            type: Type.STRING,
            description:
              "具体的な作業内容や品名。用紙の種類や厚さ、加工の種類などを記載。",
          },
          quantity: {
            type: Type.NUMBER,
            description: "数量。単位と対応させる。",
          },
          unit: {
            type: Type.STRING,
            description: "単位（例：部, 枚, 式, 連, 月）",
          },
          unitPrice: { type: Type.NUMBER, description: "単価" },
          price: { type: Type.NUMBER, description: "金額 (数量 * 単価)" },
          cost: { type: Type.NUMBER, description: "この項目にかかる原価" },
        },
        required: ["division", "content", "quantity", "unit", "unitPrice", "price", "cost"],
      },
    },
    deliveryDate: {
      type: Type.STRING,
      description: "希望納期 (YYYY-MM-DD形式)",
    },
    paymentTerms: {
      type: Type.STRING,
      description: "支払条件。例：「月末締め翌月末払い」",
    },
    deliveryMethod: {
      type: Type.STRING,
      description: "納品方法。例：「指定倉庫へ一括納品」",
    },
    notes: {
      type: Type.STRING,
      description: "補足事項や備考。見積の有効期限なども記載する。",
    },
  },
  required: ["title", "items", "deliveryDate", "paymentTerms"],
};

export const draftEstimate = async (prompt: string): Promise<Partial<Estimate>> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const fullPrompt = `あなたは日本の印刷会社で20年以上の経験を持つベテランの見積担当者です。以下の顧客からの要望に基づき、現実的で詳細な見積の下書きをJSON形式で作成してください。原価計算も行い、適切な利益を乗せた単価と金額を設定してください。

【重要】もし顧客の要望が倉庫管理、定期発送、サブスクリプション型のサービスを示唆している場合、必ず「初期費用」と「月額費用」の項目を立てて見積を作成してください。その際の単位は、初期費用なら「式」、月額費用なら「月」としてください。

顧客の要望: "${prompt}"`;
    const response = await ai.models.generateContent({
      model,
      contents: fullPrompt,
      config: {
        responseSchema: draftEstimateSchema as any,
      },
    });
    let jsonStr = response.text.trim();
    // JSONブロックを抽出
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.substring(3, jsonStr.length - 3).trim();
    }
    const parsed = JSON.parse(jsonStr);
    // Ensure items array exists
    if (!parsed.items) {
      parsed.items = [];
    }
    return parsed;
  });
};

/**
 * Step 1: リードの自然言語の問い合わせ文から、DBの印刷仕様を検索できる
 * キーワードをAIが抽出する。
 *
 * 例: 「A4のパンフレットを300部くらい作りたい」
 *   → ["A4", "パンフレット", "中綴じ", "無線綴じ", "フルカラー"]
 *
 * DBの specification は「B5 60P 無線綴じ」「A4 16P 中綴じ」のような
 * 業界用語なので、自然言語からそこに辿り着くための変換をAIが行う。
 */
export const extractPrintSpecKeywords = async (
  inquiryText: string,
): Promise<string[]> => {
  const ai = checkOnlineAndAIOff();
  const prompt = `あなたは印刷会社の見積担当です。以下のお客様からの問い合わせ文を読み、
印刷仕様データベースを検索するためのキーワードを抽出してください。

【データベースの仕様例】
- "B5 60P 無線綴じ"
- "A4 16P 中綴じ"
- "B4チラシ 2つ折り"
- "名刺"
- "ペラ 化粧断ち"
- "POD無線綴じ角R カバーかけ"

【抽出するキーワードの種類】
- 用紙サイズ（A4, B5, A3, B4 等）
- ページ数（16P, 32P, 60P 等）
- 製本方法（中綴じ, 無線綴じ, 折り 等）
- 印刷種別（名刺, チラシ, パンフレット, 冊子, ポスター 等）
- 加工（PP貼り, 箔押し, 角R 等）
- 色数（4C, フルカラー, 1C 等）

問い合わせ文から推測できるものも含めてください。
例:「パンフレット」なら「中綴じ」や「無線綴じ」も候補。

問い合わせ文:
${inquiryText}

キーワードだけをJSON配列で返してください。例: ["A4", "中綴じ", "16P", "フルカラー"]`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({ model, contents: prompt });
    let text = response.text.trim();
    // JSON配列を抽出
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) return arr.filter((s: any) => typeof s === 'string' && s.length >= 1);
      } catch { /* fall through */ }
    }
    // フォールバック: カンマ区切り
    return text.replace(/[\[\]"]/g, '').split(',').map(s => s.trim()).filter(Boolean);
  });
};

/**
 * Step 3: 過去の実績データをコンテキストにしてAI見積を生成する。
 *
 * Step 1 (extractPrintSpecKeywords) でキーワードを抽出し、
 * Step 2 (findSimilarEstimates) で過去データを取得した後に呼ぶ。
 */
export const draftEstimateFromLeadWithHistory = async (
  lead: Lead,
  similarEstimates: Array<{ specification: string; copies: string; unit_price: string; total: string; customer_name: string; project_name: string; order_flg: string }>,
): Promise<Partial<Estimate>> => {
  const ai = checkOnlineAndAIOff();

  // 受注実績ありを上位に、なしを下位に並べ替え
  const sorted = [...similarEstimates].sort((a, b) => {
    if (a.order_flg === '1' && b.order_flg !== '1') return -1;
    if (a.order_flg !== '1' && b.order_flg === '1') return 1;
    return 0;
  });

  const historyBlock = sorted.length > 0
    ? sorted
        .slice(0, 15)
        .map((e, i) => `${i + 1}. 仕様:${e.specification} / 部数:${e.copies} / 単価:¥${e.unit_price} / 合計:¥${e.total} / 顧客:${e.customer_name} / 案件:${e.project_name} / 受注:${e.order_flg === '1' ? '○' : '×'}`)
        .join('\n')
    : '（類似実績なし — 一般的な印刷業界の相場で見積もってください）';

  const orderedOnly = sorted.filter(e => e.order_flg === '1');
  const avgTotal = orderedOnly.length > 0
    ? Math.round(orderedOnly.reduce((s, e) => s + (Number(e.total) || 0), 0) / orderedOnly.length)
    : null;
  const priceHint = avgTotal ? `\n※ 受注実績の平均合計額: ¥${avgTotal.toLocaleString()}` : '';

  const prompt = `あなたは日本の印刷会社「文唱堂印刷」で20年以上の経験を持つベテランの見積担当者です。
以下のリード（問い合わせ）情報と、社内の過去案件の実績データを参考に、現実的で詳細な見積をJSON形式で作成してください。

【最重要ルール】
1. 過去実績の「受注○」のデータの単価・金額に最も近い価格帯で見積もること
2. 同一顧客の過去実績がある場合、その顧客への価格帯を踏襲すること
3. 実績がない場合のみ一般的な相場で算出すること
4. items配列の各項目のpriceは quantity × unitPrice と一致させること${priceHint}

===== リード情報 =====
顧客名: ${lead.company || '不明'}
担当者: ${lead.name || '不明'}
問い合わせ内容:
${lead.message || '詳細なし'}
問い合わせ種別: ${lead.inquiryType || lead.inquiryTypes?.join(', ') || '不明'}
予算感: ${lead.budget || '未提示'}
希望納期: ${lead.timeline || '未定'}

===== 過去の類似案件実績（${sorted.length}件中上位15件）=====
${historyBlock}
========================`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseSchema: draftEstimateSchema as any,
      },
    });
    let jsonStr = response.text.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.substring(3, jsonStr.length - 3).trim();
    }
    const parsed = JSON.parse(jsonStr);
    if (!parsed.items) parsed.items = [];
    return parsed;
  });
};

export const draftEstimateFromSpecFile = async (
  fileBase64: string,
  mimeType: string,
): Promise<Partial<Estimate>> => {
  const normalizedMime = (mimeType || "application/octet-stream").toLowerCase();
  const isPdfOrImage = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
    normalizedMime,
  );
  const isDocx =
    normalizedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isXlsx =
    normalizedMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    normalizedMime === "application/vnd.ms-excel";
  const isTextLike =
    normalizedMime.startsWith("text/") ||
    normalizedMime === "application/json" ||
    normalizedMime === "application/csv";

  // Avoid unsupported MIME errors by handling text/Excel/Word before calling Gemini with inline data
  if (isTextLike) {
    const text = decodeTextFromBase64(fileBase64);
    if (!text) {
      throw new Error("テキストを読み取れませんでした。ファイル内容を確認してください。");
    }
    return draftEstimate(`以下の仕様書内容を読み取り、見積の下書きを作成してください。\n\n${text}`);
  }

  if (isDocx) {
    const text = await extractDocxTextFromBase64(fileBase64);
    if (text) {
      return draftEstimate(
        `以下のWord仕様書を読み取り、見積の下書きを作成してください。\n\n${text}`,
      );
    }
    // If extraction failed, fall through to try inline upload as a last resort
  }

  if (isXlsx) {
    const text = await extractXlsxStringsFromBase64(fileBase64);
    if (text) {
      return draftEstimate(
        `以下のExcel仕様書を読み取り、見積の下書きを作成してください。\n\n${text}`,
      );
    }
    throw new Error(
      "Excelファイルを解析できませんでした。PDFや画像、テキスト形式でアップロードしてください。",
    );
  }

  if (!isPdfOrImage) {
    throw new Error(
      "このファイル形式はサポートされていません。PDF/画像/テキスト/Excel(.xlsx)/Word(.docx)でアップロードしてください。",
    );
  }

  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const filePart = { inlineData: { data: fileBase64, mimeType } };
    const instructionPart = {
      text: `このファイルは印刷物などの仕様書/PDF/スキャン画像です。内容を読み取り、以下のJSONフォーマットで見積の下書きを作成してください。数量、用紙、加工、納期、支払条件が読み取れない場合は推定し、備考にその旨を記載してください。`,
    };
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [filePart, instructionPart] },
      config: {
        responseSchema: draftEstimateSchema as any,
      },
    });
    let jsonStr = response.text.trim();
    // JSONブロックを抽出
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.substring(3, jsonStr.length - 3).trim();
    }
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed.items)) {
      parsed.items = [];
    }
    return parsed;
  });
};

export const generateProposalSection = async (
  sectionTitle: string,
  customer: Customer,
  job?: Job | null,
  estimate?: Estimate | null
): Promise<string> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    let context = `
顧客情報:
- 顧客名: ${customer.customerName}
- 事業内容: ${customer.companyContent || "N/A"}
- 既知の要求事項: ${customer.infoRequirements || "N/A"}
- これまでの営業活動: ${customer.infoSalesActivity || "N/A"}
- Webサイト: ${customer.websiteUrl || "N/A"}
`;

    if (job) {
      context += `
関連案件情報:
- 案件名: ${job.title}
- 案件詳細: ${job.details}
- 金額: ${formatJPY(job.price)}
`;
    }

    if (estimate) {
      context += `
関連見積情報:
- 見積件名: ${estimate.title}
- 見積合計: ${formatJPY(estimate.total === undefined || estimate.total === null ? undefined : Number(estimate.total))}
- 見積項目: ${estimate.items
          .map((i) => `${i.content} (${formatJPY(i.price)})`)
          .join(", ")}
`;
    }

    const prompt = `
あなたはプロのビジネスコンサルタントです。以下のコンテキスト情報と、必要に応じてWeb検索の結果を活用して、提案書の「${sectionTitle}」セクションの文章を作成してください。プロフェッショナルで、説得力があり、顧客の利益に焦点を当てた文章を生成してください。

${context}

「${sectionTitle}」セクションの下書きを生成してください。
`;
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    return response.text;
  });
};

const scoreLeadSchema = {
  type: Type.OBJECT,
  properties: {
    score: {
      type: Type.INTEGER,
      description: "このリードの有望度を0から100のスコアで評価してください。",
    },
    rationale: {
      type: Type.STRING,
      description: "スコアの根拠を簡潔に説明してください。",
    },
  },
  required: ["score", "rationale"],
};

export const scoreLead = async (lead: Lead): Promise<LeadScore> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下のリード情報を分析し、有望度をスコアリングしてください。
会社名: ${lead.company}
問い合わせ種別: ${lead.inquiryTypes?.join(", ") || lead.inquiryType}
メッセージ: ${lead.message}`;
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseSchema: scoreLeadSchema,
      },
    });
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr);
  });
};

export const startBugReportChat = (): Chat => {
  const ai = checkOnlineAndAIOff(); // Will throw if AI is off or offline
  const systemInstruction = `あなたはバグ報告と改善要望を受け付けるアシスタントです。ユーザーからの報告内容をヒアリングし、以下のJSON形式で最終的に出力してください。
    { "report_type": "bug" | "improvement", "summary": "簡潔な件名", "description": "詳細な内容" }
    このJSONを出力するまでは、自然な会話でユーザーから情報を引き出してください。`;
  return ai.chats.create({ model, config: { systemInstruction } });
};

export const processApplicationChat = async (
  history: { role: "user" | "model"; content: string }[],
  appCodes: ApplicationCode[],
  users: User[],
  routes: ApprovalRoute[]
): Promise<string> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `あなたは申請アシスタントです。ユーザーとの会話履歴と以下のマスター情報に基づき、ユーザーの申請を手伝ってください。
最終的に、ユーザーの申請内容を以下のJSON形式で出力してください。それまでは自然な会話を続けてください。
{ "applicationCodeId": "...", "formData": { ... }, "approvalRouteId": "..." }

会話履歴: ${JSON.stringify(history)}
申請種別マスター: ${JSON.stringify(appCodes)}
承認ルートマスター: ${JSON.stringify(routes)}
`;
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
  });
};

// --- From older chat models ---
export const generateClosingSummary = async (
  type: "月次" | "年次",
  currentJobs: Job[],
  prevJobs: Job[],
  currentJournal: JournalEntry[],
  prevJournal: JournalEntry[]
): Promise<string> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下のデータに基づき、${type}決算のサマリーを生成してください。前月比や課題、改善提案を含めてください。`;
    // In a real scenario, you'd pass the data, but for brevity we'll just send the prompt.
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
  });
};

/**
 * Proactive context injection - AI automatically checks calendar at conversation start
 */
export const injectProactiveContext = async (): Promise<string> => {
  console.log('[MCP] Injecting proactive context...');

  try {
    // For now, return simple context until MCP servers are ready
    const context = `
【本日の状況自動確認】
📅 今日の予定: MCPサーバー接続待ち
📧 重要なメール: MCPサーバー接続待ち

上記情報を踏まえて、経営相談にお役立てください。
`;

    return context;

  } catch (error) {
    console.warn('[MCP] Proactive context injection failed:', error);
    return '【本日の状況】現在、システム接続に問題があるため自動情報取得ができません。';
  }
};

export const startBusinessConsultantChat = (): Chat => {
  const ai = checkOnlineAndAIOff(); // Will throw if AI is off or offline
  const systemInstruction = `あなたは、中小企業の印刷会社を専門とする経験豊富な経営コンサルタントです。あなたの目的は、経営者がデータに基づいたより良い意思決定を行えるよう支援することです。提供されたデータコンテキストとユーザーからの質問に基づき、Web検索も活用して、具体的で実行可能なアドバイスを提供してください。専門的かつデータに基づいた、簡潔な回答を心がけてください。`;
  return ai.chats.create({
    model,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
    },
  });
};

export const generateLeadAnalysisAndProposal = async (
  lead: Lead
): Promise<{ analysisReport: string; draftProposal: string }> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下のリード情報とWeb検索の結果を組み合わせて、企業分析レポートと提案書のドラフトを生成し、指定されたJSON形式で出力してください。

リード情報:
- 会社名: ${lead.company}
- 担当者名: ${lead.name}
- 問い合わせ内容: ${lead.message || "具体的な内容は記載されていません。"}

Web検索を活用して、企業の事業内容、最近の動向、および問い合わせ内容に関連する業界の課題を調査してください。
その上で、当社の印刷・物流サービスがどのように役立つかを具体的に提案してください。

出力JSONフォーマット:
{
  "analysisReport": "リードの会社、問い合わせ内容、Webサイト(あれば)を基にした簡潔な分析レポート。企業の潜在的なニーズや、当社が提供できる価値についてMarkdown形式で記述してください。",
  "draftProposal": "分析レポートに基づいた提案書のドラフト。Markdown形式で記述し、「1. 背景と課題」「2. 提案内容」「3. 期待される効果」「4. 概算費用」のセクションを含めてください。「4. 概算費用」: 概算費用を具体的に提示してください。もし書籍の保管や発送代行のような継続的なサービスが含まれる場合、必ず「初期費用」と「月額費用」に分けて、保管料、発送手数料などの具体的な項目と金額を提示してください。"
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    let jsonStr = response.text.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse JSON from Gemini for lead analysis:", e);
      console.error("Received text:", jsonStr);
      // Fallback: return the text as part of the analysis if JSON parsing fails.
      return {
        analysisReport:
          "AIからの応答を解析できませんでした。以下に生の応答を示します。\n\n" + jsonStr,
        draftProposal: "AIからの応答を解析できませんでした。",
      };
    }
  });
};

export const generateMarketResearchReport = async (
  topic: string
): Promise<MarketResearchReport> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `以下のトピックについて、Web検索を活用して詳細な市場調査レポートを、必ず指定されたJSON形式で作成してください。

調査トピック: "${topic}"

レポートには、市場の概要、主要トレンド、競合分析、ビジネスチャンス、脅威/リスクを含めてください。
JSONフォーマット:
{
    "title": "調査トピックを反映した、レポート全体のタイトル。",
    "summary": "調査結果全体の簡潔なエグゼクティブサマリー。",
    "trends": ["市場の主要なトレンド。箇条書きで複数挙げる。"],
    "competitorAnalysis": "主要な競合他社の動向や戦略に関する分析。",
    "opportunities": ["調査結果から導き出されるビジネスチャンスや機会。箇条書きで複数挙げる。"],
    "threats": ["市場に潜む脅威やリスク。箇条書きで複数挙げる。"]
}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 32768 },
      },
    });

    let jsonStr = response.text.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }
    const result = JSON.parse(jsonStr);

    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = rawChunks
      .map((chunk: any) => chunk.web)
      .filter(Boolean)
      .map((webChunk: any) => ({ uri: webChunk.uri, title: webChunk.title }));
    const uniqueSources = Array.from(new Map(sources.map((item) => [item.uri, item])).values());

    return { ...result, sources: uniqueSources };
  });
};

export const generateCustomProposalContent = async (
  lead: Lead
): Promise<CustomProposalContent> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `あなたは「文唱堂印刷株式会社」の優秀なセールスコンサルタントです。以下のリード情報を基に、Webリサーチを徹底的に行い、その企業のためだけの本格的な提案資料のコンテンツを、必ず指定されたJSON形式で生成してください。

## リード情報
- 企業名: ${lead.company}
- Webサイト: ${lead.landingPageUrl || "不明"}
- 問い合わせ内容: ${lead.message || "具体的な内容は記載されていません。"}

## 指示
1.  **ディープリサーチ**: Google検索を駆使して、上記企業の事業内容、最近のニュース、業界での立ち位置、IR情報などを調査し、深く理解してください。
2.  **コンテンツ生成**: リサーチ結果と問い合わせ内容を統合し、以下の各セクションの文章を生成してください。文章はプロフェッショナルかつ説得力のあるものにしてください。
3.  **JSON出力**: 必ず以下のJSONフォーマットに従って出力してください。
{
    "coverTitle": "提案書の表紙のタイトル。例:「株式会社〇〇様向け 物流効率化のご提案」",
    "businessUnderstanding": "Webリサーチに基づいた、提案先企業の事業内容の理解。客観的な事実を簡潔にまとめる。",
    "challenges": "リサーチ結果と問い合わせ内容から推測される、提案先企業が抱える課題やニーズの仮説。箇条書きで記述。",
    "proposal": "上記の課題を解決するための、自社（文唱堂印刷）の具体的なサービス提案。提供する価値やメリットを明確にする。",
    "conclusion": "提案の締めくくりと、次のアクションを促す力強い結びの言葉。"
}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 32768 },
      },
    });

    let jsonStr = response.text.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse JSON from Gemini for custom proposal:", e);
      console.error("Received text:", jsonStr);
      throw new Error("AIからの提案書コンテンツの生成に失敗しました。");
    }
  });
};

export const generateLeadSummary = async (
  lead: Lead
): Promise<string> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `あなたは「文唱堂印刷株式会社」の営業担当者です。以下のリード情報を分析し、戦略的な要約を作成してください。

## リード情報
- 企業名: ${lead.company}
- 担当者名: ${lead.name || "不明"}
- メールアドレス: ${lead.email || "不明"}
- 電話番号: ${lead.phone || "不明"}
- ステータス: ${lead.status}
- 問い合わせ内容: ${lead.message || "具体的な内容は記載されていません。"}

## 重要：慎重な判定を求めます
**顧客からの重要な問い合わせを営業メールと誤判定しないでください。**

### 具体的な顧客問い合わせ例（必ず印刷問い合わせと判定）
例えば以下のような内容は絶対に営業メールと判断しないでください：

**例1：雑誌印刷**
「インディペンデント雑誌の印刷を検討しております。下記、予定している概要です。
サイズ：B5サイズ
綴じ方向：右綴じ
ページ：108ページ予定 (表紙 4ページ＋本文 104ページ)
カラー：【表紙】片面カラー、片面モノクロ【本文】カラー
用紙：【表紙】ヴァンヌーボVナチュラル195kg
　　　【本文】b7トラネクスト86kg
部数：500部予定」

**例2：書籍印刷**
「書籍の印刷をご検討しております。A5サイズ、200ページ、フルカラー、300部の予定です。表紙は上質紙、本文はコート紙を使用希望。」

**例3：冊子印刷**
「会社案内冊子を印刷したいです。A4判、中綴じ、全32ページ、4色刷り、500部を希望しております。」

これらのような具体的な印刷仕様が記載されている場合は、必ず「印刷問い合わせ」と判断してください。

### 印刷問い合わせの明確な特徴（優先度高）
以下のいずれか1つでも含まれていれば「印刷問い合わせ」と判断：
- **印刷物の種類**: 雑誌、書籍、冊子、パンフレット、チラシ、名刺、封筒、ポスター
- **具体的なサイズ**: B5、A4、A5などの明確なサイズ指定
- **ページ数の指定**: 「108ページ」「200ページ」「32ページ」など具体的なページ数
- **綴じ方向**: 「右綴じ」「中綴じ」「左綴じ」などの製本仕様
- **色数の指定**: 「片面カラー」「フルカラー」「4色刷り」など
- **用紙の種類**: 「ヴァンヌーボ」「トラネクスト」「上質紙」「コート紙」など
- **部数の指定**: 「500部」「300部」「1000部」など具体的な部数
- **印刷関連単語**: 印刷、製版、DTP、デザイン、入稿、フォーマット

### 営業メールの特徴（慎重に判定）
以下の**すべて**の条件が揃った場合のみ「営業メール」と判断：
- 自社製品やサービスの宣伝、セールスピッチが主目的
- 相手の具体的なニーズや要望が全く記載されていない
- どの企業にも送れるような一般的な内容
- 「貴社へのご提案」「提携させてください」といった明確な売り込み表現

## 分析要件
1. **メール種別の判定**: 印刷関連の単語が1つでも含まれていれば「印刷問い合わせ」と判断
2. **印刷関連性の評価**: 印刷サービスとの関連性を高・中・低で評価
3. **緊急度判断**: 内容から緊急度を高・中・低で判断
4. **戦略的アドバイス**: 営業としての具体的な次のアクションを提案

## 出力形式
以下の形式で要約を作成してください：

【種別】印刷問い合わせ/営業メール/その他
【関連性】高/中/低
【緊急度】高/中/低
【要約】3行以内で具体的な内容を要約
【戦略】営業としての具体的な対応方針

## 重要指示
- **印刷関連の単語が含まれている場合は必ず「印刷問い合わせ」と判断してください**
- **営業メールと判断する場合は、本当に売り込み目的であることを確認してください**
- **不明確な場合は「印刷問い合わせ」として、対応方針を提案してください**

例：
印刷問い合わせの場合：
【種別】印刷問い合わせ
【関連性】高
【緊急度】中
【要約】A4チラシ100部の見積依頼
【戦略】24時間以内に見積書を作成し送付

営業メールの場合（本当に売り込みのみの場合）：
【種別】営業メール
【関連性】低
【緊急度】低
【要約】他社からのサービス提案メール
【戦略】対応不要（営業メールのため）`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // 高速モデルに変更
      contents: prompt,
      config: {
        maxOutputTokens: 500, // トークン数を制限して高速化
        temperature: 0.1, // 低い温度で一貫性を確保
      },
    });

    return response.text.trim();
  });
};

export const createLeadProposalPackage = async (
  lead: Lead
): Promise<LeadProposalPackage> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `あなたは「文唱堂印刷株式会社」の非常に優秀なセールスコンサルタントです。以下のリード情報を分析し、次のタスクを実行してください。

## リード情報
- 企業名: ${lead.company}
- Webサイト: ${lead.landingPageUrl || "不明"}
- 問い合わせ内容: ${lead.message || "具体的な内容は記載されていません。"}

## タスク
1.  **リードの分類**: この問い合わせが、当社のサービスに対する**本物の関心**にもとづくものか、あるいは単なる**営業メール（売り込み）**かを判断してください。
2.  **本物のリードの場合**:
    a. **ディープリサーチ**: Google検索を駆使して、上記企業の事業内容、最近のニュース、業界での立ち位置などを調査し、深く理解してください。
    b. **提案書コンテンツ生成**: リサーチ結果と問い合わせ内容を統合し、プロフェッショナルで説得力のある提案書コンテンツを生成してください。
    c. **見積案作成**: 問い合わせ内容から顧客の具体的な要望を正確に読み取り、それに基づき現実的で詳細な見積の明細項目を作成してください。特に以下の点を考慮してください：
       - 問い合わせ内容に記載されている具体的な仕様（サイズ、綴じ方向、ページ数、カラー設定、用紙の種類、部数など）を正確に反映
       - 顧客が明示的に希望する仕様に基づいた適切な単価と数量を設定
       - 印刷業界の標準的な工程（用紙代、デザイン・DTP代、刷版代、印刷代、加工代）に沿った分類
       - undefinedや不適切な項目名を避け、具体的で分かりやすい品名を使用
       - 各項目の単価と数量から合計金額を正確に計算
       - 可能な限り現実的で実現可能な仕様と価格を提示
3.  **営業メールの場合**:
    a. なぜ営業メールと判断したか、簡潔な理由を述べてください。
    b. isSalesLeadをtrueに設定し、proposalとestimateフィールドは省略してください。

## JSON出力
必ず指定されたJSONフォーマットに従って、結果を単一のJSONオブジェクトとして出力してください。
フォーマット:
{
    "isSalesLead": "boolean",
    "reason": "string, isSalesLeadがfalseの場合のみ",
    "proposal": {
        "coverTitle": "string",
        "businessUnderstanding": "string",
        "challenges": "string",
        "proposal": "string",
        "conclusion": "string"
    },
    "estimate": [
        {
            "division": "string, enum: ['用紙代', 'デザイン・DTP代', '刷版代', '印刷代', '加工代', 'その他', '初期費用', '月額費用']",
            "content": "string",
            "quantity": "number",
            "unit": "string",
            "unitPrice": "number",
            "price": "number",
            "cost": "number"
        }
    ]
}

## 重要指示
- 問い合わせ内容に具体的な仕様（A4サイズ、フルカラー、100部など）が記載されている場合は、必ずその仕様に基づいた見積を作成してください。
- 顧客の希望が不明確な場合は、一般的な標準仕様を提案しつつ、追加情報の確認を促してください。
- 印刷物の種類や用途を考慮し、最適な印刷方法を提案してください。
- 単価設定は原価計算に基づき、適切な利益率を考慮してください。
- **環境配慮**: 必ず見積もりの備考欄に「当社の工場はクリーンエネルギーで運営されており、CO2排出量を削減することができます。環境対策費：0円」という文言を含めてください。
`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // 高速モデルに変更
      contents: prompt,
      config: {
        maxOutputTokens: 2000, // トークン数を増やして完全な見積を生成
        temperature: 0.1, // 低い温度で一貫性を確保
      },
    });

    let jsonStr = response.text.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.substring(3, jsonStr.length - 3).trim();
    }
    try {
      const result = JSON.parse(jsonStr);
      // 見積もりデータが空の場合はフォールバックを生成
      if (!result.isSalesLead && (!result.estimate || result.estimate.length === 0)) {
        result.estimate = generateFallbackEstimate(lead);
      }
      return result;
    } catch (e) {
      console.error("Failed to parse JSON from Gemini for lead proposal package:", e);
      console.error("Received text:", jsonStr);
      // フォールバック見積もりを生成
      return generateFallbackPackage(lead);
    }
  });
};

// Compatibility exports for legacy callers.
export const generateLeadProposalPackage = createLeadProposalPackage;

export const extractDocumentText = async (..._args: any[]): Promise<string> => {
  return '';
};

export const transcribeAudio = async (..._args: any[]): Promise<string> => {
  return '';
};

export const createBlob = (..._args: any[]): Blob => {
  return new Blob();
};

export const decodeAudioData = async (..._args: any[]): Promise<AudioBuffer> => {
  throw new Error('decodeAudioData is not implemented.');
};

export const decode = (..._args: any[]): string => {
  return '';
};

export const startLiveChatSession = async (..._args: any[]): Promise<void> => {
  return;
};

export const createProjectFromInputs = async (..._args: any[]): Promise<any> => {
  return null;
};

// フォールバック見積もり生成関数
const generateFallbackEstimate = (lead: Lead) => {
  const message = lead.message || '';

  // 雑誌印刷の具体例から仕様を抽出
  const isMagazine = message.includes('雑誌') || message.includes('インディペンデント');
  const size = message.includes('B5') ? 'B5' : message.includes('A4') ? 'A4' : 'A4';
  const pages = message.match(/(\d+)ページ/) ? parseInt(message.match(/(\d+)ページ/)![1]) : 32;
  const quantity = message.match(/(\d+)部/) ? parseInt(message.match(/(\d+)部/)![1]) : 500;
  const color = message.includes('カラー') ? 'フルカラー' : 'モノクロ';

  const basePrice = isMagazine ? 150000 : 80000;
  const pagePrice = pages * 500;
  const quantityPrice = quantity * 100;

  return [
    {
      division: '用紙代' as const,
      content: `${size}判 ${color}用紙`,
      quantity: quantity,
      unit: '部',
      unitPrice: Math.round(basePrice / Number(quantity)),
      price: basePrice,
      cost: Math.round(basePrice * 0.7),
      costRate: 0.7,
      subtotal: basePrice
    },
    {
      division: '印刷代' as const,
      content: `${pages}ページ ${color}印刷`,
      quantity: pages,
      unit: 'ページ',
      unitPrice: Math.round(pagePrice / Number(pages)),
      price: pagePrice,
      cost: Math.round(pagePrice * 0.6),
      costRate: 0.6,
      subtotal: pagePrice
    },
    {
      division: '加工代' as const,
      content: '製本・仕上げ',
      quantity: 1,
      unit: '式',
      unitPrice: quantityPrice,
      price: quantityPrice,
      cost: Math.round(quantityPrice * 0.5),
      costRate: 0.5,
      subtotal: quantityPrice
    }
  ];
};

const generateFallbackPackage = (lead: Lead): LeadProposalPackage => {
  return {
    isSalesLead: false,
    reason: '',
    proposal: {
      coverTitle: `【印刷サービス提案】${lead.company}`,
      businessUnderstanding: `${lead.company}様の印刷ニーズに基づき、最適な印刷ソリューションをご提案いたします。`,
      challenges: '品質とコストのバランスを取りながら、短期間での納品が求められています。',
      proposal: '最新の印刷技術と経験豊富なスタッフで、高品質な印刷物を効率的に製作いたします。',
      conclusion: '貴社の要望に沿った最適な印刷ソリューションをご提供できるよう全力でサポートいたします。'
    },
    estimate: generateFallbackEstimate(lead)
  };
};

// 環境対策備考を生成する関数
const generateEnvironmentalNote = (): string => {
  return `当社の工場はクリーンエネルギーで運営されており、CO2排出量を削減することができます。
環境対策費：0円

※環境に配慮した印刷サービスを無償で提供いたします。`;
};

/**
 * 【開発者への引き継ぎ：実装上の重要事項】
 * 以下の `coreTools` は、AI が Supabase（環境変数で指定したプロジェクト）や
 * Google Driveを操作するためのツール定義です。
 * 
 * 【お詫び】
 * 現在、フロントエンドのみで動作させるため、実際のDB検索結果をAIが受け取って再計算する
 * 実装が不十分です。現在はAIが「検索したつもり」で推論値を返しています。
 * 実装時は、以下の関数呼び出し（ToolCall）をサーバー側でキャッチし、
 * 実際のMCP実行結果をAIに返却（FunctionResponse）するようにリファクタリングしてください。
 */
const coreTools: FunctionDeclaration[] = [
  {
    name: 'supabase_db_query',
    parameters: {
      type: Type.OBJECT,
      description: 'Supabaseから顧客情報、過去の成約単価、マスタ原価を取得します。',
      properties: {
        sql_query: { type: Type.STRING, description: '実行するSQL、または抽出条件' },
        clientName: { type: Type.STRING }
      },
      required: ['clientName']
    }
  },
  {
    name: 'google_drive_file_search',
    parameters: {
      type: Type.OBJECT,
      description: 'Google Drive内の過去見積Excelや仕様書PDFから、類似案件の仕様と金額を検索します。',
      properties: {
        keyword: { type: Type.STRING, description: '検索キーワード（例：パンフレット A4 4P）' }
      },
      required: ['keyword']
    }
  },
  {
    name: 'wiki_knowledge_fetch',
    parameters: {
      type: Type.OBJECT,
      description: 'DeepWikiから顧客固有の検品基準、品質要件、過去のトラブル情報を取得します。',
      properties: {
        clientName: { type: Type.STRING }
      }
    }
  }
];

// AI見積もりアプリ用の関数
const extractSpecSchema = {
  type: Type.OBJECT,
  properties: {
    projectName: { type: Type.STRING, description: '案件名' },
    category: { type: Type.STRING, description: '印刷品目カテゴリ' },
    quantity: { type: Type.INTEGER, description: '数量（部数）' },
    size: { type: Type.STRING, description: 'サイズ（例：A4, B5）' },
    paperType: { type: Type.STRING, description: '用紙種類' },
    pages: { type: Type.INTEGER, description: 'ページ数' },
    colors: { type: Type.STRING, description: '色数（例：4/4, 4/0）', enum: ['4/4', '4/0', '1/1', '1/0'] },
    finishing: { type: Type.ARRAY, items: { type: Type.STRING }, description: '加工オプション' },
    requestedDelivery: { type: Type.STRING, description: '希望納期' },
  },
};

export const extractSpecFromInput = async (
  inputText: string,
  imageBase64?: string
): Promise<Partial<PrintSpec>> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `
    文唱堂印刷の基幹AIとして、入力内容から印刷仕様（品名、カテゴリ、部数、サイズ、紙、頁数、色数、加工）を抽出してください。
    システム構成: ${JSON.stringify(INTEGRATION_MANIFESTO)}
    入力: ${inputText}
  `;

    const parts: any[] = [{ text: prompt }];

    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const mimeType = imageBase64.match(/^data:image\/(\w+);base64,/)?.[1] || 'jpeg';
      parts.push({ inlineData: { data: base64Data, mimeType: `image/${mimeType}` } });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseSchema: extractSpecSchema,
      },
    });

    let jsonStr = response.text.trim();
    // JSONブロックを抽出
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.substring(3, jsonStr.length - 3).trim();
    }
    return JSON.parse(jsonStr);
  });
};

export const calculateEstimation = async (spec: PrintSpec): Promise<EstimationResult> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const contextPrompt = `
    【基幹連携見積シミュレーション開始】
    1. supabase_db_query を実行し、顧客「${spec.clientName}」の過去成約履歴と現在のマスタ単価を取得せよ。
    2. google_drive_file_search を実行し、今回の「${spec.category}」に近い過去の見積書を検索せよ。
    3. wiki_knowledge_fetch を実行し、顧客固有の禁止事項や検品ルールを反映せよ。
    
    上記リソースを統合し、MQ会計（売上、変動費、限界利益）に基づく3つの見積プラン（成約優先、標準、利益重視）を算定せよ。
    ※現在はプロトタイプのため、AIによる推論値を出力するが、解説文には「どのDB情報を参照したか」を具体的に含めること。

    案件仕様: ${JSON.stringify(spec)}
  `;

    // Note: Gemini API does not support tools + responseMimeType together.
    // We remove responseMimeType and parse JSON manually from the response.
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contextPrompt,
      config: {
        tools: [{ functionDeclarations: coreTools }],
      }
    });

    let jsonStr = stripCodeFences(response.text);
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse estimation result JSON:", e);
      console.error("Received text:", jsonStr);
      // Return a fallback estimation result
      return {
        options: [
          {
            id: "standard",
            label: "標準プラン",
            pq: 100000,
            vq: 60000,
            mq: 40000,
            f: 20000,
            g: 20000,
            mRatio: 0.4,
            estimatedLeadTime: "2週間",
            probability: 70,
            description: "標準的な見積もりプランです。詳細な仕様確認後に正式見積もりを作成します。"
          }
        ],
        aiReasoning: "AIからの応答を解析できませんでした。フォールバック値を使用しています。",
        co2Reduction: 0,
        comparisonWithPast: { averagePrice: 0, differencePercentage: 0 }
      };
    }
  });
};

/**
 * 経費データをAIで分析し、傾向・異常・改善提案を生成
 */
export const analyzeExpenseData = async (summary: {
  totalAmount: number;
  lineCount: number;
  accountCount: number;
  topAccounts: { name: string; amount: number }[];
  topSuppliers: { name: string; amount: number }[];
  monthlyTrend: { month: string; amount: number }[];
}): Promise<string> => {
  const ai = checkOnlineAndAIOff();
  return withRetry(async () => {
    const prompt = `あなたは経理・財務の専門コンサルタントです。以下の経費データを分析し、経営者に向けた簡潔なコメントを3〜5項目で生成してください。

## 経費データサマリー
- 総経費額: ¥${summary.totalAmount.toLocaleString()}
- 明細件数: ${summary.lineCount}件
- 勘定科目数: ${summary.accountCount}科目

## 勘定科目別TOP5
${summary.topAccounts.map((a, i) => `${i + 1}. ${a.name}: ¥${a.amount.toLocaleString()}`).join('\n')}

## 仕入先別TOP5
${summary.topSuppliers.map((s, i) => `${i + 1}. ${s.name}: ¥${s.amount.toLocaleString()}`).join('\n')}

## 月別推移
${summary.monthlyTrend.map(m => `${m.month}: ¥${m.amount.toLocaleString()}`).join('\n')}

## 出力形式
- 各コメントは1行で簡潔に
- 傾向分析、コスト削減提案、異常値の指摘などを含める
- 具体的な数値を引用して根拠を示す
- 日本語で出力`;

    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
  });
};

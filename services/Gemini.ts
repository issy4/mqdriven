import { GoogleGenAI, Type } from '@google/genai';
import type { QuoteFormData, QuoteResultData } from '../types';
import type { TranscriptEntry, SummaryData, MeetingContext } from '../types/meetingAssistant';

const summarizeValue = (value: unknown) => {
  if (!value) return 'missing';
  if (typeof value === 'string') return `present (${value.length} chars)`;
  return 'present (non-string)';
};

const readLocalStorageValue = (key: string): string | undefined => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return undefined;
  if (typeof window.localStorage.getItem !== 'function') return undefined;
  const val = window.localStorage.getItem(key);
  return val === null ? undefined : val;
};

const readWindowEnvValue = (key: string): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const win = window as any;
  if (win.__ENV && win.__ENV[key] !== undefined) return win.__ENV[key];
  if (win[key] !== undefined) return win[key];
  if (win.process?.env && win.process.env[key] !== undefined) return win.process.env[key];
  return undefined;
};

const resolveEnvValue = (key: string): string | undefined => {
  const fromWindow = readWindowEnvValue(key);
  if (fromWindow !== undefined) return fromWindow;

  const fromLocalStorage =
    readLocalStorageValue(key) ||
    (key === 'VITE_GEMINI_API_KEY' ? readLocalStorageValue('GEMINI_API_KEY') ?? readLocalStorageValue('API_KEY') : undefined);
  if (fromLocalStorage !== undefined) return fromLocalStorage;

  // Check Vite environment variables first (development / Vite build-time)
  if (typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined') {
    const envValue = (import.meta.env as Record<string, string | undefined>)[key];
    if (envValue !== undefined) return envValue;
  }
  // Check process.env (fallback for server / Node usage)
  if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
    return process.env[key];
  }
  return undefined;
};

const logGeminiEnvDebug = () => {
  const hasWindow = typeof window !== 'undefined';
  const windowEnv = hasWindow ? (window as any).__ENV ?? {} : {};
  const importEnv = typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined' ? import.meta.env : {};
  const processEnv = typeof process !== 'undefined' ? process.env ?? {} : {};
  const localStorageKeys =
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
      ? Object.keys(window.localStorage as Record<string, unknown>)
      : [];

  console.log('[Gemini] Env debug', {
    hasWindow,
    windowEnvKeys: Object.keys(windowEnv),
    importMetaEnvKeys: typeof importEnv === 'object' ? Object.keys(importEnv as any) : [],
    processEnvKeys: Object.keys(processEnv),
    localStorageKeys,
    keyPresence: {
      windowViteGemini: summarizeValue(readWindowEnvValue('VITE_GEMINI_API_KEY')),
      windowGemini: summarizeValue(readWindowEnvValue('GEMINI_API_KEY')),
      importViteGemini: summarizeValue((importEnv as any)?.VITE_GEMINI_API_KEY),
      importGemini: summarizeValue((importEnv as any)?.GEMINI_API_KEY),
      importApi: summarizeValue((importEnv as any)?.API_KEY),
      processGemini: summarizeValue((processEnv as any)?.GEMINI_API_KEY),
      localViteGemini: summarizeValue(readLocalStorageValue('VITE_GEMINI_API_KEY')),
      localGemini: summarizeValue(readLocalStorageValue('GEMINI_API_KEY')),
    },
    aiFlags: {
      VITE_AI_OFF: resolveEnvValue('VITE_AI_OFF') ?? null,
      VITE_IS_AI_DISABLED: resolveEnvValue('VITE_IS_AI_DISABLED') ?? null,
      NEXT_PUBLIC_AI_OFF: resolveEnvValue('NEXT_PUBLIC_AI_OFF') ?? null,
    },
  });
};

const shouldLogGeminiEnv = (() => {
  const raw =
    resolveEnvValue('VITE_DEBUG_GEMINI_ENV') ??
    resolveEnvValue('DEBUG_GEMINI_ENV') ??
    '';
  const flag = String(raw).toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
})();

if (shouldLogGeminiEnv) {
  logGeminiEnvDebug();
}

const aiOffRaw =
  resolveEnvValue('VITE_AI_OFF') ??
  resolveEnvValue('NEXT_PUBLIC_AI_OFF') ??
  resolveEnvValue('AI_OFF') ??
  '0';

export const isGeminiAIDisabled = aiOffRaw === '1' || aiOffRaw.toLowerCase?.() === 'true';

const GEMINI_API_KEY =
  resolveEnvValue('VITE_GEMINI_API_KEY') ??
  resolveEnvValue('NEXT_PUBLIC_GEMINI_API_KEY') ??
  resolveEnvValue('GEMINI_API_KEY') ??
  resolveEnvValue('API_KEY') ??
  '';

if (!GEMINI_API_KEY && !isGeminiAIDisabled) {
  console.error('Gemini APIキーが設定されていません。AI機能を利用するにはAPIキーが必要です。');
  console.error('チェックした環境変数:');
  console.error('- VITE_GEMINI_API_KEY:', resolveEnvValue('VITE_GEMINI_API_KEY') ? '***SET***' : 'NOT SET');
  console.error('- NEXT_PUBLIC_GEMINI_API_KEY:', resolveEnvValue('NEXT_PUBLIC_GEMINI_API_KEY') ? '***SET***' : 'NOT SET');
  console.error('- GEMINI_API_KEY:', resolveEnvValue('GEMINI_API_KEY') ? '***SET***' : 'NOT SET');
  console.error('- API_KEY:', resolveEnvValue('API_KEY') ? '***SET***' : 'NOT SET');
  console.error('- AI_OFF:', aiOffRaw);
}

export const GEMINI_DEFAULT_MODEL =
  resolveEnvValue('VITE_GEMINI_MODEL') ??
  resolveEnvValue('NEXT_PUBLIC_GEMINI_MODEL') ??
  'gemini-3.6-flash';

export const GEMINI_OCR_MODEL =
  resolveEnvValue('VITE_GEMINI_OCR_MODEL') ??
  resolveEnvValue('NEXT_PUBLIC_GEMINI_OCR_MODEL') ??
  resolveEnvValue('GEMINI_OCR_MODEL') ??
  'gemini-3.6-flash';

// Vertex AI endpoints reject API keys, so we default to the standard Google AI endpoint here.
export const geminiClient = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

export const requireGeminiClient = (): GoogleGenAI => {
  if (!geminiClient) {
    throw new Error('Gemini APIキーが設定されていません。');
  }
  return geminiClient;
};

export { resolveEnvValue };

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    pq: { type: Type.NUMBER },
    vq: { type: Type.NUMBER },
    mq: { type: Type.NUMBER },
    profitMargin: { type: Type.NUMBER },
    costBreakdown: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { item: { type: Type.STRING }, cost: { type: Type.NUMBER } },
        required: ["item", "cost"]
      }
    },
    formalItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          qty: { type: Type.NUMBER },
          unit: { type: Type.STRING },
          unitPrice: { type: Type.NUMBER },
          amount: { type: Type.NUMBER }
        },
        required: ["name", "qty", "unit", "unitPrice", "amount"]
      }
    },
    internalNotes: { type: Type.STRING },
    estimatedProductionDays: { type: Type.NUMBER },
    logisticsInfo: { type: Type.STRING },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] }
  },
  required: ["pq", "vq", "mq", "profitMargin", "costBreakdown", "formalItems", "internalNotes", "estimatedProductionDays", "logisticsInfo", "confidence"]
};

export const processAIQuote = async (formData: QuoteFormData): Promise<QuoteResultData> => {
  const ai = requireGeminiClient();
  const model = GEMINI_DEFAULT_MODEL;

  let parts: any[] = [];
  if (formData.imageInput) {
    parts.push({ inlineData: { data: formData.imageInput.split(',')[1], mimeType: "image/jpeg" } });
    parts.push({ text: `この画像から仕様を解析し、請求性質「${formData.mainCategory}」として積算してください。目標利益率は${formData.markup}%。` });
  } else if (formData.rawInput) {
    parts.push({ text: `以下の依頼テキストから積算してください。性質:${formData.mainCategory}, 目標利益率:${formData.markup}%\n\n${formData.rawInput}` });
  } else {
    parts.push({ text: `以下の詳細仕様で積算してください。性質:${formData.mainCategory}, 目標利益率:${formData.markup}%\n\n${JSON.stringify(formData)}` });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts }],
    config: {
      systemInstruction: "あなたは総合印刷会社の熟練積算部長です。PQ(売価)=VQ(原価)+MQ(粗利)の整合性を保ち、日本の商慣習に即した精密な見積をJSONで返してください。第三種郵便や発送費などの特殊な原価項目も考慮してください。",
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    }
  });

  return JSON.parse(response.text.trim()) as QuoteResultData;
};

export const updateQuoteWithFeedback = async (instruction: string, currentData: QuoteResultData): Promise<QuoteResultData> => {
  const ai = requireGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_DEFAULT_MODEL,
    contents: [{ parts: [{ text: `現在の積算データ: ${JSON.stringify(currentData)}\n\n修正指示: ${instruction}\n\nこの指示に基づきデータを再計算し、JSONで返してください。` }] }],
    config: {
      systemInstruction: "あなたは積算修正のプロです。整合性を保ちながら指定の修正を行い、新しい積算結果をJSONで返してください。",
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    }
  });
  return JSON.parse(response.text.trim()) as QuoteResultData;
};

// Transcription functions
export const transcribeMedia = async (
  base64Data: string,
  mimeType: string,
  context: MeetingContext,
  onProgress?: (msg: string) => void
): Promise<{ transcript: TranscriptEntry[] }> => {
  const ai = requireGeminiClient();
  onProgress?.("AI文字起こしエンジン（Pro）を起動中...");

  const cleanMimeType = mimeType.split(';')[0];
  const contextInfo = `議題: ${context.topic}\n参加者: ${context.attendees}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash", // より安定したモデルに変更
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType: cleanMimeType } },
          {
            text: `あなたはプロの議事録作成者です。以下の会議コンテキストに基づき、提供された音声を精査して文字起こしを生成してください。
            
            【会議コンテキスト】
            ${contextInfo}

            【出力ルール】
            - フィラー（えー、あのー等）は完全に除去する。
            - タイムスタンプ（MM:SS）を必ず含める。
            - 応答は必ず純粋な JSON 形式 [ { "timestamp": "MM:SS", "text": "..." } ] で出力してください。`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              timestamp: { type: Type.STRING },
              text: { type: Type.STRING }
            },
            required: ["timestamp", "text"]
          }
        }
      }
    });

    const rawText = response.text;
    if (!rawText) throw new Error("AIからの応答が空です。");

    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : rawText;

    return { transcript: JSON.parse(jsonStr.trim()) };
  } catch (error: any) {
    const errorMsg = error.message || "";
    if (errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED") || errorMsg.includes("leaked")) {
      throw new Error("AUTH_REQUIRED: APIキーが無効です。セキュリティ保護のため、新しいキーを選択してください。");
    }
    throw new Error(`文字起こし失敗: ${error.message}`);
  }
};

export const generateSummary = async (
  transcript: TranscriptEntry[],
  context: MeetingContext,
  onProgress?: (msg: string) => void
): Promise<SummaryData> => {
  const ai = requireGeminiClient();
  onProgress?.("会議内容の構造化要約を生成中...");
  const fullText = transcript.map(t => `[${t.timestamp}] ${t.text}`).join("\n");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash", // より安定したモデルに変更
      contents: {
        parts: [{
          text: `以下の文字起こしから、決定事項とネクストアクションを抽出したビジネス議事録を作成してください。
          議題: ${context.topic}
          内容:\n${fullText}`
        }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            overview: { type: Type.STRING },
            decisions: { type: Type.ARRAY, items: { type: Type.STRING } },
            keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            nextActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            atmosphere: { type: Type.STRING }
          },
          required: ["title", "overview", "decisions", "keyPoints", "nextActions", "atmosphere"]
        }
      }
    });

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : response.text);
  } catch (error: any) {
    throw new Error(`要約エラー: ${error.message}`);
  }
};

// Quantum Print Estimator Pro Functions
const PRINT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    pq: { type: Type.NUMBER },
    vq: { type: Type.NUMBER },
    mq: { type: Type.NUMBER },
    profitMargin: { type: Type.NUMBER },
    costBreakdown: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { item: { type: Type.STRING }, cost: { type: Type.NUMBER } },
        required: ["item", "cost"]
      }
    },
    formalItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          qty: { type: Type.NUMBER },
          unit: { type: Type.STRING },
          unitPrice: { type: Type.NUMBER },
          amount: { type: Type.NUMBER }
        },
        required: ["name", "qty", "unit", "unitPrice", "amount"]
      }
    },
    internalNotes: { type: Type.STRING },
    estimatedProductionDays: { type: Type.NUMBER },
    logisticsInfo: { type: Type.STRING },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] }
  },
  required: ["pq", "vq", "mq", "profitMargin", "costBreakdown", "formalItems", "internalNotes", "estimatedProductionDays", "logisticsInfo", "confidence"]
};

export const processPrintQuote = async (formData: any): Promise<any> => {
  const ai = requireGeminiClient();
  const model = GEMINI_DEFAULT_MODEL;

  let parts: any[] = [];
  if (formData.imageInput) {
    parts.push({ inlineData: { data: formData.imageInput.split(',')[1], mimeType: "image/jpeg" } });
    let prompt = `この画像から仕様を解析し、請求性質「${formData.mainCategory}」として積算してください。目標利益率は${formData.markup}%。`;
    if (formData.fixedPrice) {
      prompt += `\n\n**重要**: この案件には顧客/ランク契約に基づく固定単価 ${formData.fixedPrice}円 が設定されています。PQ単価はこの値を絶対とし、それに合わせて原価(VQ)や粗利(MQ)を逆算・調整して整合性を取ってください。`;
    }
    parts.push({ text: prompt });
  } else if (formData.rawInput) {
    let prompt = `以下の依頼テキストから積算してください。性質:${formData.mainCategory}, 目標利益率:${formData.markup}%\n\n${formData.rawInput}`;
    if (formData.fixedPrice) {
      prompt += `\n\n**重要**: この案件には顧客/ランク契約に基づく固定単価 ${formData.fixedPrice}円 が設定されています。PQ単価はこの値を絶対とし、それに合わせて原価(VQ)や粗利(MQ)を逆算・調整して整合性を取ってください。`;
    }
    parts.push({ text: prompt });
  } else {
    let prompt = `以下の詳細仕様で積算してください。性質:${formData.mainCategory}, 目標利益率:${formData.markup}%\n\n${JSON.stringify(formData)}`;
    if (formData.fixedPrice) {
      prompt += `\n\n**重要**: この案件には顧客/ランク契約に基づく固定単価 ${formData.fixedPrice}円 が設定されています。PQ単価はこの値を絶対とし、それに合わせて原価(VQ)や粗利(MQ)を逆算・調整して整合性を取ってください。`;
    }
    parts.push({ text: prompt });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts }],
    config: {
      systemInstruction: "あなたは総合印刷会社の熟練積算部長です。PQ(売価)=VQ(原価)+MQ(粗利)の整合性を保ち、日本の商慣習に即した精密な見積をJSONで返してください。第三種郵便や発送費などの特殊な原価項目も考慮してください。",
      responseMimeType: "application/json",
      responseSchema: PRINT_RESPONSE_SCHEMA,
    }
  });

  return JSON.parse(response.text.trim());
};

export const updatePrintQuoteWithFeedback = async (instruction: string, currentData: any): Promise<any> => {
  const ai = requireGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_DEFAULT_MODEL,
    contents: [{ parts: [{ text: `現在の積算データ: ${JSON.stringify(currentData)}\n\n修正指示: ${instruction}\n\nこの指示に基づきデータを再計算し、JSONで返してください。` }] }],
    config: {
      systemInstruction: "あなたは積算修正のプロです。整合性を保ちながら指定の修正を行い、新しい積算結果をJSONで返してください。",
      responseMimeType: "application/json",
      responseSchema: PRINT_RESPONSE_SCHEMA,
    }
  });
  return JSON.parse(response.text.trim());
};

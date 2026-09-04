import { getSupabase, getSupabaseFunctionHeaders } from './supabaseClient';

type GenerateRequest = {
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
};

type ProxyResponse = {
  text?: string;
  candidates?: unknown[];
  usageMetadata?: Record<string, unknown>;
};

const invokeGenerate = async (request: GenerateRequest): Promise<any> => {
  const supabase = getSupabase();
  const headers = await getSupabaseFunctionHeaders(supabase);
  const { data, error } = await supabase.functions.invoke<ProxyResponse>('gemini-generate', {
    body: { request },
    headers,
  });

  if (error) throw new Error(`Gemini中継APIの呼出しに失敗しました: ${error.message}`);
  if (!data) throw new Error('Gemini中継APIから応答がありません。');
  return data;
};

const toRequest = (modelConfig: any, input: any): GenerateRequest => ({
  model: modelConfig.model,
  contents: input.contents ?? input,
  config: {
    ...(modelConfig.config ?? {}),
    ...(input.config ?? input.generationConfig ?? {}),
    ...(modelConfig.tools ? { tools: modelConfig.tools } : {}),
    ...(input.tools ? { tools: input.tools } : {}),
    ...(modelConfig.systemInstruction ? { systemInstruction: modelConfig.systemInstruction } : {}),
  },
});

const legacyResult = (data: any) => ({
  response: {
    ...data,
    text: () => data.text ?? '',
  },
});

export const geminiProxyClient: any = {
  models: {
    generateContent: invokeGenerate,
    generateImages: async () => {
      throw new Error('画像生成は安全なサーバー中継へ未移行のため現在利用できません。');
    },
  },
  getGenerativeModel: (modelConfig: any) => ({
    generateContent: async (input: any) => legacyResult(await invokeGenerate(toRequest(modelConfig, input))),
    startChat: ({ history = [] }: { history?: any[] } = {}) => ({
      sendMessage: async (message: string) => {
        const contents = [...history, { role: 'user', parts: [{ text: message }] }];
        return legacyResult(await invokeGenerate(toRequest(modelConfig, { contents })));
      },
    }),
  }),
  chats: {
    create: ({ model, config, history = [] }: any) => ({
      sendMessage: async ({ message }: any) => {
        const text = typeof message === 'string' ? message : message?.message ?? '';
        const contents = [...history, { role: 'user', parts: [{ text }] }];
        return invokeGenerate({ model, contents, config });
      },
    }),
  },
  live: {
    connect: async () => {
      throw new Error('Gemini Liveは長期キーをブラウザへ公開しない方式へ未移行のため現在利用できません。');
    },
  },
};

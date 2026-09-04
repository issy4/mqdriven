import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const ALLOWED_ORIGINS = new Set([
  'https://erp.b-p.co.jp',
  'https://mqdriven-jt6c06djb-bp-5f70f10d.vercel.app',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);
const ALLOWED_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
]);

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://erp.b-p.co.jp',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

const json = (origin: string | null, status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(origin, 405, { error: 'Method not allowed' });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(origin, 403, { error: 'Origin not allowed' });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GEMINI_API_KEY) {
    return json(origin, 503, { error: 'Server-side AI configuration is incomplete' });
  }

  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) return json(origin, 401, { error: 'Authentication required' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return json(origin, 401, { error: 'Invalid session' });

  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > 12 * 1024 * 1024) return json(origin, 413, { error: 'Request is too large' });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(origin, 400, { error: 'Invalid JSON' });
  }

  const request = payload?.request;
  const model = String(request?.model ?? '');
  if (!ALLOWED_MODELS.has(model)) return json(origin, 400, { error: `Model is not allowed: ${model}` });
  if (!request?.contents) return json(origin, 400, { error: 'contents is required' });

  const config = request.config ?? {};
  const geminiBody: Record<string, unknown> = {
    contents: typeof request.contents === 'string'
      ? [{ role: 'user', parts: [{ text: request.contents }] }]
      : request.contents,
  };
  if (config.systemInstruction) {
    geminiBody.systemInstruction = typeof config.systemInstruction === 'string'
      ? { parts: [{ text: config.systemInstruction }] }
      : config.systemInstruction;
  }
  const generationConfig = { ...config };
  delete generationConfig.systemInstruction;
  delete generationConfig.tools;
  if (Object.keys(generationConfig).length) geminiBody.generationConfig = generationConfig;
  if (config.tools) geminiBody.tools = config.tools;

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GEMINI_API_KEY },
      body: JSON.stringify(geminiBody),
    },
  );
  const data = await upstream.json();
  if (!upstream.ok) {
    console.error('[gemini-generate] upstream error', upstream.status, data?.error?.status ?? 'unknown');
    return json(origin, upstream.status, { error: data?.error?.message ?? 'Gemini request failed' });
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? '')
    .join('') ?? '';
  return json(origin, 200, { ...data, text });
});

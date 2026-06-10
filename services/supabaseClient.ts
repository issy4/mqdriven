import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase接続情報の解決順:
//   1. import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (最優先)
//   2. 既存の supabaseCredentials.ts があればフォールバック (任意・存在しなくてもOK)
//
// 注意: ここではフロントエンドで安全な anon (public) key のみを使用する。
//       service_role key や secret key は絶対にフロント側で参照しないこと。

const PLACEHOLDER_HINTS = ['ここにURLを貼り付け', 'ここにキーを貼り付け'];

const isPlaceholder = (value: string | undefined | null): boolean => {
    if (!value) return true;
    return PLACEHOLDER_HINTS.some((hint) => value.includes(hint));
};

// 1. Vite 環境変数を最優先で読む
const envUrl =
    typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_SUPABASE_URL as string | undefined) : undefined;
const envKey =
    typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) : undefined;

// 2. 既存の supabaseCredentials.ts があればフォールバックとして読む。
//    ファイルが存在しない場合でもビルドが壊れないよう import.meta.glob を使う。
let fallbackUrl: string | undefined;
let fallbackKey: string | undefined;
try {
    const credentialModules =
        typeof import.meta !== 'undefined' && typeof import.meta.glob === 'function'
            ? (import.meta.glob('../supabaseCredentials.ts', { eager: true }) as Record<string, any>)
            : {};
    const credentials = Object.values(credentialModules)[0];
    if (credentials) {
        fallbackUrl = credentials.SUPABASE_URL;
        fallbackKey = credentials.SUPABASE_KEY;
    }
} catch {
    // supabaseCredentials.ts が存在しない場合は無視してフォールバックなしで続行する。
}

export const SUPABASE_URL = (envUrl || fallbackUrl || '').trim();
export const SUPABASE_KEY = (envKey || fallbackKey || '').trim();

const MISSING_CREDENTIALS_MESSAGE =
    'Supabaseの接続情報が設定されていません。環境変数 VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。';

let supabase: SupabaseClient | null = null;

// 新しい接続情報でSupabaseクライアントを初期化する関数
export const initializeSupabase = (url: string, key: string): SupabaseClient | null => {
    try {
        if (!url || !key || isPlaceholder(url) || isPlaceholder(key)) {
            console.warn(
                'Supabase URL or Key is missing or is a placeholder. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
            );
            supabase = null;
            return null;
        }
        supabase = createClient(url, key, {
            global: {
                headers: {
                    'apikey': key,
                },
            },
        });
        return supabase;
    } catch (e) {
        console.error('Error initializing Supabase', e);
        supabase = null;
        return null;
    }
};

// 現在のSupabaseクライアントインスタンスを取得する関数
export const getSupabase = (): SupabaseClient => {
    // Initialize if not already done.
    if (!supabase) {
        initializeSupabase(SUPABASE_URL, SUPABASE_KEY);
    }
    if (!supabase) {
        throw new Error(MISSING_CREDENTIALS_MESSAGE);
    }
    return supabase;
};

// 接続情報が設定されているか確認する関数
export const hasSupabaseCredentials = (): boolean => {
    return !!(SUPABASE_URL && SUPABASE_KEY && !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_KEY));
};

// Supabase Functions を呼び出すための Authorization ヘッダーを生成する。
// - 可能なら Supabase Auth の access_token を優先（ユーザーコンテキストで実行）
// - それ以外は anon key を Bearer として付与（Functions Gateway の 401 を回避）
export const getSupabaseFunctionHeaders = async (
    client?: SupabaseClient,
): Promise<Record<string, string>> => {
    const supabaseClient = client ?? getSupabase();
    try {
        const { data } = await supabaseClient.auth.getSession();
        const accessToken = data?.session?.access_token;
        if (accessToken) {
            return { Authorization: `Bearer ${accessToken}` };
        }
    } catch {
        // Ignore and fall back to anon key below.
    }
    return { Authorization: `Bearer ${SUPABASE_KEY}` };
};

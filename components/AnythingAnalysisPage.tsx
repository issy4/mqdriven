import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Type } from "@google/genai";
import { User, AnalysisResult, AnalysisHistory } from '../types';
import { getAnalysisHistory, addAnalysisHistory } from '../services/dataService';
import { requireGeminiClient } from '../services/Gemini';
import { Loader, Sparkles, FileText, Link as LinkIcon, Trash2, Copy, History, X } from './Icons';

interface AnythingAnalysisPageProps {
  currentUser: User | null;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  isAIOff: boolean;
}

const readFileAsBase64 = (file: File): Promise<{ name: string; type: string; data: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ name: file.name, type: file.type, data: result.split(',')[1] });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const readFileAsText = (file: File): Promise<{ name: string; type: string; data: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({ name: file.name, type: file.type, data: reader.result as string });
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "分析結果のタイトル" },
    summary: { type: Type.STRING, description: "分析結果のテキスト要約。箇条書きなどを使って分かりやすく。" },
    table: {
      type: Type.OBJECT,
      description: "分析結果を表形式でまとめたもの。",
      properties: {
        headers: { type: Type.ARRAY, items: { type: Type.STRING } },
        rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } }
      }
    },
    chart: {
      type: Type.OBJECT,
      description: "グラフ表示に適したデータ。棒グラフまたは折れ線グラフを想定。",
      properties: {
        type: { type: Type.STRING, enum: ['bar', 'line'], description: "グラフの種類" },
        data: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "X軸のラベル" },
              value: { type: Type.NUMBER, description: "Y軸の値" }
            },
            required: ['name', 'value']
          }
        }
      }
    }
  },
  required: ['title', 'summary', 'table', 'chart']
};

const preset1: AnalysisResult = {
    title: "月間製品別売上分析 (サンプル)",
    summary: "製品Aが売上の大半を占めており、特にQ3で急成長しています。製品Cは売上が低迷しており、対策が必要です。",
    table: {
        headers: ['製品', 'Q1売上', 'Q2売上', 'Q3売上', 'Q4売上'],
        rows: [
            ['製品A', '1,200,000', '1,500,000', '2,100,000', '1,800,000'],
            ['製品B', '800,000', '850,000', '900,000', '950,000'],
            ['製品C', '300,000', '280,000', '250,000', '230,000'],
        ]
    },
    chart: {
        type: 'bar',
        data: [
            { name: '製品A', value: 6600000 },
            { name: '製品B', value: 3500000 },
            { name: '製品C', value: 1060000 },
        ]
    }
};

const preset2: AnalysisResult = {
    title: "ウェブサイト流入元分析 (サンプル)",
    summary: "オーガニック検索からの流入が最も多いですが、ソーシャルメディア経由のコンバージョン率が最も高いです。広告キャンペーンからの流入はコストに見合っていません。",
    table: {
        headers: ['流入元', 'セッション数', 'コンバージョン率'],
        rows: [
            ['オーガニック検索', '12,500', '2.5%'],
            ['ソーシャルメディア', '4,200', '4.8%'],
            ['有料広告', '2,100', '1.2%'],
            ['ダイレクト', '3,500', '3.1%'],
        ]
    },
    chart: {
        type: 'line',
        data: [
            { name: '1月', value: 18000 },
            { name: '2月', value: 19500 },
            { name: '3月', value: 22300 },
            { name: '4月', value: 21800 },
        ]
    }
};

const presets = [
    { name: "製品別売上分析", result: preset1 },
    { name: "ウェブサイト流入元分析", result: preset2 },
];


const AnythingAnalysisPage: React.FC<AnythingAnalysisPageProps> = ({ currentUser, addToast, isAIOff }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [urls, setUrls] = useState<string[]>(['']);
    const [viewpoint, setViewpoint] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [history, setHistory] = useState<AnalysisHistory[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);

    const loadHistory = useCallback(async () => {
        if (!currentUser) return;
        setIsHistoryLoading(true);
        try {
            const historyData = await getAnalysisHistory();
            const userHistory = historyData.filter(h => h.userId === currentUser.id);
            setHistory(userHistory);
            if (userHistory.length === 0 && !result) {
                setResult(preset1);
            }
        } catch (e) {
            addToast('分析履歴の読み込みに失敗しました。', 'error');
        } finally {
            setIsHistoryLoading(false);
        }
    }, [currentUser, addToast, result]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const handleUrlChange = (index: number, value: string) => {
        const newUrls = [...urls];
        newUrls[index] = value;
        setUrls(newUrls);
    };

    const addUrlInput = () => setUrls([...urls, '']);
    const removeUrlInput = (index: number) => setUrls(urls.filter((_, i) => i !== index));

    const handleAnalyze = async () => {
        if (isAIOff) {
            addToast('AI機能は現在無効です。', 'error');
            return;
        }
        if (!viewpoint.trim()) {
            addToast('分析の視点を入力してください。', 'info');
            return;
        }
        if (files.length === 0 && urls.every(u => !u.trim())) {
            addToast('少なくとも1つのデータソース（ファイルまたはURL）を指定してください。', 'info');
            return;
        }
        if (!currentUser) {
            addToast('ログイン情報が見つかりません。', 'error');
            return;
        }

        setIsLoading(true);
        setResult(null);

        try {
            const ai = requireGeminiClient();
            
            const contents: any[] = [{ text: `以下のデータセットを分析してください。\n分析の視点: ${viewpoint}` }];

            for (const file of files) {
                if (file.type.startsWith('image/') || file.type === 'application/pdf') {
                    const { data, type } = await readFileAsBase64(file);
                    contents.push({ inlineData: { mimeType: type, data } });
                } else {
                    const { data } = await readFileAsText(file);
                    contents.push({ text: `ファイル名: ${file.name}\n\n${data}` });
                }
            }
            
            urls.filter(u => u.trim()).forEach(url => {
                contents.push({ text: `参照URL: ${url}` });
            });

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: { parts: contents },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: analysisSchema,
                },
            });
            
            const jsonStr = (response.text || '').trim().replace(/^```json\n|\n```$/g, '');
            const analysisResult: AnalysisResult = JSON.parse(jsonStr);
            setResult(analysisResult);

            await addAnalysisHistory({
                userId: currentUser.id,
                viewpoint,
                dataSources: {
                    filenames: files.map(f => f.name),
                    urls: urls.filter(u => u.trim())
                },
                result: analysisResult,
            });
            await loadHistory();

        } catch (e: any) {
            addToast(`分析エラー: ${e.message}`, 'error');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };
    
    const copyResultsToClipboard = () => {
        if (!result) return;
        const text = `
# ${result.title}

## 分析サマリー
${result.summary}

## 表データ
| ${result.table.headers.join(' | ')} |
| ${result.table.headers.map(() => '---').join(' | ')} |
${result.table.rows.map(row => `| ${row.join(' | ')} |`).join('\n')}
        `.trim();
        navigator.clipboard.writeText(text);
        addToast('分析結果をクリップボードにコピーしました。', 'success');
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
            {/* History Panel */}
            <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-2xl shadow-sm flex flex-col">
                <h2 className="text-lg font-semibold p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                    <History className="w-5 h-5"/>分析履歴
                </h2>
                <div className="flex-1 overflow-y-auto">
                    {isHistoryLoading ? <div className="p-4 text-center"><Loader className="w-6 h-6 animate-spin mx-auto"/></div> :
                        history.length === 0 ? (
                            <div className="p-4">
                                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">分析サンプル</p>
                                <p className="text-xs text-slate-500 mb-3">クリックするとサンプル結果を表示します。</p>
                                <ul className="space-y-2">
                                    {presets.map((p, i) => (
                                        <li key={i}>
                                            <button onClick={() => setResult(p.result)} className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg">
                                                <p className="font-semibold text-blue-600 dark:text-blue-400">{p.name}</p>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                        <ul>
                            {history.map(h => (
                                <li key={h.id} className="border-b border-slate-200 dark:border-slate-700">
                                    <button onClick={() => setResult(h.result)} className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <p className="font-semibold truncate">{h.viewpoint}</p>
                                        <p className="text-xs text-slate-500">{new Date(h.createdAt).toLocaleString('ja-JP')}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Main Analysis Panel */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm flex flex-col">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-lg font-semibold">1. データセットの準備</h2>
                    <div className="space-y-2 mt-2">
                        <div>
                            <label className="text-sm font-medium">ファイル</label>
                            <input type="file" multiple onChange={handleFileChange} className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {files.map((file, i) => (
                                    <div key={i} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-full px-2 py-1 text-xs">
                                        <FileText className="w-3 h-3"/>{file.name}
                                        <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))}><X className="w-3 h-3"/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium">公開URL</label>
                            {urls.map((url, i) => (
                                <div key={i} className="flex items-center gap-2 mt-1">
                                    <LinkIcon className="w-4 h-4 text-slate-400"/>
                                    <input type="url" value={url} onChange={e => handleUrlChange(i, e.target.value)} placeholder="https://..." className="w-full bg-slate-50 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm"/>
                                    <button onClick={() => removeUrlInput(i)}><Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500"/></button>
                                </div>
                            ))}
                            <button onClick={addUrlInput} className="text-xs font-semibold text-blue-600 mt-1">+ URLを追加</button>
                        </div>
                    </div>
                    <h2 className="text-lg font-semibold mt-4">2. 分析の視点を入力</h2>
                    <textarea value={viewpoint} onChange={e => setViewpoint(e.target.value)} rows={3} placeholder="例: アップロードしたCSVの売上データを顧客別に集計し、上位5社のグラフを作成して" className="mt-2 w-full bg-slate-50 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 rounded-lg p-2.5"/>
                    <div className="text-right mt-2">
                        <button onClick={handleAnalyze} disabled={isLoading || isAIOff} className="flex items-center gap-2 bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-purple-700 disabled:bg-slate-400">
                            {isLoading ? <Loader className="w-5 h-5 animate-spin"/> : <Sparkles className="w-5 h-5"/>}
                            {isLoading ? '分析中...' : '分析を実行'}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    <h2 className="text-lg font-semibold mb-2">3. 分析結果</h2>
                    {isLoading ? <div className="text-center p-8"><Loader className="w-8 h-8 animate-spin mx-auto"/></div> :
                    !result ? <div className="text-center p-8 text-slate-500">ここに分析結果が表示されます。</div> :
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold">{result.title}</h3>
                            <button onClick={copyResultsToClipboard} className="flex items-center gap-1 text-sm font-semibold text-blue-600"><Copy className="w-4 h-4"/>結果をコピー</button>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{result.summary}</div>
                        <div>
                            <h4 className="font-semibold mb-1">表データ</h4>
                            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 dark:bg-slate-700/50"><tr>{result.table.headers.map((h,i) => <th key={i} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                        {result.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}</tr>)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1">グラフ</h4>
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    {result.chart.type === 'bar' ?
                                        <BarChart data={result.chart.data}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip/><Legend/><Bar dataKey="value" fill="#8884d8"/></BarChart> :
                                        <LineChart data={result.chart.data}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="value" stroke="#8884d8"/></LineChart>
                                    }
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>}
                </div>
            </div>
        </div>
    );
};

export default AnythingAnalysisPage;

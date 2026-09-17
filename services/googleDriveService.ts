// Google Drive MCP integration service
import mcpService from './mcpService';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
  webViewLink?: string;
}

export interface GoogleDriveSearchResult {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

class GoogleDriveService {
  private toolCache: { search?: string; download?: string } = {};

  private getToolName(tools: any[], kinds: string[], keywords: string[]): string | null {
    const normalized = tools
      .map(tool => ({
        name: String(tool?.name ?? ''),
        lower: String(tool?.name ?? '').toLowerCase(),
      }))
      .filter(entry => entry.name);

    for (const kind of kinds) {
      const candidate = normalized.find(entry => entry.lower === kind.toLowerCase());
      if (candidate) return candidate.name;
    }

    const keywordMatch = normalized.find(entry =>
      keywords.every(keyword => entry.lower.includes(keyword))
    );
    return keywordMatch ? keywordMatch.name : null;
  }

  private getToolDefinition(tools: any[], name: string): any | null {
    return tools.find(tool => String(tool?.name ?? '') === name) ?? null;
  }

  private getSchemaProperties(toolDef: any): string[] {
    const schema =
      toolDef?.inputSchema ||
      toolDef?.input_schema ||
      toolDef?.parameters ||
      toolDef?.argsSchema ||
      toolDef?.schema ||
      null;
    const properties = schema?.properties || {};
    return Object.keys(properties);
  }

  private pickArgumentKey(keys: string[], candidates: string[], fallback: string): string {
    for (const candidate of candidates) {
      const match = keys.find(key => key.toLowerCase() === candidate.toLowerCase());
      if (match) return match;
    }
    return fallback;
  }

  private async resolveTools(): Promise<{ search: string; download: string; tools: any[] }> {
    if (this.toolCache.search && this.toolCache.download) {
      const cachedTools = await mcpService.listTools('gdrive');
      return {
        search: this.toolCache.search,
        download: this.toolCache.download,
        tools: cachedTools.gdrive || []
      };
    }

    const toolsByServer = await mcpService.listTools('gdrive');
    const tools = toolsByServer.gdrive || [];

    const searchTool = this.getToolName(
      tools,
      ['search_files', 'searchFiles', 'gdrive_search_files', 'google_drive_file_search'],
      ['search', 'file']
    );
    const downloadTool =
      this.getToolName(
        tools,
        ['download_file', 'downloadFile', 'read_file', 'readFile', 'get_file'],
        ['download', 'file']
      ) ||
      this.getToolName(tools, [], ['read', 'file']) ||
      this.getToolName(tools, [], ['get', 'file']);

    if (!searchTool) {
      throw new Error('Google Drive MCP search tool not found.');
    }
    if (!downloadTool) {
      throw new Error('Google Drive MCP download tool not found.');
    }

    this.toolCache = { search: searchTool, download: downloadTool };
    return { search: searchTool, download: downloadTool, tools };
  }

  private tryParseJson(raw: any): any {
    if (typeof raw !== 'string') return raw;
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return raw;
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }

  private normalizeSearchResult(raw: any): GoogleDriveSearchResult {
    const parsed = this.tryParseJson(raw);
    const data = parsed?.data ?? parsed;
    const files = data?.files || data?.items || (Array.isArray(data) ? data : []);
    const mapped = (Array.isArray(files) ? files : []).map((file: any) => ({
      id: String(file?.id ?? file?.fileId ?? file?.file_id ?? file?.key ?? file?.path ?? ''),
      name: String(file?.name ?? file?.fileName ?? file?.filename ?? ''),
      mimeType: String(file?.mimeType ?? file?.mime_type ?? file?.type ?? ''),
      size: file?.size !== undefined && file?.size !== null ? String(file.size) : undefined,
      createdTime: String(
        file?.createdTime ??
        file?.created_time ??
        file?.modifiedTime ??
        file?.modified_time ??
        ''
      ),
      webViewLink: file?.webViewLink ?? file?.web_view_link ?? file?.webLink ?? file?.url ?? file?.link
    }));

    return {
      files: mapped,
      nextPageToken: data?.nextPageToken ?? data?.next_page_token
    };
  }

  private decodeBase64(base64: string): ArrayBuffer {
    const normalized = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
    if (typeof atob === 'function') {
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
    if (typeof Buffer !== 'undefined') {
      const buffer = Buffer.from(normalized, 'base64');
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    throw new Error('Base64 decode is not available.');
  }

  private normalizeDownloadResult(raw: any, fallbackName: string): { data: ArrayBuffer; fileName: string } {
    const parsed = this.tryParseJson(raw);
    const data = parsed?.data ?? parsed;
    const fileName = String(
      data?.fileName ??
      data?.file_name ??
      data?.name ??
      data?.filename ??
      data?.file?.name ??
      fallbackName
    );

    const content =
      data?.content ??
      data?.file?.content ??
      data?.data ??
      data?.bytes ??
      data?.file?.data ??
      data?.file?.bytes ??
      data;

    if (content instanceof ArrayBuffer) {
      return { data: content, fileName };
    }

    if (ArrayBuffer.isView(content)) {
  const view = content as Uint8Array;
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));

  return { data: bytes.buffer, fileName };
}

    if (typeof content === 'string') {
      return { data: this.decodeBase64(content), fileName };
    }

    throw new Error('Google Drive MCP returned unsupported download payload.');
  }

  private async callMCP(method: 'search' | 'download', params: any = {}): Promise<any> {
    const { search, download, tools } = await this.resolveTools();
    const toolName = method === 'search' ? search : download;
    const toolDef = this.getToolDefinition(tools, toolName);
    const keys = this.getSchemaProperties(toolDef);
    const argumentKey =
      method === 'search'
        ? this.pickArgumentKey(keys, ['query', 'q', 'text', 'term', 'name', 'filename'], 'query')
        : this.pickArgumentKey(keys, ['fileId', 'file_id', 'id', 'file', 'path'], 'fileId');

    const args = method === 'search'
      ? { [argumentKey]: params.query }
      : { [argumentKey]: params.fileId };

    const result = await mcpService.callTool('gdrive', toolName, args);
    if (!result.success) {
      throw new Error(result.error || 'Google Drive MCP request failed.');
    }
    return result.data;
  }

  async searchFiles(query?: string): Promise<GoogleDriveSearchResult> {
    const raw = await this.callMCP('search', { query });
    return this.normalizeSearchResult(raw);
  }

  async downloadFile(fileId: string): Promise<{ data: ArrayBuffer; fileName: string }> {
    const raw = await this.callMCP('download', { fileId });
    return this.normalizeDownloadResult(raw, fileId);
  }

  async searchExpenseFiles(): Promise<GoogleDriveSearchResult> {
    // Search for common expense-related file names and types
    const searchQueries = [
      '請求書',
      '領収書',
      'invoice',
      '交通費',
      '精算',
      '経費',
      '出張',
      '納品書',
      'expense'
    ];

    const allFiles: GoogleDriveFile[] = [];

    for (const query of searchQueries) {
      try {
        const result = await this.searchFiles(query);
        allFiles.push(...result.files);
      } catch (error) {
        console.warn(`Failed to search for ${query}:`, error);
      }
    }

    // Remove duplicates
    const uniqueFiles = allFiles.filter((file, index, self) =>
      index === self.findIndex(f => f.id === file.id)
    );

    return {
      files: this.filterInvoiceFiles(uniqueFiles)
    };
  }

  isExcelFile(file: GoogleDriveFile): boolean {
    return file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
           file.mimeType === 'application/vnd.ms-excel' ||
           file.name.toLowerCase().endsWith('.xlsx') ||
           file.name.toLowerCase().endsWith('.xls');
  }

  isImageFile(file: GoogleDriveFile): boolean {
    return file.mimeType.startsWith('image/') ||
           !!file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/i);
  }

  isPdfFile(file: GoogleDriveFile): boolean {
    return file.mimeType === 'application/pdf' ||
           file.name.toLowerCase().endsWith('.pdf');
  }

  filterExpenseFiles(files: GoogleDriveFile[]): GoogleDriveFile[] {
    return files.filter(file =>
      this.isExcelFile(file) || this.isImageFile(file)
    );
  }

  /** 請求書OCR用：PDF・画像・Excelファイルを対象とする */
  filterInvoiceFiles(files: GoogleDriveFile[]): GoogleDriveFile[] {
    return files.filter(file =>
      this.isPdfFile(file) || this.isImageFile(file) || this.isExcelFile(file)
    );
  }

    /** 名刺OCR用：PDF・画像ファイルを対象とする */
  filterBusinessCardFiles(files: GoogleDriveFile[]): GoogleDriveFile[] {
    return files.filter(file =>
      this.isPdfFile(file) || this.isImageFile(file)
    );
  }

  /** Google Drive内の「名刺OCR取込」フォルダを探す */
  async findBusinessCardFolder(): Promise<GoogleDriveFile | null> {
    const folderName = '名刺OCR取込';

    const result = await this.searchFiles(folderName);

    const folder = result.files.find(file =>
      file.name === folderName &&
      file.mimeType === 'application/vnd.google-apps.folder'
    );

    return folder ?? null;
  }

  /** 「名刺OCR取込」フォルダ内の名刺ファイルを取得 */
  async searchBusinessCardFiles(): Promise<GoogleDriveSearchResult> {
    const folder = await this.findBusinessCardFolder();

    if (!folder) {
      throw new Error('Google Driveに「名刺OCR取込」フォルダが見つかりません。');
    }

    /**
     * MCP側の検索ツールがGoogle Driveのq構文に対応している場合、
     * この検索でフォルダ内ファイルを取得します。
     */
    const folderQuery = `'${folder.id}' in parents and trashed = false`;

    const result = await this.searchFiles(folderQuery);

    return {
      files: this.filterBusinessCardFiles(result.files),
      nextPageToken: result.nextPageToken,
    };
  }
}

export const googleDriveService = new GoogleDriveService();

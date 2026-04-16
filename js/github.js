/**
 * GitHub API Client for HITO English
 * Handles article fetching (read-only) and user data (read/write).
 */
class GitHubClient {
  constructor(token, repo) {
    this.token = token;
    this.repo = repo;
    this.apiBase = 'https://api.github.com';
    this.cache = new Map(); // path -> { content, sha }
  }

  get headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  /**
   * Test the connection by fetching repo info.
   */
  async testConnection() {
    const res = await fetch(`${this.apiBase}/repos/${this.repo}`, {
      headers: this.headers,
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('トークンが無効です');
      if (res.status === 404) throw new Error('リポジトリが見つかりません');
      throw new Error(`接続エラー: ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Fetch directory listing for a path.
   * Returns array of { path, name, type }.
   */
  async fetchDir(dirPath) {
    const res = await fetch(
      `${this.apiBase}/repos/${this.repo}/contents/${encodeURIComponent(dirPath)}`,
      { headers: this.headers }
    );
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`ディレクトリ取得エラー: ${res.status}`);

    const items = await res.json();
    if (!Array.isArray(items)) return [];
    return items.map(item => ({
      path: item.path,
      name: item.name,
      type: item.type,
      sha: item.sha,
    }));
  }

  /**
   * Fetch article index for a given year/month.
   * Returns list of article filenames and paths.
   */
  async fetchArticleIndex(yearMonth) {
    const [year, month] = yearMonth.split('-');
    const dirPath = `articles/${year}/${month}`;
    const items = await this.fetchDir(dirPath);
    return items.filter(item => item.type === 'file' && item.name.endsWith('.json'));
  }

  /**
   * Fetch a single JSON file and parse it.
   */
  async fetchJSON(filePath) {
    const res = await fetch(
      `${this.apiBase}/repos/${this.repo}/contents/${encodeURIComponent(filePath)}`,
      { headers: this.headers }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`ファイル取得エラー: ${res.status}`);

    const data = await res.json();
    const content = this.decodeContent(data.content);
    this.cache.set(filePath, { content, sha: data.sha });

    try {
      return JSON.parse(content);
    } catch {
      throw new Error(`JSONパースエラー: ${filePath}`);
    }
  }

  /**
   * Fetch user data file (flashcards.json or reading-log.json).
   */
  async fetchUserData(fileName) {
    return await this.fetchJSON(`userdata/${fileName}`);
  }

  /**
   * Save user data file.
   */
  async saveUserData(fileName, data, message) {
    const filePath = `userdata/${fileName}`;
    const content = JSON.stringify(data, null, 2);
    const cached = this.cache.get(filePath);

    const body = {
      message: message || `Update ${fileName}`,
      content: this.encodeContent(content),
    };
    if (cached && cached.sha) {
      body.sha = cached.sha;
    }

    const res = await fetch(
      `${this.apiBase}/repos/${this.repo}/contents/${encodeURIComponent(filePath)}`,
      {
        method: 'PUT',
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      if (res.status === 409) {
        throw new Error('競合が発生しました。再読み込みしてください。');
      }
      throw new Error(`保存エラー: ${res.status}`);
    }

    const result = await res.json();
    this.cache.set(filePath, { content, sha: result.content.sha });
    return result;
  }

  // ---- Encoding helpers ----

  decodeContent(base64) {
    const bytes = Uint8Array.from(atob(base64.replace(/\n/g, '')), c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  encodeContent(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }
}

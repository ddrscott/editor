import { LanguageRunner, ExecutionResult } from './LanguageRunner';

// sql.js types
interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

interface SqlJsDatabase {
  run: (sql: string) => void;
  exec: (sql: string) => QueryExecResult[];
  close: () => void;
}

interface QueryExecResult {
  columns: string[];
  values: (string | number | null | Uint8Array)[][];
}

// Global for CDN-loaded sql.js
declare global {
  interface Window {
    initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;
  }
}

/**
 * SQLite code executor using sql.js (Emscripten port of SQLite).
 * Runs SQLite entirely in the browser with in-memory storage.
 */
export class SQLiteRunner implements LanguageRunner {
  readonly language = 'sqlite';
  readonly supportedExtensions = ['sql', 'sqlite'];

  private SQL: SqlJsStatic | null = null;
  private db: SqlJsDatabase | null = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this._initialize();
    await this.initializing;
  }

  private loadSqlJs(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.initSqlJs) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://sql.js.org/dist/sql-wasm.js';
      script.onload = () => {
        if (window.initSqlJs) {
          resolve();
        } else {
          reject(new Error('sql.js not found after script load'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load sql.js'));
      document.head.appendChild(script);

      // Timeout fallback
      setTimeout(() => {
        if (!window.initSqlJs) {
          reject(new Error('sql.js load timeout'));
        }
      }, 30000);
    });
  }

  private async _initialize(): Promise<void> {
    try {
      await this.loadSqlJs();

      // Initialize sql.js with WASM from CDN
      this.SQL = await window.initSqlJs!({
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`
      });

      // Create in-memory database
      this.db = new this.SQL.Database();

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize SQLite runtime: ${error}`);
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  async execute(code: string, _filename: string): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      if (!this.initialized || !this.db) {
        await this.initialize();
      }

      if (!this.db) {
        throw new Error('SQLite not initialized');
      }

      // Execute SQL and get results
      const results = this.db.exec(code);
      const output = this.formatResults(results);
      const executionTime = performance.now() - startTime;

      return {
        success: true,
        output: output || 'Query executed successfully',
        executionTime
      };

    } catch (error) {
      return {
        success: false,
        output: '',
        error: `SQL Error: ${error}`,
        executionTime: performance.now() - startTime
      };
    }
  }

  private formatResults(results: QueryExecResult[]): string {
    if (results.length === 0) {
      return '';
    }

    const outputParts: string[] = [];

    for (const result of results) {
      const { columns, values } = result;

      if (values.length === 0) {
        outputParts.push('(empty result set)');
        continue;
      }

      // Calculate column widths
      const widths = columns.map((col, i) => {
        const headerWidth = col.length;
        const maxDataWidth = values.reduce((max, row) => {
          const value = String(row[i] ?? 'NULL');
          return Math.max(max, value.length);
        }, 0);
        return Math.max(headerWidth, maxDataWidth, 4);
      });

      // Build ASCII table
      const lines: string[] = [];
      const separator = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
      const headerRow = '|' + columns.map((col, i) =>
        ` ${col.padEnd(widths[i])} `
      ).join('|') + '|';

      lines.push(separator);
      lines.push(headerRow);
      lines.push(separator);

      for (const row of values) {
        const dataRow = '|' + row.map((val, i) => {
          const value = String(val ?? 'NULL');
          return ` ${value.padEnd(widths[i])} `;
        }).join('|') + '|';
        lines.push(dataRow);
      }

      lines.push(separator);
      lines.push(`(${values.length} row${values.length === 1 ? '' : 's'})`);

      outputParts.push(lines.join('\n'));
    }

    return outputParts.join('\n\n');
  }

  /**
   * Reset the database (creates fresh in-memory instance)
   */
  async resetDatabase(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    if (this.SQL) {
      this.db = new this.SQL.Database();
    }
  }

  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.SQL = null;
    this.initialized = false;
    this.initializing = null;
  }
}

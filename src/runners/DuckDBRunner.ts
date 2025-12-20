import { LanguageRunner, ExecutionResult } from './LanguageRunner';

// DuckDB types (loaded dynamically from CDN)
interface DuckDBModule {
  getJsDelivrBundles: () => DuckDBBundles;
  selectBundle: (bundles: DuckDBBundles) => Promise<DuckDBBundle>;
  ConsoleLogger: new (level: number) => unknown;
  LogLevel: { WARNING: number };
  AsyncDuckDB: new (logger: unknown, worker: Worker) => AsyncDuckDB;
}

interface DuckDBBundles {
  mvp: DuckDBBundle;
  eh: DuckDBBundle;
}

interface DuckDBBundle {
  mainModule: string;
  mainWorker: string;
  pthreadWorker?: string;
}

interface AsyncDuckDB {
  instantiate: (mainModule: string, pthreadWorker?: string) => Promise<void>;
  connect: () => Promise<DuckDBConnection>;
  terminate: () => Promise<void>;
}

interface DuckDBConnection {
  query: (sql: string) => Promise<DuckDBTable>;
  close: () => Promise<void>;
}

interface DuckDBTable {
  toArray: () => Record<string, unknown>[];
  schema: { fields: { name: string }[] };
}

// Global for CDN-loaded DuckDB
declare global {
  interface Window {
    duckdb?: DuckDBModule;
  }
}

/**
 * DuckDB code executor using DuckDB-WASM runtime.
 * Runs DuckDB SQL entirely in the browser with in-memory storage.
 */
export class DuckDBRunner implements LanguageRunner {
  readonly language = 'duckdb';
  readonly supportedExtensions = ['duckdb'];

  private db: AsyncDuckDB | null = null;
  private conn: DuckDBConnection | null = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this._initialize();
    await this.initializing;
  }

  private loadDuckDBModule(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.duckdb) {
        resolve();
        return;
      }

      // Create a module script that imports DuckDB and exposes it globally
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = `
        import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm';
        window.duckdb = duckdb;
        window.dispatchEvent(new Event('duckdb-loaded'));
      `;

      const handleLoad = () => {
        window.removeEventListener('duckdb-loaded', handleLoad);
        if (window.duckdb) {
          resolve();
        } else {
          reject(new Error('DuckDB not found after module load'));
        }
      };

      window.addEventListener('duckdb-loaded', handleLoad);

      script.onerror = () => {
        window.removeEventListener('duckdb-loaded', handleLoad);
        reject(new Error('Failed to load DuckDB runtime'));
      };

      document.head.appendChild(script);

      // Timeout fallback
      setTimeout(() => {
        if (!window.duckdb) {
          window.removeEventListener('duckdb-loaded', handleLoad);
          reject(new Error('DuckDB load timeout'));
        }
      }, 30000);
    });
  }

  private async _initialize(): Promise<void> {
    try {
      // Load DuckDB from CDN
      await this.loadDuckDBModule();
      const duckdb = window.duckdb!;

      // Get CDN bundles
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

      // Select appropriate bundle for this browser
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      // Create worker from CDN
      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      );

      // Instantiate DuckDB
      const worker = new Worker(worker_url);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(worker_url);

      // Create connection
      this.conn = await this.db.connect();

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize DuckDB runtime: ${error}`);
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  async execute(code: string, _filename: string): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      // Ensure initialized
      if (!this.initialized || !this.conn) {
        await this.initialize();
      }

      if (!this.conn) {
        throw new Error('DuckDB not initialized');
      }

      // Split into statements and execute each
      const statements = this.splitStatements(code);
      const outputParts: string[] = [];

      for (const stmt of statements) {
        if (!stmt.trim()) continue;

        const result = await this.conn.query(stmt);
        const formatted = this.formatResult(result);
        if (formatted) {
          outputParts.push(formatted);
        }
      }

      const executionTime = performance.now() - startTime;

      return {
        success: true,
        output: outputParts.join('\n\n') || '(no output)',
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

  private splitStatements(code: string): string[] {
    // Simple statement splitting by semicolon
    // Note: This doesn't handle semicolons inside strings, but works for most cases
    return code.split(';').map(s => s.trim()).filter(s => s.length > 0);
  }

  private formatResult(result: duckdb.Table): string {
    const rows = result.toArray();
    const schema = result.schema;

    if (rows.length === 0) {
      // Check if this was a DDL/DML statement
      if (schema.fields.length === 0) {
        return 'Query executed successfully';
      }
      return '(empty result set)';
    }

    const columns = schema.fields.map(f => f.name);

    // Calculate column widths
    const widths: number[] = columns.map((col, i) => {
      const headerWidth = col.length;
      const maxDataWidth = rows.reduce((max, row) => {
        const value = String(row[col] ?? 'NULL');
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

    for (const row of rows) {
      const dataRow = '|' + columns.map((col, i) => {
        const value = String(row[col] ?? 'NULL');
        return ` ${value.padEnd(widths[i])} `;
      }).join('|') + '|';
      lines.push(dataRow);
    }

    lines.push(separator);
    lines.push(`(${rows.length} row${rows.length === 1 ? '' : 's'})`);

    return lines.join('\n');
  }

  /**
   * Reset the database (creates fresh in-memory instance)
   */
  async resetDatabase(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
    this.initialized = false;
    this.initializing = null;
  }

  dispose(): void {
    if (this.conn) {
      this.conn.close().catch(() => {});
      this.conn = null;
    }
    if (this.db) {
      this.db.terminate().catch(() => {});
      this.db = null;
    }
    this.initialized = false;
    this.initializing = null;
  }
}

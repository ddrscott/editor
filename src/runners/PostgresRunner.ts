import { LanguageRunner, ExecutionResult } from './LanguageRunner';
import { PGlite } from '@electric-sql/pglite';

/**
 * PostgreSQL code executor using PGlite WebAssembly runtime.
 * Runs PostgreSQL entirely in the browser with IndexedDB persistence.
 */
export class PostgresRunner implements LanguageRunner {
  readonly language = 'postgres';
  readonly supportedExtensions = ['pgsql', 'psql'];

  private db: PGlite | null = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private currentSpaceId: string | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this._initialize();
    await this.initializing;
  }

  private getSpaceId(): string {
    // Extract space ID from URL path: /space/{uuid}
    const match = window.location.pathname.match(/\/space\/([a-f0-9-]+)/i);
    return match?.[1] || 'default';
  }

  private getDbName(): string {
    const spaceId = this.getSpaceId();
    return `idb://pglite-${spaceId}`;
  }

  private async _initialize(): Promise<void> {
    try {
      // Get current space ID
      this.currentSpaceId = this.getSpaceId();

      // Initialize PGlite with IndexedDB persistence
      const dbName = this.getDbName();
      this.db = new PGlite(dbName);

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize PostgreSQL runtime: ${error}`);
    }
  }

  isReady(): boolean {
    // Also check if space ID changed (need to reinitialize for different space)
    if (this.initialized && this.currentSpaceId !== this.getSpaceId()) {
      return false;
    }
    return this.initialized;
  }

  async execute(code: string, _filename: string): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      // Ensure initialized (handles space ID changes too)
      if (!this.isReady() || !this.db) {
        // Close existing connection if space changed
        if (this.db && this.currentSpaceId !== this.getSpaceId()) {
          await this.db.close();
          this.db = null;
          this.initialized = false;
          this.initializing = null;
        }
        await this.initialize();
      }

      if (!this.db) {
        throw new Error('PGlite not initialized');
      }

      // Execute SQL (supports multiple statements)
      const results = await this.db.exec(code);
      const executionTime = performance.now() - startTime;

      // Format output
      const output = this.formatResults(results);

      return {
        success: true,
        output: output || '(no output)',
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

  private formatResults(results: Array<{
    rows: Record<string, unknown>[];
    fields: { name: string; dataTypeID: number }[];
    affectedRows?: number;
  }>): string {
    const outputParts: string[] = [];

    for (const result of results) {
      if (result.rows.length > 0) {
        // SELECT query - format as ASCII table
        outputParts.push(this.formatTable(result.rows, result.fields));
      } else if (result.affectedRows !== undefined && result.affectedRows > 0) {
        // DML query (INSERT, UPDATE, DELETE)
        outputParts.push(`${result.affectedRows} row(s) affected`);
      } else if (result.fields.length === 0) {
        // DDL query (CREATE, DROP, ALTER)
        outputParts.push('Query executed successfully');
      }
    }

    return outputParts.join('\n\n');
  }

  private formatTable(
    rows: Record<string, unknown>[],
    fields: { name: string; dataTypeID: number }[]
  ): string {
    if (rows.length === 0 || fields.length === 0) {
      return '(empty result set)';
    }

    const columns = fields.map(f => f.name);

    // Calculate column widths
    const widths: number[] = columns.map((col, i) => {
      const headerWidth = col.length;
      const maxDataWidth = rows.reduce((max, row) => {
        const value = String(row[col] ?? 'NULL');
        return Math.max(max, value.length);
      }, 0);
      return Math.max(headerWidth, maxDataWidth, 4); // min width 4
    });

    // Build table
    const lines: string[] = [];

    // Header separator
    const separator = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';

    // Header row
    const headerRow = '|' + columns.map((col, i) =>
      ` ${col.padEnd(widths[i])} `
    ).join('|') + '|';

    lines.push(separator);
    lines.push(headerRow);
    lines.push(separator);

    // Data rows
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
   * Drop the database for the current space.
   * Useful for clearing state or freeing disk space.
   */
  async dropDatabase(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }

    // Delete from IndexedDB
    const spaceId = this.getSpaceId();
    const dbName = `pglite-${spaceId}`;

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => {
        this.initialized = false;
        this.initializing = null;
        resolve();
      };
      request.onerror = () => reject(new Error('Failed to delete database'));
    });
  }

  /**
   * List all PGlite databases in IndexedDB.
   * Returns space IDs that have databases.
   */
  static async listDatabases(): Promise<string[]> {
    const databases = await indexedDB.databases();
    return databases
      .filter(db => db.name?.startsWith('pglite-'))
      .map(db => db.name!.replace('pglite-', ''));
  }

  /**
   * Drop all PGlite databases (cleanup utility).
   */
  static async dropAllDatabases(): Promise<number> {
    const spaceIds = await PostgresRunner.listDatabases();
    for (const spaceId of spaceIds) {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(`pglite-${spaceId}`);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve(); // Continue even on error
      });
    }
    return spaceIds.length;
  }

  dispose(): void {
    if (this.db) {
      this.db.close().catch(() => {});
      this.db = null;
    }
    this.initialized = false;
    this.initializing = null;
    this.currentSpaceId = null;
  }
}

import { LanguageRunner, ExecutionResult } from './LanguageRunner';
import { DbApiClient } from '../sql/DbApiClient';

// SyncClient interface for type safety without importing the actual module
// (imports would break code splitting)
interface SyncClientLike {
  getDbInstanceId(dialect: string): string | null;
  sendDbStatus(dialect: string, instanceId: string, status: string): void;
  sendQueryResult(result: {
    dialect: string;
    sql: string;
    output: string;
    success: boolean;
    timestamp: number;
    executionTime?: number;
  }): void;
}

/**
 * SQL Server code executor using db-api.
 * Runs T-SQL queries via the db-api service with real SQL Server containers.
 */
export class MsSqlRunner implements LanguageRunner {
  readonly language = 'mssql';
  readonly supportedExtensions = ['mssql'];

  private dbClient = new DbApiClient();
  private dbInstanceId: string | null = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this._initialize();
    await this.initializing;
  }

  private getSyncClient(): SyncClientLike | null {
    // Get SyncClient reference from global (set by EditorApp)
    return (window as any).__syncClient as SyncClientLike | null;
  }

  private async _initialize(): Promise<void> {
    const syncClient = this.getSyncClient();

    // Try to get existing dbInstanceId from sync state
    const existingId = syncClient?.getDbInstanceId('mssql');
    if (existingId) {
      // Verify the instance is still valid
      try {
        await this.dbClient.getStatus(existingId);
        this.dbInstanceId = existingId;
        this.initialized = true;
        return;
      } catch {
        // Instance expired, create new one
        console.log('SQL Server instance expired, creating new one');
      }
    }

    // Create new database instance
    try {
      const result = await this.dbClient.createDb('mssql');
      this.dbInstanceId = result.db_id;

      // Store in Durable Object for collaboration
      syncClient?.sendDbStatus('mssql', this.dbInstanceId, 'ready');

      this.initialized = true;
    } catch (error) {
      this.initializing = null;
      throw new Error(`Failed to create SQL Server database: ${error}`);
    }
  }

  isReady(): boolean {
    return this.initialized && this.dbInstanceId !== null;
  }

  async execute(code: string, _filename: string): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      // Ensure initialized
      if (!this.isReady()) {
        await this.initialize();
      }

      if (!this.dbInstanceId) {
        throw new Error('SQL Server database not initialized');
      }

      const output = await this.dbClient.executeQuery(this.dbInstanceId, code);
      const executionTime = performance.now() - startTime;

      // Broadcast query result to collaborators
      const syncClient = this.getSyncClient();
      syncClient?.sendQueryResult({
        dialect: 'mssql',
        sql: code,
        output,
        success: true,
        timestamp: Date.now(),
        executionTime,
      });

      return { success: true, output, executionTime };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const executionTime = performance.now() - startTime;

      // Check if database expired or not found
      if (errorMsg.includes('not found') || errorMsg.includes('expired') || errorMsg.includes('404')) {
        this.initialized = false;
        this.initializing = null;
        this.dbInstanceId = null;

        return {
          success: false,
          output: '',
          error: 'SQL Server database expired. Run again to create a new instance.',
          executionTime,
        };
      }

      // Broadcast error result to collaborators
      const syncClient = this.getSyncClient();
      syncClient?.sendQueryResult({
        dialect: 'mssql',
        sql: code,
        output: errorMsg,
        success: false,
        timestamp: Date.now(),
        executionTime,
      });

      return { success: false, output: '', error: errorMsg, executionTime };
    }
  }

  /**
   * Reset the database connection.
   * Creates a new database instance on next execution.
   */
  async resetDatabase(): Promise<void> {
    this.dbInstanceId = null;
    this.initialized = false;
    this.initializing = null;
  }

  dispose(): void {
    this.dbInstanceId = null;
    this.initialized = false;
    this.initializing = null;
  }
}

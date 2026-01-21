/**
 * HTTP client for db-api proxy endpoints.
 * Handles database creation and query execution for MySQL and SQL Server.
 */
export class DbApiClient {
  private baseUrl = '/api/db';

  /**
   * Create a new database instance.
   */
  async createDb(dialect: 'mysql' | 'mssql'): Promise<{ db_id: string }> {
    const res = await fetch(`${this.baseUrl}/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialect }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create database: ${text || res.statusText}`);
    }
    return res.json();
  }

  /**
   * Execute a SQL query and return the text output.
   */
  async executeQuery(dbId: string, sql: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/${dbId}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, format: 'text' }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return res.text();
  }

  /**
   * Get the status of a database instance.
   */
  async getStatus(dbId: string): Promise<{ db_id: string; dialect: string; status: string }> {
    const res = await fetch(`${this.baseUrl}/${dbId}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return res.json();
  }
}

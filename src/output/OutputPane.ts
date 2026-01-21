import { ExecutionResult } from '../runners/LanguageRunner';
import { QueryHistoryItem } from '../sync/SyncClient';

export interface OutputPaneOptions {
  onClose: () => void;
  onRerun?: () => void;
  onResetDb?: () => void;
  onHistoryItemClick?: (item: QueryHistoryItem) => void;
}

/**
 * Output pane for displaying program execution results.
 * Appears as a closeable bottom split pane.
 * For SQL files, includes a collapsible query history section.
 */
export class OutputPane {
  private container: HTMLElement;
  private headerEl: HTMLElement;
  private statusEl: HTMLElement;
  private historyEl: HTMLElement | null = null;
  private outputEl: HTMLPreElement;
  private readonly onClose: () => void;
  private readonly onRerun?: () => void;
  private readonly onResetDb?: () => void;
  private readonly onHistoryItemClick?: (item: QueryHistoryItem) => void;
  private resetDbButton: HTMLButtonElement | null = null;
  private historyToggle: HTMLButtonElement | null = null;
  private queryHistory: QueryHistoryItem[] = [];
  private historyCollapsed = false;
  private isSqlMode = false;
  private currentDialect: string | null = null;

  // Store bound event handlers for cleanup
  private closeHandler: () => void;
  private clearHandler: () => void;
  private rerunHandler: () => void;
  private resetDbHandler: () => void;
  private historyToggleHandler: () => void;

  constructor(parent: HTMLElement, options: OutputPaneOptions) {
    this.onClose = options.onClose;
    this.onRerun = options.onRerun;
    this.onResetDb = options.onResetDb;
    this.onHistoryItemClick = options.onHistoryItemClick;

    // Create bound handlers for proper cleanup
    this.closeHandler = () => this.close();
    this.clearHandler = () => this.clear();
    this.rerunHandler = () => {
      if (this.onRerun) {
        this.onRerun();
      }
    };
    this.resetDbHandler = () => {
      if (this.onResetDb) {
        this.onResetDb();
      }
    };
    this.historyToggleHandler = () => this.toggleHistory();

    // Create output pane structure
    this.container = document.createElement('div');
    this.container.className = 'output-pane';

    // Header with title and actions
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'output-pane-header';
    this.headerEl.innerHTML = `
      <div class="output-pane-title">
        <span class="output-icon">&#9654;</span>
        <span>Output</span>
      </div>
      <div class="output-pane-actions">
        <button class="output-history-toggle" title="Toggle History" style="display: none;">History ▼</button>
        <button class="output-reset-db" title="Reset Database" style="display: none;">Reset DB</button>
        <button class="output-rerun" title="Run Again (Cmd+R)">&#8635; Run</button>
        <button class="output-clear" title="Clear Output">Clear</button>
        <button class="output-close" title="Close Panel">&times;</button>
      </div>
    `;

    // Status bar
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'output-pane-status';
    this.statusEl.textContent = 'Ready';

    // Query history section (initially hidden)
    this.historyEl = document.createElement('div');
    this.historyEl.className = 'output-pane-history';
    this.historyEl.style.display = 'none';

    // Output content area
    this.outputEl = document.createElement('pre');
    this.outputEl.className = 'output-pane-content';
    this.outputEl.textContent = 'Press Cmd+R to run your program';

    // Assemble
    this.container.appendChild(this.headerEl);
    this.container.appendChild(this.statusEl);
    this.container.appendChild(this.historyEl);
    this.container.appendChild(this.outputEl);
    parent.appendChild(this.container);

    // Store references
    this.resetDbButton = this.headerEl.querySelector('.output-reset-db');
    this.historyToggle = this.headerEl.querySelector('.output-history-toggle');

    // Event listeners (using bound handlers for cleanup)
    this.headerEl.querySelector('.output-close')?.addEventListener('click', this.closeHandler);
    this.headerEl.querySelector('.output-clear')?.addEventListener('click', this.clearHandler);
    this.headerEl.querySelector('.output-rerun')?.addEventListener('click', this.rerunHandler);
    this.resetDbButton?.addEventListener('click', this.resetDbHandler);
    this.historyToggle?.addEventListener('click', this.historyToggleHandler);
  }

  showOutput(result: ExecutionResult): void {
    // Update status
    const statusIcon = result.success ? '\u2713' : '\u2717';
    const statusClass = result.success ? 'success' : 'error';
    const time = result.executionTime ? ` (${result.executionTime.toFixed(0)}ms)` : '';

    this.statusEl.textContent = `${statusIcon} ${result.success ? 'Completed' : 'Failed'}${time}`;
    this.statusEl.className = `output-pane-status ${statusClass}`;

    // Show output or error
    this.outputEl.innerHTML = '';

    if (result.error) {
      const errorSpan = document.createElement('span');
      errorSpan.className = 'output-error';
      errorSpan.textContent = result.error + '\n\n';
      this.outputEl.appendChild(errorSpan);
    }

    if (result.output) {
      const outputText = document.createTextNode(result.output);
      this.outputEl.appendChild(outputText);
    }

    // Auto-scroll to top to show any errors first
    this.outputEl.scrollTop = 0;
  }

  showLoading(message: string = 'Running...'): void {
    this.statusEl.textContent = message;
    this.statusEl.className = 'output-pane-status loading';
    this.outputEl.textContent = message;
  }

  clear(): void {
    this.outputEl.textContent = '';
    this.statusEl.textContent = 'Ready';
    this.statusEl.className = 'output-pane-status';
  }

  /**
   * Show or hide the "Reset DB" button (for SQL files)
   */
  setShowResetDb(show: boolean): void {
    if (this.resetDbButton) {
      this.resetDbButton.style.display = show ? 'inline-flex' : 'none';
    }
  }

  /**
   * Enable SQL mode with query history for a specific dialect.
   */
  setSqlMode(dialect: string | null): void {
    this.isSqlMode = dialect !== null;
    this.currentDialect = dialect;

    if (this.historyToggle) {
      this.historyToggle.style.display = this.isSqlMode ? 'inline-flex' : 'none';
    }

    if (!this.isSqlMode && this.historyEl) {
      this.historyEl.style.display = 'none';
      this.historyCollapsed = true;
    }
  }

  /**
   * Set the query history items.
   */
  setQueryHistory(history: QueryHistoryItem[]): void {
    // Filter by current dialect
    this.queryHistory = this.currentDialect
      ? history.filter(h => h.dialect === this.currentDialect)
      : history;
    this.renderHistory();
  }

  /**
   * Add a new query result to the history.
   */
  addQueryResult(item: QueryHistoryItem): void {
    // Only add if matches current dialect
    if (this.currentDialect && item.dialect !== this.currentDialect) {
      return;
    }

    // Add to beginning (newest first)
    this.queryHistory.unshift(item);

    // Limit to 20 items
    if (this.queryHistory.length > 20) {
      this.queryHistory = this.queryHistory.slice(0, 20);
    }

    this.renderHistory();
  }

  private toggleHistory(): void {
    this.historyCollapsed = !this.historyCollapsed;

    if (this.historyEl) {
      this.historyEl.style.display = this.historyCollapsed ? 'none' : 'block';
    }

    if (this.historyToggle) {
      this.historyToggle.textContent = this.historyCollapsed ? 'History ▼' : 'History ▲';
    }
  }

  private renderHistory(): void {
    if (!this.historyEl || !this.isSqlMode) return;

    if (this.queryHistory.length === 0) {
      this.historyEl.innerHTML = '<div class="history-empty">No query history yet</div>';
      return;
    }

    const items = this.queryHistory.slice(0, 10).map((item, index) => {
      const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const icon = item.success ? '✓' : '✗';
      const iconClass = item.success ? 'success' : 'error';
      const execTime = item.executionTime ? `${item.executionTime.toFixed(0)}ms` : '';
      const sqlPreview = this.truncateSql(item.sql, 40);

      return `
        <div class="history-item ${iconClass}" data-index="${index}">
          <span class="history-time">[${time}]</span>
          <span class="history-icon ${iconClass}">${icon}</span>
          <span class="history-sql" title="${this.escapeHtml(item.sql)}">${this.escapeHtml(sqlPreview)}</span>
          <span class="history-exec-time">${execTime}</span>
        </div>
      `;
    }).join('');

    this.historyEl.innerHTML = `
      <div class="history-header">Recent Queries</div>
      <div class="history-list">${items}</div>
    `;

    // Add click handlers to history items
    this.historyEl.querySelectorAll('.history-item').forEach((el) => {
      el.addEventListener('click', () => {
        const index = parseInt((el as HTMLElement).dataset.index || '0', 10);
        const item = this.queryHistory[index];
        if (item && this.onHistoryItemClick) {
          this.onHistoryItemClick(item);
        }
      });
    });
  }

  private truncateSql(sql: string, maxLength: number): string {
    // Remove newlines and extra whitespace
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return normalized.slice(0, maxLength - 3) + '...';
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Destroy the output pane and clean up resources
   */
  destroy(): void {
    // Remove event listeners
    this.headerEl.querySelector('.output-close')?.removeEventListener('click', this.closeHandler);
    this.headerEl.querySelector('.output-clear')?.removeEventListener('click', this.clearHandler);
    this.headerEl.querySelector('.output-rerun')?.removeEventListener('click', this.rerunHandler);
    this.resetDbButton?.removeEventListener('click', this.resetDbHandler);
    this.historyToggle?.removeEventListener('click', this.historyToggleHandler);

    // Remove from DOM
    this.container.remove();
  }

  close(): void {
    this.destroy();
    this.onClose();
  }

  getElement(): HTMLElement {
    return this.container;
  }
}

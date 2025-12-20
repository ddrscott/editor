import { ExecutionResult } from '../runners/LanguageRunner';

export interface OutputPaneOptions {
  onClose: () => void;
  onRerun?: () => void;
  onResetDb?: () => void;
}

/**
 * Output pane for displaying program execution results.
 * Appears as a closeable bottom split pane.
 */
export class OutputPane {
  private container: HTMLElement;
  private headerEl: HTMLElement;
  private statusEl: HTMLElement;
  private outputEl: HTMLPreElement;
  private readonly onClose: () => void;
  private readonly onRerun?: () => void;
  private readonly onResetDb?: () => void;
  private resetDbButton: HTMLButtonElement | null = null;

  // Store bound event handlers for cleanup
  private closeHandler: () => void;
  private clearHandler: () => void;
  private rerunHandler: () => void;
  private resetDbHandler: () => void;

  constructor(parent: HTMLElement, options: OutputPaneOptions) {
    this.onClose = options.onClose;
    this.onRerun = options.onRerun;
    this.onResetDb = options.onResetDb;

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

    // Output content area
    this.outputEl = document.createElement('pre');
    this.outputEl.className = 'output-pane-content';
    this.outputEl.textContent = 'Press Cmd+R to run your program';

    // Assemble
    this.container.appendChild(this.headerEl);
    this.container.appendChild(this.statusEl);
    this.container.appendChild(this.outputEl);
    parent.appendChild(this.container);

    // Store reference to reset button
    this.resetDbButton = this.headerEl.querySelector('.output-reset-db');

    // Event listeners (using bound handlers for cleanup)
    this.headerEl.querySelector('.output-close')?.addEventListener('click', this.closeHandler);
    this.headerEl.querySelector('.output-clear')?.addEventListener('click', this.clearHandler);
    this.headerEl.querySelector('.output-rerun')?.addEventListener('click', this.rerunHandler);
    this.resetDbButton?.addEventListener('click', this.resetDbHandler);
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
   * Destroy the output pane and clean up resources
   */
  destroy(): void {
    // Remove event listeners
    this.headerEl.querySelector('.output-close')?.removeEventListener('click', this.closeHandler);
    this.headerEl.querySelector('.output-clear')?.removeEventListener('click', this.clearHandler);
    this.headerEl.querySelector('.output-rerun')?.removeEventListener('click', this.rerunHandler);
    this.resetDbButton?.removeEventListener('click', this.resetDbHandler);

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

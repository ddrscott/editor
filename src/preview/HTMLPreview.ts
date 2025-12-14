interface HTMLPreviewOptions {
  onEdit?: (content: string) => void;
  onError?: (error: string) => void;
}

export class HTMLPreview {
  private container: HTMLElement;
  private iframe: HTMLIFrameElement | null = null;
  private content: string = '';
  private isEditing = false;
  private onEdit?: (content: string) => void;
  private onError?: (error: string) => void;
  private errorOverlay: HTMLElement | null = null;

  constructor(container: HTMLElement, options?: HTMLPreviewOptions) {
    this.container = container;
    this.onEdit = options?.onEdit;
    this.onError = options?.onError;
    this.container.className = 'html-preview';
    this.render();
  }

  setContent(html: string): void {
    this.content = html;
    if (!this.isEditing) {
      this.updateIframe();
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="preview-toolbar">
        <button class="preview-refresh-btn" title="Refresh Preview">Refresh</button>
        <button class="preview-edit-btn" title="Edit HTML">Edit</button>
      </div>
      <div class="preview-frame-container">
        <iframe class="preview-iframe" sandbox="allow-scripts allow-same-origin"></iframe>
        <div class="preview-error-overlay"></div>
      </div>
    `;

    this.iframe = this.container.querySelector('.preview-iframe');
    this.errorOverlay = this.container.querySelector('.preview-error-overlay');

    const refreshBtn = this.container.querySelector('.preview-refresh-btn');
    refreshBtn?.addEventListener('click', () => this.updateIframe());

    const editBtn = this.container.querySelector('.preview-edit-btn');
    editBtn?.addEventListener('click', () => this.enterEditMode());

    this.updateIframe();
  }

  private updateIframe(): void {
    if (!this.iframe) return;

    this.clearError();

    // Create full HTML document with error catching
    const fullHtml = this.wrapContent(this.content);

    // Use srcdoc for secure content loading
    this.iframe.srcdoc = fullHtml;

    // Listen for errors from iframe
    this.setupErrorListener();
  }

  private wrapContent(content: string): string {
    // Check if content is a full HTML document
    const isFullDocument = content.trim().toLowerCase().startsWith('<!doctype') ||
                          content.trim().toLowerCase().startsWith('<html');

    if (isFullDocument) {
      // Inject error handler into existing document
      return content.replace(
        /<head[^>]*>/i,
        `$&
        <script>
          window.onerror = function(msg, url, line, col, error) {
            window.parent.postMessage({
              type: 'preview-error',
              message: msg,
              line: line,
              col: col
            }, '*');
            return true;
          };
        </script>`
      );
    }

    // Wrap in full HTML document with default styles
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      padding: 16px;
      color: #333;
      background: #fff;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-bottom: 0.5em;
      line-height: 1.2;
    }
    p {
      margin-bottom: 1em;
    }
    a {
      color: #007acc;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    pre, code {
      font-family: 'SF Mono', Consolas, monospace;
      background: #f5f5f5;
      border-radius: 4px;
    }
    code {
      padding: 2px 6px;
    }
    pre {
      padding: 12px;
      overflow-x: auto;
    }
    pre code {
      padding: 0;
      background: none;
    }
  </style>
  <script>
    window.onerror = function(msg, url, line, col, error) {
      window.parent.postMessage({
        type: 'preview-error',
        message: msg,
        line: line,
        col: col
      }, '*');
      return true;
    };
  </script>
</head>
<body>
${content}
</body>
</html>`;
  }

  private setupErrorListener(): void {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'preview-error') {
        this.showError(`Error at line ${event.data.line}: ${event.data.message}`);
        this.onError?.(event.data.message);
      }
    };

    window.addEventListener('message', handler);

    // Clean up listener when iframe updates
    this.iframe?.addEventListener('load', () => {
      // Keep listener active for runtime errors
    }, { once: true });
  }

  private showError(message: string): void {
    if (this.errorOverlay) {
      this.errorOverlay.textContent = message;
      this.errorOverlay.classList.add('visible');
    }
  }

  private clearError(): void {
    if (this.errorOverlay) {
      this.errorOverlay.textContent = '';
      this.errorOverlay.classList.remove('visible');
    }
  }

  private enterEditMode(): void {
    this.isEditing = true;
    this.container.innerHTML = `
      <div class="preview-toolbar">
        <button class="preview-done-btn" title="Done Editing">Done</button>
      </div>
      <textarea class="html-editor">${this.escapeHtml(this.content)}</textarea>
    `;

    const textarea = this.container.querySelector('.html-editor') as HTMLTextAreaElement;
    const doneBtn = this.container.querySelector('.preview-done-btn');

    textarea?.focus();

    doneBtn?.addEventListener('click', () => this.exitEditMode());

    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.exitEditMode();
      }
      // Tab support for indentation
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }
    });
  }

  private exitEditMode(): void {
    const textarea = this.container.querySelector('.html-editor') as HTMLTextAreaElement;
    if (textarea) {
      this.content = textarea.value;
      this.onEdit?.(this.content);
    }
    this.isEditing = false;
    this.render();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    this.container.innerHTML = '';
    this.iframe = null;
    this.errorOverlay = null;
  }
}

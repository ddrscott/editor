// Side-by-side Markdown Preview component
// Renders markdown and stays synced with source editor

export class MarkdownPreview {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private sourceTabId: string;
  private onClose?: () => void;

  constructor(container: HTMLElement, sourceTabId: string, onClose?: () => void) {
    this.container = container;
    this.sourceTabId = sourceTabId;
    this.onClose = onClose;
    this.container.className = 'markdown-preview-pane';
    this.render();
    this.contentEl = this.container.querySelector('.markdown-content')!;
  }

  getSourceTabId(): string {
    return this.sourceTabId;
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="preview-header">
        <span class="preview-title">Preview</span>
        <button class="preview-close" title="Close Preview">&times;</button>
      </div>
      <div class="markdown-content"></div>
    `;

    const closeBtn = this.container.querySelector('.preview-close');
    closeBtn?.addEventListener('click', () => this.onClose?.());
  }

  update(markdown: string): void {
    if (this.contentEl) {
      this.contentEl.innerHTML = this.parseMarkdown(markdown);
    }
  }

  private parseMarkdown(md: string): string {
    if (!md || !md.trim()) {
      return '<p class="empty-preview">Start typing to see preview...</p>';
    }

    let html = this.escapeHtml(md);

    // Code blocks (must be before inline code)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

    // Blockquotes (handle multi-line)
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr />');
    html = html.replace(/^\*\*\*$/gm, '<hr />');

    // Unordered lists
    html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)\n(<li>)/g, '$1$2');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Ordered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
    html = html.replace(/(<oli>.*<\/oli>)\n(<oli>)/g, '$1$2');
    html = html.replace(/(<oli>[\s\S]*?<\/oli>)/g, '<ol>$1</ol>');
    html = html.replace(/<oli>/g, '<li>');
    html = html.replace(/<\/oli>/g, '</li>');
    html = html.replace(/<\/ol>\s*<ol>/g, '');

    // Paragraphs (lines not already wrapped)
    html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');

    // Line breaks between elements
    html = html.replace(/\n\n+/g, '\n');

    return html;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    this.container.remove();
  }
}

// Simple Markdown parser without external dependencies
// For production, consider using marked or remark with WASM

interface MarkdownOptions {
  onEdit?: (content: string) => void;
}

export class MarkdownPreview {
  private container: HTMLElement;
  private content: string = '';
  private isEditing = false;
  private onEdit?: (content: string) => void;

  constructor(container: HTMLElement, options?: MarkdownOptions) {
    this.container = container;
    this.onEdit = options?.onEdit;
    this.container.className = 'markdown-preview';
    this.render();
  }

  setContent(markdown: string): void {
    this.content = markdown;
    if (!this.isEditing) {
      this.render();
    }
  }

  private render(): void {
    const html = this.parseMarkdown(this.content);
    this.container.innerHTML = `
      <div class="markdown-content" tabindex="0">
        ${html}
      </div>
      <button class="preview-edit-btn" title="Edit Markdown">Edit</button>
    `;

    const editBtn = this.container.querySelector('.preview-edit-btn');
    editBtn?.addEventListener('click', () => this.enterEditMode());

    // Make content double-clickable to edit
    const contentEl = this.container.querySelector('.markdown-content');
    contentEl?.addEventListener('dblclick', () => this.enterEditMode());
  }

  private enterEditMode(): void {
    this.isEditing = true;
    this.container.innerHTML = `
      <textarea class="markdown-editor">${this.escapeHtml(this.content)}</textarea>
      <button class="preview-done-btn" title="Done Editing">Done</button>
    `;

    const textarea = this.container.querySelector('.markdown-editor') as HTMLTextAreaElement;
    const doneBtn = this.container.querySelector('.preview-done-btn');

    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);

    doneBtn?.addEventListener('click', () => this.exitEditMode());

    // Also exit on Escape
    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.exitEditMode();
      }
    });
  }

  private exitEditMode(): void {
    const textarea = this.container.querySelector('.markdown-editor') as HTMLTextAreaElement;
    if (textarea) {
      this.content = textarea.value;
      this.onEdit?.(this.content);
    }
    this.isEditing = false;
    this.render();
  }

  private parseMarkdown(md: string): string {
    if (!md) return '<p class="empty-preview">No content</p>';

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

    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr />');
    html = html.replace(/^\*\*\*$/gm, '<hr />');

    // Unordered lists
    html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)\n(<li>)/g, '$1$2');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    // Clean up nested uls
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

    // Line breaks
    html = html.replace(/\n\n+/g, '\n');

    return html;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}

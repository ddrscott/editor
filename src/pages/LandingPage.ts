import { Router } from '../router/Router';
import { createIcons, FileCode, FileText, FileJson, Database, Terminal, Braces, Hash, Code, File } from 'lucide';

interface LanguageOption {
  name: string;
  filename: string;
  icon: string;
}

const LANGUAGES: LanguageOption[] = [
  { name: 'JavaScript', filename: 'script.js', icon: 'file-code' },
  { name: 'TypeScript', filename: 'app.ts', icon: 'file-code' },
  { name: 'Python', filename: 'main.py', icon: 'file-code' },
  { name: 'Java', filename: 'Main.java', icon: 'file-code' },
  { name: 'C++', filename: 'main.cpp', icon: 'file-code' },
  { name: 'C', filename: 'main.c', icon: 'file-code' },
  { name: 'C#', filename: 'Program.cs', icon: 'file-code' },
  { name: 'Go', filename: 'main.go', icon: 'file-code' },
  { name: 'Rust', filename: 'main.rs', icon: 'file-code' },
  { name: 'Ruby', filename: 'app.rb', icon: 'file-code' },
  { name: 'PHP', filename: 'index.php', icon: 'file-code' },
  { name: 'Swift', filename: 'main.swift', icon: 'file-code' },
  { name: 'Kotlin', filename: 'Main.kt', icon: 'file-code' },
  { name: 'HTML', filename: 'index.html', icon: 'code' },
  { name: 'CSS', filename: 'styles.css', icon: 'braces' },
  { name: 'Markdown', filename: 'README.md', icon: 'file-text' },
  { name: 'JSON', filename: 'data.json', icon: 'file-json' },
  { name: 'SQL', filename: 'query.sql', icon: 'database' },
  { name: 'Shell', filename: 'script.sh', icon: 'terminal' },
  { name: 'YAML', filename: 'config.yaml', icon: 'file' },
];

export class LandingPage {
  private element: HTMLElement;
  private router: Router;

  constructor(container: HTMLElement, router: Router) {
    this.router = router;
    this.element = document.createElement('div');
    this.element.className = 'landing-page';
    this.render();
    container.appendChild(this.element);
    this.initIcons();
  }

  private render(): void {
    const languageButtons = LANGUAGES.map(lang => `
      <a href="/new/${encodeURIComponent(lang.filename)}" class="lang-btn" title="${lang.name}">
        <i data-lucide="${lang.icon}"></i>
        <span class="lang-name">${lang.name}</span>
        <span class="lang-ext">${lang.filename.split('.').pop()}</span>
      </a>
    `).join('');

    this.element.innerHTML = `
      <div class="landing-container">
        <header class="landing-header">
          <span class="landing-logo">monaco</span>
        </header>

        <main class="landing-hero">
          <h1>Collaborative code editor</h1>
          <p class="landing-subtitle">
            Share a link. Edit together. No signup required.
          </p>

          <button class="landing-cta" id="create-space-btn">
            New Space
          </button>

          <p class="landing-hint">
            <kbd>Cmd</kbd> + <kbd>Enter</kbd>
          </p>

          <section class="lang-grid-section">
            <h2 class="lang-grid-title">Quick Start</h2>
            <div class="lang-grid">
              ${languageButtons}
            </div>
          </section>

          <ul class="landing-features">
            <li>Monaco editor with 50+ language support</li>
            <li>Real-time collaboration with cursor tracking</li>
            <li>Markdown and HTML preview</li>
            <li>Split panes and multiple tabs</li>
          </ul>
        </main>

        <footer class="landing-footer">
          <div class="landing-footer-links">
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </div>
          <p class="landing-footer-text">
            Made by Scott Pierce. Sponsored by Left Join Studio, Inc.
          </p>
        </footer>
      </div>
    `;

    const createBtn = this.element.querySelector('#create-space-btn');
    createBtn?.addEventListener('click', () => this.createSpace());

    document.addEventListener('keydown', this.handleKeydown);
  }

  private initIcons(): void {
    // Initialize Lucide icons after element is in DOM
    createIcons({
      icons: { FileCode, FileText, FileJson, Database, Terminal, Braces, Hash, Code, File },
      attrs: {
        'stroke-width': 1.5,
        width: 20,
        height: 20,
      },
      nameAttr: 'data-lucide',
    });
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      this.createSpace();
    }
  };

  private async createSpace(): Promise<void> {
    const btn = this.element.querySelector('#create-space-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creating...';
    }

    // Server creates space with default state and redirects to /space/{id}
    window.location.href = '/new';
  }

  destroy(): void {
    document.removeEventListener('keydown', this.handleKeydown);
    this.element.remove();
  }
}

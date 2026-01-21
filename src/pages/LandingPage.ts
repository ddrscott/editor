import { Router } from '../router/Router';
import { createIcons, FileCode, FileText, FileJson, Database, Terminal, Braces, Hash, Code, File } from 'lucide';

interface LanguageOption {
  name: string;
  filename: string;
  icon: string;
  runnable?: boolean;
}

// Languages with browser runtime support
const RUNNABLE_LANGUAGES: LanguageOption[] = [
  { name: 'Python', filename: 'main.py', icon: 'file-code', runnable: true },
  { name: 'Java', filename: 'Main.java', icon: 'file-code', runnable: true },
  { name: 'Ruby', filename: 'app.rb', icon: 'file-code', runnable: true },
  { name: 'Lua', filename: 'script.lua', icon: 'file-code', runnable: true },
  { name: 'PostgreSQL', filename: 'query.pgsql', icon: 'database', runnable: true },
  { name: 'MySQL', filename: 'query.mysql', icon: 'database', runnable: true },
  { name: 'SQL Server', filename: 'query.mssql', icon: 'database', runnable: true },
  { name: 'DuckDB', filename: 'query.duckdb', icon: 'database', runnable: true },
  { name: 'SQLite', filename: 'query.sql', icon: 'database', runnable: true },
];

// Syntax highlighting only
const SYNTAX_LANGUAGES: LanguageOption[] = [
  { name: 'JavaScript', filename: 'script.js', icon: 'file-code' },
  { name: 'TypeScript', filename: 'app.ts', icon: 'file-code' },
  { name: 'C++', filename: 'main.cpp', icon: 'file-code' },
  { name: 'C', filename: 'main.c', icon: 'file-code' },
  { name: 'C#', filename: 'Program.cs', icon: 'file-code' },
  { name: 'Go', filename: 'main.go', icon: 'file-code' },
  { name: 'Rust', filename: 'main.rs', icon: 'file-code' },
  { name: 'PHP', filename: 'index.php', icon: 'file-code' },
  { name: 'Swift', filename: 'main.swift', icon: 'file-code' },
  { name: 'Kotlin', filename: 'Main.kt', icon: 'file-code' },
  { name: 'HTML', filename: 'index.html', icon: 'code' },
  { name: 'CSS', filename: 'styles.css', icon: 'braces' },
  { name: 'Markdown', filename: 'README.md', icon: 'file-text' },
  { name: 'JSON', filename: 'data.json', icon: 'file-json' },
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
    const runnableButtons = RUNNABLE_LANGUAGES.map(lang => `
      <a href="/new/${encodeURIComponent(lang.filename)}" class="lang-btn lang-btn-runnable" title="${lang.name} - Run in browser">
        <span class="lang-run-badge">Run</span>
        <i data-lucide="${lang.icon}"></i>
        <span class="lang-name">${lang.name}</span>
        <span class="lang-ext">${lang.filename.split('.').pop()}</span>
      </a>
    `).join('');

    const syntaxButtons = SYNTAX_LANGUAGES.map(lang => `
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

          <section class="lang-grid-section lang-grid-featured">
            <h2 class="lang-grid-title">Run in Browser</h2>
            <div class="lang-grid">
              ${runnableButtons}
            </div>
          </section>

          <section class="lang-grid-section">
            <h2 class="lang-grid-title">Quick Start</h2>
            <div class="lang-grid">
              ${syntaxButtons}
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

  destroy(): void {
    this.element.remove();
  }
}

import { Router } from '../router/Router';

export class LandingPage {
  private element: HTMLElement;
  private router: Router;

  constructor(container: HTMLElement, router: Router) {
    this.router = router;
    this.element = document.createElement('div');
    this.element.className = 'landing-page';
    this.render();
    container.appendChild(this.element);
  }

  private render(): void {
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

    try {
      // For now, generate UUID client-side (will be server-side later)
      const uuid = crypto.randomUUID();
      this.router.navigate(`/space/${uuid}`);
    } catch (error) {
      console.error('Failed to create space:', error);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Create New Space';
      }
    }
  }

  destroy(): void {
    document.removeEventListener('keydown', this.handleKeydown);
    this.element.remove();
  }
}

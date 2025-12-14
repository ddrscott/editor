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
          <span class="landing-logo">MONACO</span>
        </header>

        <main class="landing-hero">
          <h1>Code Together, Instantly</h1>
          <p class="landing-subtitle">
            Create shareable code snippets with the power of VS Code's editor.
            Real-time collaboration, syntax highlighting, and instant sharing.
          </p>

          <div class="landing-features">
            <div class="feature">
              <div class="feature-icon">&#x1F4DD;</div>
              <h3>Monaco Editor</h3>
              <p>Full VS Code editing experience with syntax highlighting for 50+ languages</p>
            </div>
            <div class="feature">
              <div class="feature-icon">&#x1F465;</div>
              <h3>Real-time Collaboration</h3>
              <p>Multiple users can edit simultaneously with live cursor tracking</p>
            </div>
            <div class="feature">
              <div class="feature-icon">&#x1F517;</div>
              <h3>Instant Sharing</h3>
              <p>Share your space URL - no signup required, works immediately</p>
            </div>
            <div class="feature">
              <div class="feature-icon">&#x1F440;</div>
              <h3>Live Preview</h3>
              <p>Render Markdown and HTML/JS with in-browser preview modes</p>
            </div>
          </div>

          <button class="landing-cta" id="create-space-btn">
            Create New Space
          </button>

          <p class="landing-hint">
            Press the button or use <kbd>Cmd</kbd> + <kbd>Enter</kbd>
          </p>
        </main>

        <footer class="landing-footer">
          <p>Built with Monaco Editor &middot; Powered by Cloudflare</p>
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

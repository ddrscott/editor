import { Router } from '../router/Router';

export type LegalPageType = 'terms' | 'privacy';

const TERMS_CONTENT = `
<h1>Terms of Service</h1>
<p class="legal-updated">Last updated: December 2024</p>

<h2>Use of Service</h2>
<p>Monaco is a collaborative code editor. By using this service, you agree to use it responsibly and not for any illegal or harmful purposes.</p>

<h2>Content</h2>
<p>You retain ownership of any code or content you create. However, content in shared spaces is visible to anyone with the link. Do not share sensitive information.</p>

<h2>Acceptable Use</h2>
<p>You agree not to:</p>
<ul>
<li>Use the service for illegal activities</li>
<li>Attempt to disrupt or overload the service</li>
<li>Share malicious code or content</li>
<li>Harvest data from other users</li>
</ul>

<h2>Disclaimer</h2>
<p>The service is provided "as is" without warranties. We are not liable for any data loss or damages arising from use of the service.</p>

<h2>Changes</h2>
<p>We may update these terms at any time. Continued use constitutes acceptance of changes.</p>
`;

const PRIVACY_CONTENT = `
<h1>Privacy Policy</h1>
<p class="legal-updated">Last updated: December 2024</p>

<h2>What We Collect</h2>
<p>We collect minimal data to operate the service:</p>
<ul>
<li>Usage metrics (page views, space access counts)</li>
<li>Content you create in shared spaces</li>
<li>Technical data (browser type, IP address) for security</li>
</ul>

<h2>How We Use Data</h2>
<p>We use collected data to:</p>
<ul>
<li>Provide and improve the service</li>
<li>Monitor for abuse and security issues</li>
<li>Understand usage patterns</li>
</ul>

<h2>What We Don't Do</h2>
<p>We will not:</p>
<ul>
<li>Sell your data to third parties</li>
<li>Use your content for advertising</li>
<li>Share your information except as required by law</li>
</ul>

<h2>Data Retention</h2>
<p>Space content is retained until deleted. Usage metrics are aggregated and anonymized.</p>

<h2>Contact</h2>
<p>Questions about privacy? Contact us through Left Join Studio, Inc.</p>
`;

export class LegalPage {
  private element: HTMLElement;
  private router: Router;

  constructor(container: HTMLElement, router: Router, type: LegalPageType) {
    this.router = router;
    this.element = document.createElement('div');
    this.element.className = 'legal-page';
    this.render(type);
    container.appendChild(this.element);
  }

  private render(type: LegalPageType): void {
    const content = type === 'terms' ? TERMS_CONTENT : PRIVACY_CONTENT;

    this.element.innerHTML = `
      <div class="legal-container">
        <header class="legal-header">
          <a href="/" class="legal-back">&larr; Back</a>
          <span class="legal-logo">monaco</span>
        </header>
        <main class="legal-content">
          ${content}
        </main>
        <footer class="legal-footer">
          <p>Made by Scott Pierce. Sponsored by Left Join Studio, Inc.</p>
        </footer>
      </div>
    `;

    const backLink = this.element.querySelector('.legal-back');
    backLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.router.navigate('/');
    });
  }

  destroy(): void {
    this.element.remove();
  }
}

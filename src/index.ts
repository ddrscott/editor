import { Router } from './router/Router';
import { LandingPage } from './pages/LandingPage';
import { EditorApp } from './app/EditorApp';

// Set initial page title
document.title = 'Monaco';

// Current page instance for cleanup
let currentPage: { destroy(): void } | null = null;

// Initialize router
const appContainer = document.getElementById('app')!;
const router = new Router(appContainer);

// Route: Landing page
router.route('/', () => {
  if (currentPage) {
    currentPage.destroy();
  }
  appContainer.innerHTML = '';
  document.title = 'Monaco - Code Together, Instantly';
  currentPage = new LandingPage(appContainer, router);
});

// Route: Space page (editor)
router.route('/space/:id', async (params) => {
  if (currentPage) {
    currentPage.destroy();
  }
  appContainer.innerHTML = '';

  // Create a wrapper element that matches the expected structure
  const editorContainer = document.createElement('div');
  editorContainer.id = 'editor-app';
  editorContainer.style.cssText = 'height: 100%; width: 100%; display: flex; flex-direction: column;';
  appContainer.appendChild(editorContainer);

  const editorApp = new EditorApp(editorContainer, params.id);

  currentPage = {
    destroy: () => {
      editorApp.destroy();
      editorContainer.remove();
    }
  };
});

// Start the router
router.start();

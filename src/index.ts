import * as monaco from 'monaco-editor';

interface TabData {
  id: string;
  title: string;
  content: string;
  viewState: monaco.editor.ICodeEditorViewState | null;
}

interface PaneData {
  id: string;
  tabs: TabData[];
  activeTabId: string | null;
}

interface SplitData {
  type: 'pane' | 'split';
  direction?: 'horizontal' | 'vertical';
  children?: SplitData[];
  paneId?: string;
  sizes?: number[];
}

interface StoredState {
  layout: SplitData;
  panes: PaneData[];
  tabCounter: number;
}

interface EditorSettingsData {
  minimap: boolean;
  wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
  fontSize: number;
  theme: string;
  lineNumbers: 'on' | 'off' | 'relative';
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
  tabSize: number;
}

const DEFAULT_SETTINGS: EditorSettingsData = {
  minimap: false,
  wordWrap: 'on',
  fontSize: 14,
  theme: 'vs-dark',
  lineNumbers: 'on',
  renderWhitespace: 'none',
  tabSize: 2,
};

class EditorSettings {
  private static readonly STORAGE_KEY = 'monaco-editor-settings';
  private settings: EditorSettingsData;
  private listeners: Set<(settings: EditorSettingsData) => void> = new Set();

  constructor() {
    this.settings = this.load();
  }

  private load(): EditorSettingsData {
    try {
      const stored = localStorage.getItem(EditorSettings.STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private save(): void {
    try {
      localStorage.setItem(EditorSettings.STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  get<K extends keyof EditorSettingsData>(key: K): EditorSettingsData[K] {
    return this.settings[key];
  }

  set<K extends keyof EditorSettingsData>(key: K, value: EditorSettingsData[K]): void {
    this.settings[key] = value;
    this.save();
    this.notifyListeners();
  }

  toggle(key: 'minimap'): boolean;
  toggle(key: 'lineNumbers'): 'on' | 'off' | 'relative';
  toggle(key: 'wordWrap'): 'on' | 'off';
  toggle(key: 'minimap' | 'lineNumbers' | 'wordWrap'): boolean | string {
    if (key === 'minimap') {
      this.settings.minimap = !this.settings.minimap;
      this.save();
      this.notifyListeners();
      return this.settings.minimap;
    } else if (key === 'lineNumbers') {
      const cycle: Array<'on' | 'off' | 'relative'> = ['on', 'off', 'relative'];
      const currentIndex = cycle.indexOf(this.settings.lineNumbers);
      this.settings.lineNumbers = cycle[(currentIndex + 1) % cycle.length];
      this.save();
      this.notifyListeners();
      return this.settings.lineNumbers;
    } else if (key === 'wordWrap') {
      this.settings.wordWrap = this.settings.wordWrap === 'on' ? 'off' : 'on';
      this.save();
      this.notifyListeners();
      return this.settings.wordWrap;
    }
    return false;
  }

  getAll(): EditorSettingsData {
    return { ...this.settings };
  }

  getMonacoOptions(): monaco.editor.IEditorOptions {
    return {
      minimap: { enabled: this.settings.minimap },
      wordWrap: this.settings.wordWrap,
      fontSize: this.settings.fontSize,
      lineNumbers: this.settings.lineNumbers,
      renderWhitespace: this.settings.renderWhitespace,
      tabSize: this.settings.tabSize,
    };
  }

  onChange(listener: (settings: EditorSettingsData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.settings));
  }
}

// Register custom actions with Monaco's built-in command system
function registerEditorActions(settings: EditorSettings): void {
  // Toggle Minimap
  monaco.editor.addEditorAction({
    id: 'editor.action.toggleMinimap',
    label: 'View: Toggle Minimap',
    keybindings: [],
    run: () => {
      settings.toggle('minimap');
    }
  });

  // Toggle Word Wrap
  monaco.editor.addEditorAction({
    id: 'editor.action.toggleWordWrap',
    label: 'View: Toggle Word Wrap',
    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
    run: () => {
      settings.toggle('wordWrap');
    }
  });

  // Toggle Line Numbers
  monaco.editor.addEditorAction({
    id: 'editor.action.toggleLineNumbers',
    label: 'View: Toggle Line Numbers',
    keybindings: [],
    run: () => {
      settings.toggle('lineNumbers');
    }
  });

  // Increase Font Size
  monaco.editor.addEditorAction({
    id: 'editor.action.increaseFontSize',
    label: 'View: Increase Font Size',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal],
    run: () => {
      settings.set('fontSize', settings.get('fontSize') + 1);
    }
  });

  // Decrease Font Size
  monaco.editor.addEditorAction({
    id: 'editor.action.decreaseFontSize',
    label: 'View: Decrease Font Size',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus],
    run: () => {
      settings.set('fontSize', Math.max(8, settings.get('fontSize') - 1));
    }
  });

  // Reset Font Size
  monaco.editor.addEditorAction({
    id: 'editor.action.resetFontSize',
    label: 'View: Reset Font Size',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0],
    run: () => {
      settings.set('fontSize', 14);
    }
  });

  // Theme: Light
  monaco.editor.addEditorAction({
    id: 'editor.action.setThemeLight',
    label: 'Preferences: Color Theme - Light',
    keybindings: [],
    run: () => {
      settings.set('theme', 'vs');
    }
  });

  // Theme: Dark
  monaco.editor.addEditorAction({
    id: 'editor.action.setThemeDark',
    label: 'Preferences: Color Theme - Dark',
    keybindings: [],
    run: () => {
      settings.set('theme', 'vs-dark');
    }
  });

  // Theme: High Contrast
  monaco.editor.addEditorAction({
    id: 'editor.action.setThemeHighContrast',
    label: 'Preferences: Color Theme - High Contrast',
    keybindings: [],
    run: () => {
      settings.set('theme', 'hc-black');
    }
  });

  // Toggle Whitespace
  monaco.editor.addEditorAction({
    id: 'editor.action.toggleRenderWhitespace',
    label: 'View: Toggle Render Whitespace',
    keybindings: [],
    run: () => {
      const current = settings.get('renderWhitespace');
      const cycle: Array<'none' | 'boundary' | 'all'> = ['none', 'boundary', 'all'];
      const idx = cycle.indexOf(current as 'none' | 'boundary' | 'all');
      settings.set('renderWhitespace', cycle[(idx + 1) % cycle.length]);
    }
  });

  // Tab Size options
  [2, 4, 8].forEach(size => {
    monaco.editor.addEditorAction({
      id: `editor.action.setTabSize${size}`,
      label: `Preferences: Set Tab Size to ${size}`,
      keybindings: [],
      run: () => {
        settings.set('tabSize', size);
      }
    });
  });
}

class EditorStorage {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'monaco-editor-db';
  private readonly STORE_NAME = 'editor-state';
  private readonly STATE_KEY = 'state';

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 2);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
    });
  }

  async save(state: StoredState): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.put(state, this.STATE_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async load(): Promise<StoredState | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(this.STATE_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }
}

interface Tab {
  id: string;
  title: string;
  model: monaco.editor.ITextModel;
  viewState: monaco.editor.ICodeEditorViewState | null;
}

type SplitDirection = 'left' | 'right' | 'top' | 'bottom';

class Pane {
  readonly id: string;
  readonly element: HTMLElement;
  private editor: monaco.editor.IStandaloneCodeEditor;
  private tabs: Tab[] = [];
  private activeTabId: string | null = null;
  private tabsContainer: HTMLElement;
  private editorContainer: HTMLElement;
  private dropZones: HTMLElement;
  private app: EditorApp;
  private draggedTabId: string | null = null;

  constructor(app: EditorApp, id?: string) {
    this.app = app;
    this.id = id || `pane-${Date.now()}`;

    this.element = document.createElement('div');
    this.element.className = 'pane';
    this.element.dataset.paneId = this.id;

    this.tabsContainer = document.createElement('div');
    this.tabsContainer.className = 'tabs';

    const addButton = document.createElement('div');
    addButton.className = 'tab-add';
    addButton.innerHTML = '+';
    addButton.title = 'New Tab (Ctrl+N)';
    addButton.addEventListener('click', () => this.app.createNewTab(this));
    this.tabsContainer.appendChild(addButton);

    this.editorContainer = document.createElement('div');
    this.editorContainer.className = 'editor-container';

    this.dropZones = document.createElement('div');
    this.dropZones.className = 'drop-zones';
    this.dropZones.innerHTML = `
      <div class="drop-zone drop-zone-left" data-direction="left"></div>
      <div class="drop-zone drop-zone-right" data-direction="right"></div>
      <div class="drop-zone drop-zone-top" data-direction="top"></div>
      <div class="drop-zone drop-zone-bottom" data-direction="bottom"></div>
      <div class="drop-zone drop-zone-center" data-direction="center"></div>
    `;

    this.element.appendChild(this.tabsContainer);
    this.element.appendChild(this.editorContainer);
    this.element.appendChild(this.dropZones);

    const settings = this.app.getSettings();
    this.editor = monaco.editor.create(this.editorContainer, {
      theme: settings.get('theme'),
      automaticLayout: true,
      scrollBeyondLastLine: false,
      ...settings.getMonacoOptions(),
    });

    this.setupKeyboardShortcuts();
    this.setupDropZones();

    settings.onChange(() => this.applySettings());
  }

  applySettings(): void {
    const settings = this.app.getSettings();
    this.editor.updateOptions(settings.getMonacoOptions());
    monaco.editor.setTheme(settings.get('theme'));
  }

  private setupKeyboardShortcuts(): void {
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {
      this.app.createNewTab(this);
    });

    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
      if (this.activeTabId) {
        this.closeTab(this.activeTabId);
      }
    });

    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, () => {
      this.switchToNextTab();
    });

    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Tab, () => {
      this.switchToPrevTab();
    });

    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      this.app.saveState();
    });

    this.editor.onDidFocusEditorText(() => {
      this.app.setActivePane(this);
    });
  }

  private setupDropZones(): void {
    const zones = this.dropZones.querySelectorAll('.drop-zone');

    zones.forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.app.getDraggedTab()) {
          zone.classList.add('active');
        }
      });

      zone.addEventListener('dragleave', () => {
        zone.classList.remove('active');
      });

      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('active');
        const direction = (zone as HTMLElement).dataset.direction as SplitDirection | 'center';
        const draggedTab = this.app.getDraggedTab();

        if (draggedTab) {
          if (direction === 'center') {
            this.app.moveTabToPane(draggedTab.tab, draggedTab.sourcePane, this);
          } else {
            this.app.splitPane(this, direction, draggedTab.tab, draggedTab.sourcePane);
          }
        }
      });
    });
  }

  showDropZones(): void {
    this.dropZones.classList.add('visible');
  }

  hideDropZones(): void {
    this.dropZones.classList.remove('visible');
    this.dropZones.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('active'));
  }

  addTab(tab: Tab, activate = true): void {
    this.tabs.push(tab);
    this.renderTab(tab);
    if (activate) {
      this.activateTab(tab.id);
    }
  }

  removeTab(tabId: string): Tab | null {
    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index === -1) return null;

    const [tab] = this.tabs.splice(index, 1);
    const tabElement = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) tabElement.remove();

    if (this.activeTabId === tabId) {
      if (this.tabs.length > 0) {
        const newIndex = Math.min(index, this.tabs.length - 1);
        this.activateTab(this.tabs[newIndex].id);
      } else {
        this.activeTabId = null;
        this.editor.setModel(null);
      }
    }

    return tab;
  }

  private renderTab(tab: Tab): void {
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = tab.id;
    tabElement.draggable = true;

    tabElement.addEventListener('dragstart', (e) => {
      this.draggedTabId = tab.id;
      tabElement.classList.add('dragging');
      e.dataTransfer!.effectAllowed = 'move';
      this.app.setDraggedTab(tab, this);
      this.app.showAllDropZones();
    });

    tabElement.addEventListener('dragend', () => {
      this.draggedTabId = null;
      tabElement.classList.remove('dragging');
      this.tabsContainer.querySelectorAll('.tab').forEach(el => {
        el.classList.remove('drag-over-left', 'drag-over-right');
      });
      this.app.clearDraggedTab();
      this.app.hideAllDropZones();
    });

    tabElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggedTab = this.app.getDraggedTab();
      if (!draggedTab || (draggedTab.sourcePane === this && draggedTab.tab.id === tab.id)) return;

      const rect = tabElement.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;

      tabElement.classList.remove('drag-over-left', 'drag-over-right');
      if (e.clientX < midpoint) {
        tabElement.classList.add('drag-over-left');
      } else {
        tabElement.classList.add('drag-over-right');
      }
    });

    tabElement.addEventListener('dragleave', () => {
      tabElement.classList.remove('drag-over-left', 'drag-over-right');
    });

    tabElement.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const draggedTab = this.app.getDraggedTab();
      if (!draggedTab) return;

      const rect = tabElement.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const insertBefore = e.clientX < midpoint;

      if (draggedTab.sourcePane === this) {
        this.reorderTab(draggedTab.tab.id, tab.id, insertBefore);
      } else {
        this.app.moveTabToPane(draggedTab.tab, draggedTab.sourcePane, this, tab.id, insertBefore);
      }

      tabElement.classList.remove('drag-over-left', 'drag-over-right');
    });

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tab.title;
    titleSpan.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.renameTab(tab.id);
    });

    const closeButton = document.createElement('span');
    closeButton.className = 'tab-close';
    closeButton.innerHTML = '×';
    closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });

    tabElement.appendChild(titleSpan);
    tabElement.appendChild(closeButton);
    tabElement.addEventListener('click', () => this.activateTab(tab.id));

    const addButton = this.tabsContainer.querySelector('.tab-add');
    this.tabsContainer.insertBefore(tabElement, addButton);
  }

  private reorderTab(draggedId: string, targetId: string, insertBefore: boolean): void {
    const draggedIndex = this.tabs.findIndex(t => t.id === draggedId);
    const targetIndex = this.tabs.findIndex(t => t.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedTab] = this.tabs.splice(draggedIndex, 1);
    const newIndex = insertBefore
      ? (draggedIndex < targetIndex ? targetIndex - 1 : targetIndex)
      : (draggedIndex < targetIndex ? targetIndex : targetIndex + 1);

    this.tabs.splice(newIndex, 0, draggedTab);

    this.tabsContainer.querySelectorAll('.tab').forEach(el => el.remove());
    for (const tab of this.tabs) {
      this.renderTab(tab);
    }

    this.tabsContainer.querySelectorAll('.tab').forEach(el => {
      el.classList.toggle('active', el.dataset.tabId === this.activeTabId);
    });

    this.app.scheduleSave();
  }

  activateTab(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (this.activeTabId) {
      const currentTab = this.tabs.find(t => t.id === this.activeTabId);
      if (currentTab) {
        currentTab.viewState = this.editor.saveViewState();
      }
    }

    this.activeTabId = tabId;
    this.editor.setModel(tab.model);

    if (tab.viewState) {
      this.editor.restoreViewState(tab.viewState);
    }

    this.editor.focus();

    this.tabsContainer.querySelectorAll('.tab').forEach(el => {
      el.classList.toggle('active', el.dataset.tabId === tabId);
    });

    this.app.setActivePane(this);
  }

  closeTab(tabId: string): void {
    const tab = this.removeTab(tabId);
    if (tab) {
      tab.model.dispose();
    }

    if (this.tabs.length === 0) {
      this.app.handleEmptyPane(this);
    }

    this.app.scheduleSave();
  }

  private renameTab(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    const tabElement = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    const titleSpan = tabElement?.querySelector('.tab-title');
    if (!titleSpan) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = tab.title;
    input.style.cssText = 'background: #3c3c3c; border: 1px solid #007acc; color: white; font-size: 13px; padding: 0 4px; width: 120px;';

    let finished = false;
    const finishRename = () => {
      if (finished) return;
      finished = true;

      const newTitle = input.value.trim() || tab.title;
      tab.title = newTitle;
      titleSpan.textContent = newTitle;

      const newLanguage = this.app.getLanguageFromTitle(newTitle);
      monaco.editor.setModelLanguage(tab.model, newLanguage);

      input.replaceWith(titleSpan);
      this.app.scheduleSave();
    };

    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishRename();
      } else if (e.key === 'Escape') {
        input.value = tab.title;
        finishRename();
      }
    });

    titleSpan.replaceWith(input);
    input.focus();
    input.select();
  }

  markTabModified(tabId: string, modified: boolean): void {
    const tabElement = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) {
      tabElement.classList.toggle('modified', modified);
    }
  }

  clearAllModified(): void {
    for (const tab of this.tabs) {
      this.markTabModified(tab.id, false);
    }
  }

  switchToNextTab(): void {
    if (this.tabs.length < 2) return;
    const currentIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
    const nextIndex = (currentIndex + 1) % this.tabs.length;
    this.activateTab(this.tabs[nextIndex].id);
  }

  switchToPrevTab(): void {
    if (this.tabs.length < 2) return;
    const currentIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
    const prevIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
    this.activateTab(this.tabs[prevIndex].id);
  }

  getTabs(): Tab[] {
    return this.tabs;
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  saveViewState(): void {
    if (this.activeTabId) {
      const tab = this.tabs.find(t => t.id === this.activeTabId);
      if (tab) {
        tab.viewState = this.editor.saveViewState();
      }
    }
  }

  isEmpty(): boolean {
    return this.tabs.length === 0;
  }

  dispose(): void {
    this.editor.dispose();
    this.element.remove();
  }

  layout(): void {
    this.editor.layout();
  }

  openCommandPalette(): void {
    this.editor.focus();
    this.editor.trigger('keyboard', 'editor.action.quickCommand', null);
  }
}

class EditorApp {
  private container: HTMLElement;
  private panes: Map<string, Pane> = new Map();
  private activePane: Pane | null = null;
  private storage: EditorStorage;
  private settings: EditorSettings;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private tabCounter = 0;
  private draggedTab: { tab: Tab; sourcePane: Pane } | null = null;
  private layoutRoot: HTMLElement;

  constructor() {
    this.container = document.getElementById('app')!;
    this.container.innerHTML = '';
    this.storage = new EditorStorage();
    this.settings = new EditorSettings();

    // Apply initial theme
    monaco.editor.setTheme(this.settings.get('theme'));

    // Register custom editor actions
    registerEditorActions(this.settings);

    this.layoutRoot = document.createElement('div');
    this.layoutRoot.className = 'layout-root';
    this.container.appendChild(this.layoutRoot);

    const logo = document.createElement('a');
    logo.className = 'app-logo';
    logo.href = 'https://monaco.ljs.app';
    logo.target = '_blank';
    logo.rel = 'noopener';
    logo.textContent = 'MONACO';
    this.container.appendChild(logo);

    this.init();
    this.setupGlobalShortcuts();

    window.addEventListener('resize', () => {
      this.panes.forEach(pane => pane.layout());
    });
  }

  getSettings(): EditorSettings {
    return this.settings;
  }

  private setupGlobalShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl) {
        switch (e.key.toLowerCase()) {
          case 'n': // New tab
            e.preventDefault();
            if (this.activePane) {
              this.createNewTab(this.activePane);
            }
            break;

          case 'w': // Close tab
            e.preventDefault();
            if (this.activePane) {
              const activeTabId = this.activePane.getActiveTabId();
              if (activeTabId) {
                this.activePane.closeTab(activeTabId);
              }
            }
            break;

          case 's': // Save
            e.preventDefault();
            this.saveState();
            break;

          case 't': // Prevent new browser tab
            e.preventDefault();
            if (this.activePane) {
              this.createNewTab(this.activePane);
            }
            break;

          case 'r': // Prevent reload
            e.preventDefault();
            break;

          case 'tab': // Tab switching
            e.preventDefault();
            if (this.activePane) {
              if (e.shiftKey) {
                this.activePane.switchToPrevTab();
              } else {
                this.activePane.switchToNextTab();
              }
            }
            break;
        }
      }

      // F1 or Cmd+P or Cmd+Shift+P - Open command palette
      if (e.key === 'F1' || (cmdOrCtrl && e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        if (this.activePane) {
          this.activePane.openCommandPalette();
        }
      }

      // Prevent F5 reload
      if (e.key === 'F5') {
        e.preventDefault();
      }
    });

    // Prevent accidental navigation
    window.addEventListener('beforeunload', (e) => {
      // Check if any pane has modified tabs
      let hasModified = false;
      this.panes.forEach(pane => {
        const tabs = pane.getTabs();
        // We don't track modified state separately, but we can warn anyway
        if (tabs.length > 0) {
          hasModified = true;
        }
      });

      if (hasModified) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  private async init(): Promise<void> {
    await this.storage.init();
    const state = await this.storage.load();

    if (state && state.panes && state.panes.length > 0 && state.layout) {
      this.tabCounter = state.tabCounter;
      this.restoreLayout(state);
    } else {
      const pane = new Pane(this);
      this.panes.set(pane.id, pane);
      this.layoutRoot.appendChild(pane.element);
      this.activePane = pane;
      this.createNewTab(pane);
    }
  }

  private restoreLayout(state: StoredState): void {
    const paneDataMap = new Map(state.panes.map(p => [p.id, p]));
    this.restoreLayoutNode(state.layout, this.layoutRoot, paneDataMap);

    if (this.panes.size > 0) {
      this.activePane = this.panes.values().next().value;
    }
  }

  private restoreLayoutNode(
    node: SplitData,
    parent: HTMLElement,
    paneDataMap: Map<string, PaneData>
  ): void {
    if (node.type === 'pane' && node.paneId) {
      const paneData = paneDataMap.get(node.paneId);
      const pane = new Pane(this, node.paneId);
      this.panes.set(pane.id, pane);
      parent.appendChild(pane.element);

      if (paneData) {
        for (const tabData of paneData.tabs) {
          const tab = this.createTabFromData(tabData);
          pane.addTab(tab, false);
        }
        if (paneData.activeTabId) {
          pane.activateTab(paneData.activeTabId);
        } else if (paneData.tabs.length > 0) {
          pane.activateTab(paneData.tabs[0].id);
        }
      }
    } else if (node.type === 'split' && node.children) {
      const splitContainer = document.createElement('div');
      splitContainer.className = `split-container split-${node.direction}`;
      parent.appendChild(splitContainer);

      node.children.forEach((child, index) => {
        const childWrapper = document.createElement('div');
        childWrapper.className = 'split-child';
        if (node.sizes && node.sizes[index]) {
          childWrapper.style.flexBasis = `${node.sizes[index]}%`;
        }
        splitContainer.appendChild(childWrapper);

        if (index < node.children!.length - 1) {
          const resizer = document.createElement('div');
          resizer.className = `resizer resizer-${node.direction}`;
          this.setupResizer(resizer, splitContainer, node.direction!);
          splitContainer.appendChild(resizer);
        }

        this.restoreLayoutNode(child, childWrapper, paneDataMap);
      });
    }
  }

  private setupResizer(resizer: HTMLElement, container: HTMLElement, direction: 'horizontal' | 'vertical'): void {
    let startPos = 0;
    let startSizes: number[] = [];

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      startPos = direction === 'horizontal' ? e.clientX : e.clientY;

      const children = Array.from(container.querySelectorAll(':scope > .split-child')) as HTMLElement[];
      startSizes = children.map(child => {
        const rect = child.getBoundingClientRect();
        return direction === 'horizontal' ? rect.width : rect.height;
      });

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos;

      const children = Array.from(container.querySelectorAll(':scope > .split-child')) as HTMLElement[];
      const resizerIndex = Array.from(container.querySelectorAll(':scope > .resizer')).indexOf(resizer);

      const totalSize = startSizes.reduce((a, b) => a + b, 0);
      const newSize1 = Math.max(100, startSizes[resizerIndex] + delta);
      const newSize2 = Math.max(100, startSizes[resizerIndex + 1] - delta);

      children[resizerIndex].style.flexBasis = `${(newSize1 / totalSize) * 100}%`;
      children[resizerIndex + 1].style.flexBasis = `${(newSize2 / totalSize) * 100}%`;

      this.panes.forEach(pane => pane.layout());
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.scheduleSave();
    };

    resizer.addEventListener('mousedown', onMouseDown);
  }

  private createTabFromData(data: TabData): Tab {
    const language = this.getLanguageFromTitle(data.title);
    const model = monaco.editor.createModel(data.content, language);

    const tab: Tab = {
      id: data.id,
      title: data.title,
      model,
      viewState: data.viewState,
    };

    model.onDidChangeContent(() => {
      this.panes.forEach(pane => {
        pane.markTabModified(tab.id, true);
      });
      this.scheduleSave();
    });

    return tab;
  }

  createNewTab(pane: Pane, title?: string, content: string = ''): Tab {
    this.tabCounter++;
    const tabTitle = title || `untitled-${this.tabCounter}.txt`;
    const id = `tab-${Date.now()}-${this.tabCounter}`;

    const language = this.getLanguageFromTitle(tabTitle);
    const model = monaco.editor.createModel(content, language);

    const tab: Tab = { id, title: tabTitle, model, viewState: null };

    model.onDidChangeContent(() => {
      pane.markTabModified(tab.id, true);
      this.scheduleSave();
    });

    pane.addTab(tab);
    this.scheduleSave();

    return tab;
  }

  getLanguageFromTitle(title: string): string {
    const ext = title.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'py': 'python',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'md': 'markdown',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
      'sql': 'sql',
      'sh': 'shell',
      'bash': 'shell',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
    };
    return langMap[ext || ''] || 'plaintext';
  }

  setActivePane(pane: Pane): void {
    this.activePane = pane;
  }

  setDraggedTab(tab: Tab, sourcePane: Pane): void {
    this.draggedTab = { tab, sourcePane };
  }

  getDraggedTab(): { tab: Tab; sourcePane: Pane } | null {
    return this.draggedTab;
  }

  clearDraggedTab(): void {
    this.draggedTab = null;
  }

  showAllDropZones(): void {
    this.panes.forEach(pane => pane.showDropZones());
  }

  hideAllDropZones(): void {
    this.panes.forEach(pane => pane.hideDropZones());
  }

  moveTabToPane(tab: Tab, sourcePane: Pane, targetPane: Pane, beforeTabId?: string, insertBefore?: boolean): void {
    sourcePane.removeTab(tab.id);

    if (beforeTabId) {
      const tabs = targetPane.getTabs();
      const targetIndex = tabs.findIndex(t => t.id === beforeTabId);
      if (targetIndex !== -1) {
        const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
        tabs.splice(insertIndex, 0, tab);
        // Re-render tabs
        const tabsContainer = targetPane.element.querySelector('.tabs')!;
        tabsContainer.querySelectorAll('.tab').forEach(el => el.remove());
        for (const t of tabs) {
          targetPane.addTab(t, false);
        }
        targetPane.activateTab(tab.id);
        this.scheduleSave();
        return;
      }
    }

    targetPane.addTab(tab);

    if (sourcePane.isEmpty()) {
      this.handleEmptyPane(sourcePane);
    }

    this.scheduleSave();
  }

  splitPane(targetPane: Pane, direction: SplitDirection, tab: Tab, sourcePane: Pane): void {
    sourcePane.removeTab(tab.id);

    const parent = targetPane.element.parentElement!;
    const isHorizontal = direction === 'left' || direction === 'right';
    const splitDirection = isHorizontal ? 'horizontal' : 'vertical';

    const splitContainer = document.createElement('div');
    splitContainer.className = `split-container split-${splitDirection}`;

    const existingWrapper = document.createElement('div');
    existingWrapper.className = 'split-child';
    existingWrapper.style.flexBasis = '50%';

    const newWrapper = document.createElement('div');
    newWrapper.className = 'split-child';
    newWrapper.style.flexBasis = '50%';

    const newPane = new Pane(this);
    this.panes.set(newPane.id, newPane);
    newPane.addTab(tab);

    const resizer = document.createElement('div');
    resizer.className = `resizer resizer-${splitDirection}`;
    this.setupResizer(resizer, splitContainer, splitDirection);

    parent.replaceChild(splitContainer, targetPane.element);

    if (direction === 'left' || direction === 'top') {
      newWrapper.appendChild(newPane.element);
      existingWrapper.appendChild(targetPane.element);
      splitContainer.appendChild(newWrapper);
      splitContainer.appendChild(resizer);
      splitContainer.appendChild(existingWrapper);
    } else {
      existingWrapper.appendChild(targetPane.element);
      newWrapper.appendChild(newPane.element);
      splitContainer.appendChild(existingWrapper);
      splitContainer.appendChild(resizer);
      splitContainer.appendChild(newWrapper);
    }

    if (sourcePane.isEmpty()) {
      this.handleEmptyPane(sourcePane);
    }

    this.panes.forEach(pane => pane.layout());
    this.scheduleSave();
  }

  handleEmptyPane(pane: Pane): void {
    if (this.panes.size <= 1) {
      this.createNewTab(pane);
      return;
    }

    const paneElement = pane.element;
    const parent = paneElement.parentElement;

    if (!parent) return;

    if (parent.classList.contains('split-child')) {
      const splitContainer = parent.parentElement;
      if (!splitContainer) return;

      const siblings = Array.from(splitContainer.querySelectorAll(':scope > .split-child'));
      const siblingIndex = siblings.indexOf(parent);
      const otherIndex = siblingIndex === 0 ? 1 : 0;
      const otherWrapper = siblings[otherIndex] as HTMLElement;

      const grandParent = splitContainer.parentElement;
      if (!grandParent) return;

      const otherContent = otherWrapper.firstElementChild;
      if (otherContent) {
        grandParent.replaceChild(otherContent, splitContainer);
      }
    }

    this.panes.delete(pane.id);
    pane.dispose();

    if (this.activePane === pane) {
      this.activePane = this.panes.values().next().value || null;
    }

    this.panes.forEach(p => p.layout());
    this.scheduleSave();
  }

  scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => this.saveState(), 500);
  }

  async saveState(): Promise<void> {
    this.panes.forEach(pane => pane.saveViewState());

    const panes: PaneData[] = [];
    this.panes.forEach(pane => {
      panes.push({
        id: pane.id,
        tabs: pane.getTabs().map(tab => ({
          id: tab.id,
          title: tab.title,
          content: tab.model.getValue(),
          viewState: tab.viewState,
        })),
        activeTabId: pane.getActiveTabId(),
      });
    });

    const layout = this.serializeLayout(this.layoutRoot);

    const state: StoredState = {
      layout,
      panes,
      tabCounter: this.tabCounter,
    };

    await this.storage.save(state);

    this.panes.forEach(pane => pane.clearAllModified());
  }

  private serializeLayout(element: HTMLElement): SplitData {
    const splitContainer = element.querySelector(':scope > .split-container');
    if (splitContainer) {
      const isHorizontal = splitContainer.classList.contains('split-horizontal');
      const children = Array.from(splitContainer.querySelectorAll(':scope > .split-child')) as HTMLElement[];
      const sizes = children.map(child => {
        const basis = child.style.flexBasis;
        return parseFloat(basis) || 50;
      });

      return {
        type: 'split',
        direction: isHorizontal ? 'horizontal' : 'vertical',
        children: children.map(child => this.serializeLayout(child)),
        sizes,
      };
    }

    const pane = element.querySelector(':scope > .pane');
    if (pane) {
      return {
        type: 'pane',
        paneId: (pane as HTMLElement).dataset.paneId,
      };
    }

    const nestedSplit = element.querySelector('.split-container');
    if (nestedSplit) {
      return this.serializeLayout(element.querySelector('.split-container')!.parentElement!);
    }

    return { type: 'pane' };
  }
}

new EditorApp();

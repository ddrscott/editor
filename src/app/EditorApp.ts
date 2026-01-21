import * as monaco from 'monaco-editor';
import { marked } from 'marked';
import { SyncClient, QueryHistoryItem } from '../sync/SyncClient';

// Extend window to include syncClient for runners
declare global {
  interface Window {
    __syncClient?: SyncClient;
  }
}
import { RunnerManager } from '../runners/RunnerManager';
import { OutputPane } from '../output/OutputPane';

interface TabData {
  id: string;
  title: string;
  content: string;
  viewState: monaco.editor.ICodeEditorViewState | null;
  hidden?: boolean;
  // Preview tab metadata
  isPreview?: boolean;
  sourceTabId?: string;
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

// Space history item for tracking visited spaces
interface SpaceHistoryItem {
  spaceId: string;
  title: string;
  lastVisited: number;
}

class SpaceHistory {
  private static readonly STORAGE_KEY = 'monaco-space-history';
  private static readonly MAX_ITEMS = 20;
  private history: SpaceHistoryItem[];

  constructor() {
    this.history = this.load();
  }

  private load(): SpaceHistoryItem[] {
    try {
      const stored = localStorage.getItem(SpaceHistory.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load space history:', e);
    }
    return [];
  }

  private save(): void {
    try {
      localStorage.setItem(SpaceHistory.STORAGE_KEY, JSON.stringify(this.history));
    } catch (e) {
      console.error('Failed to save space history:', e);
    }
  }

  visit(spaceId: string, title: string): void {
    // Remove existing entry for this space if it exists
    this.history = this.history.filter(item => item.spaceId !== spaceId);

    // Add to the front of the list
    this.history.unshift({
      spaceId,
      title,
      lastVisited: Date.now(),
    });

    // Trim to max items
    if (this.history.length > SpaceHistory.MAX_ITEMS) {
      this.history = this.history.slice(0, SpaceHistory.MAX_ITEMS);
    }

    this.save();
  }

  updateTitle(spaceId: string, title: string): void {
    const item = this.history.find(i => i.spaceId === spaceId);
    if (item) {
      item.title = title;
      this.save();
    }
  }

  getAll(): SpaceHistoryItem[] {
    return [...this.history];
  }

  remove(spaceId: string): void {
    this.history = this.history.filter(item => item.spaceId !== spaceId);
    this.save();
  }

  clear(): void {
    this.history = [];
    this.save();
  }
}

// Singleton instance for space history
const spaceHistory = new SpaceHistory();

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

interface Tab {
  id: string;
  title: string;
  model: monaco.editor.ITextModel;
  viewState: monaco.editor.ICodeEditorViewState | null;
  hidden?: boolean;
  // Preview tab properties
  isPreview?: boolean;
  sourceTabId?: string;
  previewContent?: string;
}

type SplitDirection = 'left' | 'right' | 'top' | 'bottom';

interface RemoteCursor {
  clientId: string;
  color: string;
  position: { lineNumber: number; column: number };
  selection?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  decorationIds: string[];
}

class Pane {
  readonly id: string;
  readonly element: HTMLElement;
  private editor: monaco.editor.IStandaloneCodeEditor;
  private tabs: Tab[] = [];
  private activeTabId: string | null = null;
  private tabsContainer: HTMLElement;
  private editorContainer: HTMLElement;
  private previewContainer: HTMLElement;
  private dropZones: HTMLElement;
  private app: EditorApp;
  private draggedTabId: string | null = null;
  private remoteCursors: Map<string, RemoteCursor> = new Map();
  private cursorWidgets: Map<string, HTMLElement> = new Map();
  private scrollDisposable: monaco.IDisposable | null = null;

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
    addButton.title = 'New Tab (Ctrl+N), Right-click to restore';
    addButton.addEventListener('click', () => this.app.createNewTab(this, undefined, '', true));
    addButton.addEventListener('contextmenu', (e) => this.showRestoreMenu(e));
    this.tabsContainer.appendChild(addButton);

    this.editorContainer = document.createElement('div');
    this.editorContainer.className = 'editor-container';

    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'preview-container';
    this.previewContainer.style.display = 'none';

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
    this.element.appendChild(this.previewContainer);
    this.element.appendChild(this.dropZones);

    const settings = this.app.getSettings();
    this.editor = monaco.editor.create(this.editorContainer, {
      theme: settings.get('theme'),
      automaticLayout: true,
      scrollBeyondLastLine: true,
      ...settings.getMonacoOptions(),
    });

    this.setupKeyboardShortcuts();
    this.setupDropZones();
    this.setupCursorTracking();

    settings.onChange(() => this.applySettings());
  }

  private setupCursorTracking(): void {
    // Track cursor position changes
    this.editor.onDidChangeCursorPosition((e) => {
      const tabId = this.activeTabId;
      if (tabId) {
        this.app.sendCursorUpdate(tabId, {
          line: e.position.lineNumber,
          column: e.position.column,
        });
      }
    });

    // Track selection changes
    this.editor.onDidChangeCursorSelection((e) => {
      const tabId = this.activeTabId;
      const sel = e.selection;
      if (tabId && (sel.startLineNumber !== sel.endLineNumber || sel.startColumn !== sel.endColumn)) {
        this.app.sendSelectionUpdate(tabId, {
          startLine: sel.startLineNumber,
          startColumn: sel.startColumn,
          endLine: sel.endLineNumber,
          endColumn: sel.endColumn,
        });
      }
    });
  }

  updateRemoteCursor(clientId: string, color: string, cursor?: { line: number; column: number }, selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number }): void {
    const model = this.editor.getModel();
    if (!model) return;

    // Get or create remote cursor
    let remoteCursor = this.remoteCursors.get(clientId);
    if (!remoteCursor) {
      remoteCursor = {
        clientId,
        color,
        position: { lineNumber: 1, column: 1 },
        decorationIds: [],
      };
      this.remoteCursors.set(clientId, remoteCursor);
    }

    // Update position
    if (cursor) {
      remoteCursor.position = { lineNumber: cursor.line, column: cursor.column };
    }

    // Update selection
    if (selection) {
      remoteCursor.selection = {
        startLineNumber: selection.startLine,
        startColumn: selection.startColumn,
        endLineNumber: selection.endLine,
        endColumn: selection.endColumn,
      };
    } else {
      // Clear selection if not provided
      remoteCursor.selection = undefined;
    }

    // Create decorations - only for selection highlighting, not cursor
    const decorations: monaco.editor.IModelDeltaDecoration[] = [];

    // Selection decoration only (cursor is rendered via DOM widget)
    if (remoteCursor.selection) {
      decorations.push({
        range: new monaco.Range(
          remoteCursor.selection.startLineNumber,
          remoteCursor.selection.startColumn,
          remoteCursor.selection.endLineNumber,
          remoteCursor.selection.endColumn
        ),
        options: {
          className: `remote-selection`,
          inlineClassName: `remote-selection-inline`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }

    // Apply decorations
    remoteCursor.decorationIds = this.editor.deltaDecorations(
      remoteCursor.decorationIds,
      decorations
    );

    // Update or create cursor widget (the colored line)
    this.updateCursorWidget(clientId, color, remoteCursor.position);
  }

  private updateCursorWidget(clientId: string, color: string, position: { lineNumber: number; column: number }): void {
    // Get line height from editor options
    const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);

    // Get or create widget
    let widget = this.cursorWidgets.get(clientId);

    if (!widget) {
      // Create cursor widget
      widget = document.createElement('div');
      widget.className = 'remote-cursor-widget';
      widget.dataset.clientId = clientId;
      widget.style.cssText = `
        position: absolute;
        width: 2px;
        background-color: ${color};
        pointer-events: none;
        z-index: 100;
      `;
      widget.style.height = `${lineHeight}px`;

      // Add label (positioned above the cursor)
      const label = document.createElement('div');
      label.className = 'remote-cursor-label';
      label.textContent = `User`;
      label.style.cssText = `
        position: absolute;
        bottom: 100%;
        left: 0;
        background-color: ${color};
        color: white;
        font-size: 10px;
        padding: 1px 4px;
        border-radius: 2px;
        white-space: nowrap;
        font-family: sans-serif;
      `;
      widget.appendChild(label);

      this.cursorWidgets.set(clientId, widget);
      this.editorContainer.appendChild(widget);

      // Set up scroll listener once if not already done
      if (!this.scrollDisposable) {
        this.scrollDisposable = this.editor.onDidScrollChange(() => {
          this.updateAllCursorWidgetPositions();
        });
      }
    }

    // Update color in case it changed
    widget.style.backgroundColor = color;
    widget.style.height = `${lineHeight}px`;
    const label = widget.querySelector('.remote-cursor-label') as HTMLElement;
    if (label) {
      label.style.backgroundColor = color;
    }

    // Store position on the cursor data
    const cursor = this.remoteCursors.get(clientId);
    if (cursor) {
      cursor.position = position;
    }

    // Position the widget using Monaco's coordinate system
    const coords = this.editor.getScrolledVisiblePosition(position);
    if (coords) {
      // coords.top is relative to the editor's content area
      // Add 2 line heights to fix vertical offset
      const topOffset = lineHeight * 2;
      widget.style.left = `${coords.left}px`;
      widget.style.top = `${coords.top + topOffset}px`;
      widget.style.display = 'block';
    } else {
      widget.style.display = 'none';
    }
  }

  private updateAllCursorWidgetPositions(): void {
    const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
    const topOffset = lineHeight * 2;

    this.remoteCursors.forEach((cursor, clientId) => {
      const widget = this.cursorWidgets.get(clientId);
      if (widget) {
        const coords = this.editor.getScrolledVisiblePosition(cursor.position);
        if (coords) {
          widget.style.left = `${coords.left}px`;
          widget.style.top = `${coords.top + topOffset}px`;
          widget.style.display = 'block';
        } else {
          widget.style.display = 'none';
        }
      }
    });
  }

  removeRemoteCursor(clientId: string): void {
    const cursor = this.remoteCursors.get(clientId);
    if (cursor) {
      this.editor.deltaDecorations(cursor.decorationIds, []);
      this.remoteCursors.delete(clientId);
    }

    const widget = this.cursorWidgets.get(clientId);
    if (widget) {
      widget.remove();
      this.cursorWidgets.delete(clientId);
    }
  }

  clearAllRemoteCursors(): void {
    this.remoteCursors.forEach((_, clientId) => this.removeRemoteCursor(clientId));
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
    tabElement.addEventListener('contextmenu', (e) => this.showTabContextMenu(e, tab));

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
      if (currentTab && !currentTab.isPreview) {
        currentTab.viewState = this.editor.saveViewState();
      }
    }

    this.activeTabId = tabId;

    // Handle preview tabs differently
    if (tab.isPreview) {
      this.editorContainer.style.display = 'none';
      this.previewContainer.style.display = 'flex';
      this.previewContainer.innerHTML = tab.previewContent || '';
    } else {
      this.previewContainer.style.display = 'none';
      this.editorContainer.style.display = 'flex';
      this.editor.setModel(tab.model);

      if (tab.viewState) {
        this.editor.restoreViewState(tab.viewState);
      }

      this.editor.focus();
    }

    this.tabsContainer.querySelectorAll('.tab').forEach(el => {
      el.classList.toggle('active', el.dataset.tabId === tabId);
    });

    this.app.setActivePane(this);
    this.app.updatePageTitle(tab.title);
  }

  closeTab(tabId: string): void {
    this.hideTab(tabId);
  }

  hideTab(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Mark as hidden (soft delete - don't dispose model)
    tab.hidden = true;

    // Hide the tab element in UI
    const tabElement = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) {
      (tabElement as HTMLElement).style.display = 'none';
    }

    // If this was the active tab, switch to another visible tab
    if (this.activeTabId === tabId) {
      const visibleTabs = this.tabs.filter(t => !t.hidden);
      if (visibleTabs.length > 0) {
        this.activateTab(visibleTabs[0].id);
      } else {
        this.activeTabId = null;
        this.app.handleEmptyPane(this);
      }
    }

    // Sync hide to other clients
    this.app.syncTabHide(tabId);
    this.app.scheduleSave();
  }

  restoreTab(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || !tab.hidden) return;

    // Mark as visible
    tab.hidden = false;

    // Show the tab element in UI
    const tabElement = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) {
      (tabElement as HTMLElement).style.display = '';
    }

    // Activate the restored tab
    this.activateTab(tabId);

    // Sync restore to other clients
    this.app.syncTabRestore(tabId);
    this.app.scheduleSave();
  }

  getHiddenTabs(): Tab[] {
    return this.tabs.filter(t => t.hidden);
  }

  private showRestoreMenu(e: MouseEvent): void {
    e.preventDefault();

    const hiddenTabs = this.getHiddenTabs();
    if (hiddenTabs.length === 0) {
      return;
    }

    // Remove any existing menu
    const existingMenu = document.querySelector('.restore-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // Create menu
    const menu = document.createElement('div');
    menu.className = 'restore-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      background: #252526;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      padding: 4px 0;
      min-width: 150px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    // Add header
    const header = document.createElement('div');
    header.style.cssText = 'padding: 4px 12px; color: #808080; font-size: 11px; border-bottom: 1px solid #3c3c3c; margin-bottom: 4px;';
    header.textContent = 'Restore closed tabs';
    menu.appendChild(header);

    // Add menu items for each hidden tab
    for (const tab of hiddenTabs) {
      const item = document.createElement('div');
      item.style.cssText = 'padding: 6px 12px; cursor: pointer; color: #cccccc; font-size: 13px;';
      item.textContent = tab.title;
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#094771';
      });
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = '';
      });
      item.addEventListener('click', () => {
        this.restoreTab(tab.id);
        menu.remove();
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);

    // Close menu when clicking outside
    const closeMenu = (event: MouseEvent) => {
      if (!menu.contains(event.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  private showTabContextMenu(e: MouseEvent, tab: Tab): void {
    e.preventDefault();

    // Remove any existing context menu
    const existingMenu = document.querySelector('.tab-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // Create menu
    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      background: #252526;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      padding: 4px 0;
      min-width: 160px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    const createMenuItem = (label: string, onClick: () => void, enabled = true) => {
      const item = document.createElement('div');
      item.style.cssText = `padding: 6px 12px; cursor: ${enabled ? 'pointer' : 'default'}; color: ${enabled ? '#cccccc' : '#666666'}; font-size: 13px;`;
      item.textContent = label;
      if (enabled) {
        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = '#094771';
        });
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = '';
        });
        item.addEventListener('click', () => {
          onClick();
          menu.remove();
        });
      }
      return item;
    };

    const addSeparator = () => {
      const sep = document.createElement('div');
      sep.style.cssText = 'height: 1px; background: #3c3c3c; margin: 4px 0;';
      menu.appendChild(sep);
    };

    // Check if markdown file
    const isMarkdown = tab.title.toLowerCase().endsWith('.md') ||
                       tab.title.toLowerCase().endsWith('.markdown');

    // Check if preview is currently open for this tab
    const hasPreviewOpen = this.app.isPreviewOpenForTab(tab.id);

    // Preview option (for markdown files)
    if (isMarkdown) {
      menu.appendChild(createMenuItem(
        hasPreviewOpen ? 'Close Preview' : 'Open Preview',
        () => this.app.toggleMarkdownPreview()
      ));
      addSeparator();
    }

    // Run option (for runnable files like .java)
    if (this.app.canRunFile(tab.title)) {
      menu.appendChild(createMenuItem(
        'Run Program',
        () => this.app.runActiveFile()
      ));
      addSeparator();
    }

    // Standard tab actions
    menu.appendChild(createMenuItem('Rename', () => this.renameTab(tab.id)));
    menu.appendChild(createMenuItem('Close', () => this.closeTab(tab.id)));

    document.body.appendChild(menu);

    // Keep menu within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 5}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 5}px`;
    }

    // Close menu when clicking outside
    const closeMenu = (event: MouseEvent) => {
      if (!menu.contains(event.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  renameTab(tabId: string): void {
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
      const oldTitle = tab.title;
      tab.title = newTitle;
      titleSpan.textContent = newTitle;

      const newLanguage = this.app.getLanguageFromTitle(newTitle);
      monaco.editor.setModelLanguage(tab.model, newLanguage);

      input.replaceWith(titleSpan);
      this.app.scheduleSave();

      // Update page title if this is the active tab
      if (this.activeTabId === tabId) {
        this.app.updatePageTitle(newTitle);
      }

      // Sync rename to other clients if title actually changed
      if (newTitle !== oldTitle) {
        this.app.syncTabRename(tabId, newTitle);
      }
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

  // Rename tab from remote (doesn't trigger sync back)
  renameTabRemote(tabId: string, newTitle: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.title = newTitle;

    // Update the tab UI
    const tabElement = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    const titleSpan = tabElement?.querySelector('.tab-title');
    if (titleSpan) {
      titleSpan.textContent = newTitle;
    }

    // Update language based on new file extension
    const newLanguage = this.app.getLanguageFromTitle(newTitle);
    monaco.editor.setModelLanguage(tab.model, newLanguage);
  }

  // Hide tab from remote (doesn't trigger sync back)
  hideTabRemote(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.hidden = true;

    // Hide the tab element in UI
    const tabElement = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) {
      (tabElement as HTMLElement).style.display = 'none';
    }

    // If this was the active tab, switch to another visible tab
    if (this.activeTabId === tabId) {
      const visibleTabs = this.tabs.filter(t => !t.hidden);
      if (visibleTabs.length > 0) {
        this.activateTab(visibleTabs[0].id);
      } else {
        this.activeTabId = null;
      }
    }
  }

  // Restore tab from remote (doesn't trigger sync back)
  restoreTabRemote(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || !tab.hidden) return;

    tab.hidden = false;

    // Show the tab element in UI
    const tabElement = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (tabElement) {
      (tabElement as HTMLElement).style.display = '';
    }

    // Activate the restored tab
    this.activateTab(tabId);
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

  findPreviewTabForSource(sourceTabId: string): Tab | null {
    return this.tabs.find(t => t.isPreview && t.sourceTabId === sourceTabId) || null;
  }

  updatePreviewContent(tabId: string, content: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab && tab.isPreview) {
      tab.previewContent = content;
      // If this preview is currently active, update the display
      if (this.activeTabId === tabId) {
        this.previewContainer.innerHTML = content;
      }
    }
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  getActiveTab(): Tab | null {
    if (!this.activeTabId) return null;
    return this.tabs.find(t => t.id === this.activeTabId) || null;
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
    // Clean up scroll listener
    if (this.scrollDisposable) {
      this.scrollDisposable.dispose();
      this.scrollDisposable = null;
    }

    // Remove all cursor widgets
    this.clearAllRemoteCursors();

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

export class EditorApp {
  private container: HTMLElement;
  private panes: Map<string, Pane> = new Map();
  private activePane: Pane | null = null;
  private settings: EditorSettings;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private tabCounter = 0;
  private draggedTab: { tab: Tab; sourcePane: Pane } | null = null;
  private layoutRoot: HTMLElement;
  private spaceId: string | null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  private static actionsRegistered = false;
  private syncClient: SyncClient | null = null;
  private isRemoteUpdate = false; // Flag to prevent echo
  private clientColors: Map<string, string> = new Map();
  private colorPalette: string[] = [
    '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3',
    '#00BCD4', '#009688', '#4CAF50', '#FF9800', '#FF5722',
  ];
  private knownClients: Set<string> = new Set();
  private runnerManager: RunnerManager;
  private outputPane: OutputPane | null = null;
  private outputSplitContainer: HTMLElement | null = null;
  private queryHistory: QueryHistoryItem[] = [];
  private historyDropdown: HTMLElement | null = null;

  constructor(container: HTMLElement, spaceId?: string) {
    this.container = container;
    this.spaceId = spaceId || null;
    this.container.innerHTML = '';
    this.settings = new EditorSettings();

    // Apply initial theme
    monaco.editor.setTheme(this.settings.get('theme'));

    // Register custom editor actions (only once)
    if (!EditorApp.actionsRegistered) {
      registerEditorActions(this.settings);
      EditorApp.actionsRegistered = true;
    }

    // Initialize runner manager for code execution
    this.runnerManager = new RunnerManager();

    this.layoutRoot = document.createElement('div');
    this.layoutRoot.className = 'layout-root';
    this.container.appendChild(this.layoutRoot);

    // Create logo area with history dropdown
    const logoArea = document.createElement('div');
    logoArea.className = 'app-logo-area';

    // Spaces button (history dropdown trigger)
    const spacesBtn = document.createElement('button');
    spacesBtn.className = 'spaces-trigger';
    spacesBtn.textContent = 'Spaces';
    spacesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHistoryDropdown();
    });
    logoArea.appendChild(spacesBtn);

    // History dropdown container (positioned relative to spaces button)
    this.historyDropdown = document.createElement('div');
    this.historyDropdown.className = 'space-history-dropdown';
    logoArea.appendChild(this.historyDropdown);

    const logo = document.createElement('a');
    logo.className = 'app-logo';
    logo.href = '/';
    logo.textContent = 'MONACO';
    logo.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/';
    });
    logoArea.appendChild(logo);

    this.container.appendChild(logoArea);

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (this.historyDropdown && !logoArea.contains(e.target as Node)) {
        this.historyDropdown.classList.remove('visible');
      }
    });

    this.init();
    this.setupGlobalShortcuts();

    this.resizeHandler = () => {
      this.panes.forEach(pane => pane.layout());
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  getSettings(): EditorSettings {
    return this.settings;
  }

  updatePageTitle(tabTitle: string): void {
    document.title = `${tabTitle} | Monaco`;
    // Update space history with the current tab title
    if (this.spaceId) {
      spaceHistory.updateTitle(this.spaceId, tabTitle);
    }
  }

  private toggleHistoryDropdown(): void {
    if (!this.historyDropdown) return;

    const isVisible = this.historyDropdown.classList.contains('visible');
    if (isVisible) {
      this.historyDropdown.classList.remove('visible');
      return;
    }

    // Render history items
    const history = spaceHistory.getAll();
    const copyLinkHtml = this.spaceId ? `<button class="space-history-copy">Copy Link</button>` : '';

    if (history.length === 0) {
      this.historyDropdown.innerHTML = `
        <div class="space-history-empty">
          <p>No recent spaces</p>
          <p class="space-history-tip">Bookmark this page to save it permanently</p>
        </div>
        ${copyLinkHtml ? `<div class="space-history-footer">${copyLinkHtml}</div>` : ''}
      `;
    } else {
      this.historyDropdown.innerHTML = `
        <div class="space-history-header">Recent Spaces</div>
        <div class="space-history-list">
          ${history.map(item => {
            const isCurrentSpace = item.spaceId === this.spaceId;
            const date = new Date(item.lastVisited);
            const timeAgo = this.formatTimeAgo(date);
            return `
              <a href="/space/${item.spaceId}" class="space-history-item${isCurrentSpace ? ' current' : ''}" data-space-id="${item.spaceId}">
                <span class="space-history-title">${this.escapeHtml(item.title)}</span>
                <span class="space-history-time">${timeAgo}</span>
              </a>
            `;
          }).join('')}
        </div>
        <div class="space-history-footer">
          ${copyLinkHtml}
          <button class="space-history-clear">Clear History</button>
        </div>
        <div class="space-history-tip">Bookmark to save permanently</div>
      `;
    }

    // Add copy link handler
    const copyBtn = this.historyDropdown.querySelector('.space-history-copy');
    copyBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(window.location.href).then(() => {
        const btn = e.target as HTMLButtonElement;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Link'; }, 1500);
      });
    });

    // Add clear handler
    const clearBtn = this.historyDropdown.querySelector('.space-history-clear');
    clearBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm('Clear all space history? This cannot be undone.')) {
        spaceHistory.clear();
        this.historyDropdown!.classList.remove('visible');
      }
    });

    this.historyDropdown.classList.add('visible');
  }

  private formatTimeAgo(date: Date): string {
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private setupGlobalShortcuts(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl) {
        switch (e.key.toLowerCase()) {
          case 'n': // New tab
            e.preventDefault();
            if (this.activePane) {
              this.createNewTab(this.activePane, undefined, '', true);
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
              this.createNewTab(this.activePane, undefined, '', true);
            }
            break;

          case 'r': // Run program (Cmd+R)
            e.preventDefault();
            this.runActiveFile();
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
    };
    window.addEventListener('keydown', this.keydownHandler);

    // Prevent accidental navigation
    this.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
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
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  private init(): void {
    // All spaces should go through /new which creates server-side state
    // Show loading and connect to sync
    if (this.spaceId) {
      this.layoutRoot.innerHTML = '<div class="loading-state">Connecting to space...</div>';
      this.initSync();
    } else {
      // No spaceId - redirect to create a new space
      window.location.href = '/new';
    }
  }

  private createDefaultPane(): void {
    const pane = new Pane(this);
    this.panes.set(pane.id, pane);
    this.layoutRoot.appendChild(pane.element);
    this.activePane = pane;
    this.createNewTab(pane);
  }

  private initSync(): void {
    if (!this.spaceId) return;

    this.syncClient = new SyncClient({
      spaceId: this.spaceId,
      onConnectionChange: (connected) => {
        if (!connected) {
          console.error('Connection lost - reconnecting...');
        }
        // Note: Don't send full sync here - wait for server's sync response
      },
      onSync: (state, _dbInstances, queryHistory) => {
        // Clear loading state
        this.layoutRoot.innerHTML = '';

        // Store query history from sync
        if (queryHistory) {
          this.queryHistory = queryHistory;
        }

        // Full state sync from server - Durable Object is the single source of truth
        // Client NEVER pushes initial state - server creates default state via /new
        if (state && state.tabs && state.tabs.length > 0) {
          this.isRemoteUpdate = true;
          this.initializeFromServerState(state);
          this.isRemoteUpdate = false;

          // Track this space visit in history
          if (this.spaceId) {
            const activeTab = state.tabs.find((t: { id: string }) => t.id === state.activeTabId) || state.tabs[0];
            const spaceTitle = activeTab?.title || 'Untitled';
            spaceHistory.visit(this.spaceId, spaceTitle);
          }
        } else {
          // Server has no state - this shouldn't happen with proper /new flow
          // Show error and suggest creating via /new
          this.layoutRoot.innerHTML = '<div class="loading-state">Space not found. <a href="/new">Create a new space</a></div>';
        }
      },
      onTabUpdate: (tabId, content, title) => {
        this.isRemoteUpdate = true;
        this.handleRemoteTabUpdate(tabId, content, title);
        this.isRemoteUpdate = false;
      },
      onTabCreate: (tabId, title, content, isPreview, sourceTabId) => {
        this.isRemoteUpdate = true;
        this.handleRemoteTabCreate(tabId, title, content, isPreview, sourceTabId);
        this.isRemoteUpdate = false;
      },
      onTabClose: (tabId) => {
        this.isRemoteUpdate = true;
        this.handleRemoteTabClose(tabId);
        this.isRemoteUpdate = false;
      },
      onTabRename: (tabId, title) => {
        this.isRemoteUpdate = true;
        this.handleRemoteTabRename(tabId, title);
        this.isRemoteUpdate = false;
      },
      onTabHide: (tabId) => {
        this.isRemoteUpdate = true;
        this.handleRemoteTabHide(tabId);
        this.isRemoteUpdate = false;
      },
      onTabRestore: (tabId) => {
        this.isRemoteUpdate = true;
        this.handleRemoteTabRestore(tabId);
        this.isRemoteUpdate = false;
      },
      onLayoutUpdate: (layout, panes) => {
        this.isRemoteUpdate = true;
        this.handleRemoteLayoutUpdate(layout, panes);
        this.isRemoteUpdate = false;
      },
      onAwarenessChange: (clients) => {
        this.handleAwarenessChange(clients);
      },
      onQueryResult: (result) => {
        // Add to query history and update OutputPane if visible
        this.queryHistory.unshift(result);
        if (this.queryHistory.length > 50) {
          this.queryHistory = this.queryHistory.slice(0, 50);
        }
        this.outputPane?.addQueryResult(result);
      },
    });

    // Set global reference for runners to access
    window.__syncClient = this.syncClient;
  }

  private sendFullSync(): void {
    if (!this.syncClient || !this.activePane) return;

    const tabs: Array<{ id: string; title: string; content: string; hidden?: boolean; isPreview?: boolean; sourceTabId?: string }> = [];
    this.panes.forEach(pane => {
      pane.getTabs().forEach(tab => {
        tabs.push({
          id: tab.id,
          title: tab.title,
          content: tab.isPreview ? '' : tab.model.getValue(),
          isPreview: tab.isPreview,
          sourceTabId: tab.sourceTabId,
        });
      });
    });

    this.syncClient.sendFullSync({
      tabs,
      activeTabId: this.activePane.getActiveTabId(),
      tabCounter: this.tabCounter,
    });
  }

  private initializeFromServerState(state: {
    tabs: Array<{ id: string; title: string; content: string; hidden?: boolean; isPreview?: boolean; sourceTabId?: string }>;
    activeTabId: string | null;
    tabCounter: number;
  }): void {
    // Clear any existing state
    this.panes.forEach(pane => pane.dispose());
    this.panes.clear();

    // Create default pane
    const pane = new Pane(this);
    this.panes.set(pane.id, pane);
    this.layoutRoot.appendChild(pane.element);
    this.activePane = pane;

    // Set tab counter from server
    this.tabCounter = state.tabCounter;

    // Create tabs from server state (non-preview first, then previews)
    const regularTabs = state.tabs.filter(t => !t.isPreview && !t.hidden);
    const previewTabs = state.tabs.filter(t => t.isPreview && !t.hidden);

    for (const remoteTab of regularTabs) {
      const language = this.getLanguageFromTitle(remoteTab.title);
      const model = monaco.editor.createModel(remoteTab.content, language);
      const tab: Tab = {
        id: remoteTab.id,
        title: remoteTab.title,
        model,
        viewState: null,
      };
      this.setupTabSync(tab, pane);
      pane.addTab(tab, false);
    }

    // Create preview tabs (after regular tabs so sources exist)
    for (const remoteTab of previewTabs) {
      const dummyModel = monaco.editor.createModel('', 'plaintext');
      const sourceTab = this.findTabById(remoteTab.sourceTabId!);
      const previewContent = sourceTab
        ? this.renderMarkdownPreview(sourceTab.model.getValue())
        : '<div class="markdown-preview-content"><p class="empty-preview">Source not found</p></div>';

      const tab: Tab = {
        id: remoteTab.id,
        title: remoteTab.title,
        model: dummyModel,
        viewState: null,
        isPreview: true,
        sourceTabId: remoteTab.sourceTabId,
        previewContent,
      };
      pane.addTab(tab, false);

      // Set up live preview sync
      if (sourceTab) {
        this.setupPreviewSync(sourceTab, tab.id);
      }
    }

    // Activate the correct tab
    if (state.activeTabId) {
      pane.activateTab(state.activeTabId);
    } else if (pane.getTabs().length > 0) {
      pane.activateTab(pane.getTabs()[0].id);
    }

    // Update page title
    const activeTab = pane.getActiveTab();
    if (activeTab) {
      this.updatePageTitle(activeTab.title);
    }

    // Show output pane by default so users know they can run code
    this.showOutputPane();
  }

  private syncFromRemote(state: { tabs: Array<{ id: string; title: string; content: string }>; activeTabId: string | null; tabCounter: number }): void {
    // For simplicity, sync to first pane only (multi-pane sync would need more work)
    const pane = this.panes.values().next().value as Pane | undefined;
    if (!pane) return;

    // Update existing tabs or create new ones
    for (const remoteTab of state.tabs) {
      const existingTab = pane.getTabs().find(t => t.id === remoteTab.id);
      if (existingTab) {
        // Update content if different
        if (existingTab.model.getValue() !== remoteTab.content) {
          existingTab.model.setValue(remoteTab.content);
        }
        if (existingTab.title !== remoteTab.title) {
          existingTab.title = remoteTab.title;
        }
      } else {
        // Create new tab
        const language = this.getLanguageFromTitle(remoteTab.title);
        const model = monaco.editor.createModel(remoteTab.content, language);
        const tab: Tab = {
          id: remoteTab.id,
          title: remoteTab.title,
          model,
          viewState: null,
        };
        this.setupTabSync(tab, pane);
        pane.addTab(tab, false);
      }
    }

    // Sync tab counter
    if (state.tabCounter > this.tabCounter) {
      this.tabCounter = state.tabCounter;
    }
  }

  private handleRemoteTabUpdate(tabId: string, content: string, title?: string): void {
    // Find the tab across all panes
    for (const pane of this.panes.values()) {
      const tab = pane.getTabs().find(t => t.id === tabId);
      if (tab) {
        // Update content if different
        if (tab.model.getValue() !== content) {
          tab.model.setValue(content);
        }
        if (title && tab.title !== title) {
          tab.title = title;
          // Update tab UI would go here
        }
        break;
      }
    }
  }

  private handleRemoteTabCreate(tabId: string, title: string, content: string, isPreview?: boolean, sourceTabId?: string): void {
    // Add to first pane
    const pane = this.panes.values().next().value as Pane | undefined;
    if (!pane) return;

    // Check if tab already exists in any pane
    for (const p of this.panes.values()) {
      if (p.getTabs().find(t => t.id === tabId)) return;
    }

    let tab: Tab;

    if (isPreview && sourceTabId) {
      // Create preview tab
      const sourceTab = this.findTabById(sourceTabId);
      const previewContent = sourceTab
        ? this.renderMarkdownPreview(sourceTab.model.getValue())
        : '<div class="markdown-preview-content"><p>Source not found</p></div>';

      const dummyModel = monaco.editor.createModel('', 'plaintext');
      tab = {
        id: tabId,
        title,
        model: dummyModel,
        viewState: null,
        isPreview: true,
        sourceTabId,
        previewContent,
      };

      // Set up preview sync if source exists
      if (sourceTab) {
        this.setupPreviewSync(sourceTab, tab);
      }
    } else {
      // Create regular tab
      const language = this.getLanguageFromTitle(title);
      const model = monaco.editor.createModel(content, language);
      tab = {
        id: tabId,
        title,
        model,
        viewState: null,
      };
      this.setupTabSync(tab, pane);
    }

    pane.addTab(tab, false);
  }

  private handleRemoteTabClose(tabId: string): void {
    // Find and close the tab
    for (const pane of this.panes.values()) {
      const tab = pane.getTabs().find(t => t.id === tabId);
      if (tab) {
        pane.removeTab(tabId);
        tab.model.dispose();
        break;
      }
    }
  }

  private handleRemoteTabRename(tabId: string, title: string): void {
    // Find and rename the tab
    for (const pane of this.panes.values()) {
      const tab = pane.getTabs().find(t => t.id === tabId);
      if (tab) {
        pane.renameTabRemote(tabId, title);
        break;
      }
    }
  }

  private handleRemoteTabHide(tabId: string): void {
    // Find and hide the tab
    for (const pane of this.panes.values()) {
      const tab = pane.getTabs().find(t => t.id === tabId);
      if (tab) {
        pane.hideTabRemote(tabId);
        break;
      }
    }
  }

  private handleRemoteTabRestore(tabId: string): void {
    // Find and restore the tab
    for (const pane of this.panes.values()) {
      const tab = pane.getTabs().find(t => t.id === tabId);
      if (tab) {
        pane.restoreTabRemote(tabId);
        break;
      }
    }
  }

  private handleRemoteLayoutUpdate(layout: SplitData, panes: Array<{ id: string; tabIds: string[]; activeTabId: string | null }>): void {
    // Build a map of all tabs across all panes (to preserve content/models)
    const allTabs = new Map<string, Tab>();
    this.panes.forEach(pane => {
      pane.getTabs().forEach(tab => {
        allTabs.set(tab.id, tab);
      });
    });

    // Dispose existing panes (but not the tab models)
    this.panes.forEach(pane => {
      // Remove tabs without disposing models
      pane.getTabs().forEach(tab => {
        pane.removeTab(tab.id);
      });
      pane.dispose();
    });
    this.panes.clear();

    // Clear layout root
    this.layoutRoot.innerHTML = '';

    // Build pane data map for restoreLayoutNode
    const paneDataMap = new Map<string, PaneData>();
    for (const paneState of panes) {
      paneDataMap.set(paneState.id, {
        id: paneState.id,
        tabs: paneState.tabIds.map(tabId => {
          const tab = allTabs.get(tabId);
          if (tab) {
            return {
              id: tab.id,
              title: tab.title,
              content: tab.isPreview ? '' : tab.model.getValue(),
              viewState: null,
              isPreview: tab.isPreview,
              sourceTabId: tab.sourceTabId,
            };
          }
          return { id: tabId, title: 'Untitled', content: '', viewState: null };
        }),
        activeTabId: paneState.activeTabId,
      });
    }

    // Restore layout from remote data
    this.restoreLayoutNode(layout, this.layoutRoot, paneDataMap);

    // Fix up preview tabs after all tabs are restored
    this.fixupRestoredPreviewTabs();

    // Set active pane
    if (this.panes.size > 0) {
      this.activePane = this.panes.values().next().value;
    }

    // Re-layout all panes
    this.panes.forEach(pane => pane.layout());
  }

  private sendLayoutUpdate(): void {
    if (!this.syncClient || this.isRemoteUpdate) return;

    const layout = this.serializeLayoutForSync(this.layoutRoot);
    const panes: Array<{ id: string; tabIds: string[]; activeTabId: string | null }> = [];

    this.panes.forEach(pane => {
      panes.push({
        id: pane.id,
        tabIds: pane.getTabs().map(t => t.id),
        activeTabId: pane.getActiveTabId(),
      });
    });

    this.syncClient.sendLayoutUpdate(layout, panes);
  }

  private serializeLayoutForSync(element: HTMLElement): SplitData {
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
        children: children.map(child => this.serializeLayoutForSync(child)),
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
      return this.serializeLayoutForSync(element.querySelector('.split-container')!.parentElement!);
    }

    return { type: 'pane' };
  }

  private setupTabSync(tab: Tab, pane: Pane): void {
    tab.model.onDidChangeContent(() => {
      pane.markTabModified(tab.id, true);
      this.scheduleSave();

      // Send to sync client if not a remote update
      if (!this.isRemoteUpdate && this.syncClient) {
        this.syncClient.sendTabUpdate(tab.id, tab.model.getValue(), tab.title);
      }
    });
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
      this.sendLayoutUpdate();
    };

    resizer.addEventListener('mousedown', onMouseDown);
  }

  private createTabFromData(data: TabData, pane?: Pane): Tab {
    // Handle preview tabs
    if (data.isPreview && data.sourceTabId) {
      // Create dummy model for preview tab (won't be used)
      const dummyModel = monaco.editor.createModel('', 'plaintext');

      // Try to find source tab and regenerate content
      // Note: source may not exist yet during restore, will be fixed up later
      const sourceTab = this.findTabById(data.sourceTabId);
      const previewContent = sourceTab
        ? this.renderMarkdownPreview(sourceTab.model.getValue())
        : '<div class="markdown-preview-content"><p class="empty-preview">Loading preview...</p></div>';

      return {
        id: data.id,
        title: data.title,
        model: dummyModel,
        viewState: null,
        isPreview: true,
        sourceTabId: data.sourceTabId,
        previewContent,
      };
    }

    // Regular tab
    const language = this.getLanguageFromTitle(data.title);
    const model = monaco.editor.createModel(data.content, language);

    const tab: Tab = {
      id: data.id,
      title: data.title,
      model,
      viewState: data.viewState,
    };

    model.onDidChangeContent(() => {
      this.panes.forEach(p => {
        p.markTabModified(tab.id, true);
      });
      this.scheduleSave();

      // Send to sync client if not a remote update
      if (!this.isRemoteUpdate && this.syncClient) {
        this.syncClient.sendTabUpdate(tab.id, tab.model.getValue(), tab.title);
      }
    });

    return tab;
  }

  createNewTab(pane: Pane, title?: string, content: string = '', startRename: boolean = false): Tab {
    this.tabCounter++;
    const tabTitle = title || `untitled-${this.tabCounter}.txt`;
    const id = `tab-${Date.now()}-${this.tabCounter}`;

    const language = this.getLanguageFromTitle(tabTitle);
    const model = monaco.editor.createModel(content, language);

    const tab: Tab = { id, title: tabTitle, model, viewState: null };

    model.onDidChangeContent(() => {
      pane.markTabModified(tab.id, true);
      this.scheduleSave();

      // Send to sync client if not a remote update
      if (!this.isRemoteUpdate && this.syncClient) {
        this.syncClient.sendTabUpdate(tab.id, tab.model.getValue(), tab.title);
      }
    });

    pane.addTab(tab);
    this.scheduleSave();

    // Notify sync client about new tab
    if (!this.isRemoteUpdate && this.syncClient) {
      this.syncClient.sendTabCreate(tab.id, tab.title, content);
    }

    // Auto-focus rename input if requested
    if (startRename) {
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => pane.renameTab(tab.id), 0);
    }

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
      'pgsql': 'sql',
      'psql': 'sql',
      'duckdb': 'sql',
      'sql': 'sql',
      'sqlite': 'sql',
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
        this.sendLayoutUpdate();
        return;
      }
    }

    targetPane.addTab(tab);

    if (sourcePane.isEmpty()) {
      this.handleEmptyPane(sourcePane);
    } else {
      // Only send layout update if handleEmptyPane wasn't called (it sends its own)
      this.sendLayoutUpdate();
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
    this.sendLayoutUpdate();
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
    this.sendLayoutUpdate();
  }

  scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => this.saveState(), 500);
  }

  saveState(): void {
    // Save view state and clear modified flags
    // Actual state sync happens via SyncClient on content changes
    this.panes.forEach(pane => pane.saveViewState());
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

  destroy(): void {
    // Remove event listeners
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }

    // Clear save timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Disconnect sync client
    if (this.syncClient) {
      this.syncClient.destroy();
      this.syncClient = null;
      window.__syncClient = undefined;
    }

    // Close output pane if open
    if (this.outputPane) {
      this.closeOutputPane();
    }

    // Dispose runner manager
    this.runnerManager.dispose();

    // Dispose all panes
    this.panes.forEach(pane => pane.dispose());
    this.panes.clear();

    // Clear container
    this.container.innerHTML = '';
  }

  private getClientColor(clientId: string): string {
    if (!this.clientColors.has(clientId)) {
      const colorIndex = this.clientColors.size % this.colorPalette.length;
      this.clientColors.set(clientId, this.colorPalette[colorIndex]);
    }
    return this.clientColors.get(clientId)!;
  }

  sendCursorUpdate(tabId: string, cursor: { line: number; column: number }): void {
    if (this.syncClient) {
      this.syncClient.updateAwareness({ tabId, cursor });
    }
  }

  sendSelectionUpdate(tabId: string, selection: { startLine: number; startColumn: number; endLine: number; endColumn: number }): void {
    if (this.syncClient) {
      this.syncClient.updateAwareness({ tabId, selection });
    }
  }

  syncTabRename(tabId: string, title: string): void {
    if (!this.isRemoteUpdate && this.syncClient) {
      this.syncClient.sendTabRename(tabId, title);
    }
  }

  syncTabHide(tabId: string): void {
    if (!this.isRemoteUpdate && this.syncClient) {
      this.syncClient.sendTabHide(tabId);
    }
  }

  syncTabRestore(tabId: string): void {
    if (!this.isRemoteUpdate && this.syncClient) {
      this.syncClient.sendTabRestore(tabId);
    }
  }

  private handleAwarenessChange(clients: Record<string, { color?: string; tabId?: string; cursor?: { line: number; column: number }; selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number } }>): void {
    // Get our own client ID to skip
    const myClientId = this.syncClient?.getClientId();

    // Track which clients are currently connected
    const currentClientIds = new Set(Object.keys(clients));

    // Find clients that have disconnected
    const disconnectedClients = [...this.knownClients].filter(id => !currentClientIds.has(id));

    // Update remote cursors in all panes
    this.panes.forEach(pane => {
      // Remove cursors for disconnected clients
      for (const clientId of disconnectedClients) {
        pane.removeRemoteCursor(clientId);
      }

      // Get active tab ID for this pane
      const activeTabId = pane.getActiveTabId();

      // Update or add cursors for each connected client
      for (const [clientId, state] of Object.entries(clients)) {
        // Skip our own cursor
        if (clientId === myClientId) continue;

        // Only show cursor if on the same tab
        if (state.tabId && state.tabId !== activeTabId) {
          // Remote user is on a different tab - hide their cursor
          pane.removeRemoteCursor(clientId);
          continue;
        }

        // Use server-provided color or generate one
        const color = state.color || this.getClientColor(clientId);
        pane.updateRemoteCursor(clientId, color, state.cursor, state.selection);
      }
    });

    // Update known clients
    this.knownClients = currentClientIds;
  }

  isPreviewOpenForTab(tabId: string): boolean {
    // Check all panes for a preview tab linked to this source
    for (const pane of this.panes.values()) {
      if (pane.findPreviewTabForSource(tabId)) {
        return true;
      }
    }
    return false;
  }

  toggleMarkdownPreview(): void {
    if (!this.activePane) return;

    const activeTab = this.activePane.getActiveTab();
    if (!activeTab) return;

    // Check if preview already exists for this tab
    const existingPreviewPane = this.findPreviewPaneForSource(activeTab.id);
    if (existingPreviewPane) {
      // Close the preview by finding and closing the preview tab
      const previewTab = existingPreviewPane.pane.findPreviewTabForSource(activeTab.id);
      if (previewTab) {
        existingPreviewPane.pane.closeTab(previewTab.id);
      }
      return;
    }

    // Create a preview tab in a new split pane to the right
    const previewTabId = `preview-${activeTab.id}`;
    const previewTitle = `Preview: ${activeTab.title}`;

    // Parse markdown content
    const previewContent = this.renderMarkdownPreview(activeTab.model.getValue());

    // Create a dummy model for the preview tab (won't be used but needed for interface)
    const dummyModel = monaco.editor.createModel('', 'plaintext');

    const previewTab: Tab = {
      id: previewTabId,
      title: previewTitle,
      model: dummyModel,
      viewState: null,
      isPreview: true,
      sourceTabId: activeTab.id,
      previewContent,
    };

    // Split to create a new pane on the right
    this.splitPaneWithPreview(this.activePane, 'right', previewTab);

    // Set up live sync from source to preview
    this.setupPreviewSync(activeTab, previewTabId);
  }

  private findPreviewPaneForSource(sourceTabId: string): { pane: Pane; tab: Tab } | null {
    for (const pane of this.panes.values()) {
      const previewTab = pane.findPreviewTabForSource(sourceTabId);
      if (previewTab) {
        return { pane, tab: previewTab };
      }
    }
    return null;
  }

  private findTabById(tabId: string): Tab | null {
    for (const pane of this.panes.values()) {
      const tab = pane.getTabs().find(t => t.id === tabId);
      if (tab) return tab;
    }
    return null;
  }

  private splitPaneWithPreview(sourcePane: Pane, direction: 'right', previewTab: Tab): void {
    const parent = sourcePane.element.parentElement!;

    const splitContainer = document.createElement('div');
    splitContainer.className = 'split-container split-horizontal';

    const existingWrapper = document.createElement('div');
    existingWrapper.className = 'split-child';
    existingWrapper.style.flexBasis = '50%';

    const newWrapper = document.createElement('div');
    newWrapper.className = 'split-child';
    newWrapper.style.flexBasis = '50%';

    const newPane = new Pane(this);
    this.panes.set(newPane.id, newPane);
    newPane.addTab(previewTab);

    // Sync preview tab creation to server
    if (this.syncClient && !this.isRemoteUpdate) {
      this.syncClient.sendTabCreate(
        previewTab.id,
        previewTab.title,
        '', // Preview tabs don't have content - it's derived from source
        previewTab.isPreview,
        previewTab.sourceTabId
      );
    }

    const resizer = document.createElement('div');
    resizer.className = 'resizer resizer-horizontal';
    this.setupResizer(resizer, splitContainer, 'horizontal');

    parent.replaceChild(splitContainer, sourcePane.element);

    existingWrapper.appendChild(sourcePane.element);
    newWrapper.appendChild(newPane.element);
    splitContainer.appendChild(existingWrapper);
    splitContainer.appendChild(resizer);
    splitContainer.appendChild(newWrapper);

    this.panes.forEach(pane => pane.layout());
    this.scheduleSave();
  }

  private setupPreviewSync(sourceTab: Tab, previewTabId: string): void {
    // Store the disposable so we can clean it up
    const disposable = sourceTab.model.onDidChangeContent(() => {
      const previewInfo = this.findPreviewPaneForSource(sourceTab.id);
      if (previewInfo) {
        const content = this.renderMarkdownPreview(sourceTab.model.getValue());
        previewInfo.pane.updatePreviewContent(previewTabId, content);
      }
    });

    // Store disposable on the preview tab's model (will be cleaned up when tab closes)
    // We attach it to the dummy model's dispose
    const originalDispose = sourceTab.model.onWillDispose(() => {
      disposable.dispose();
      originalDispose.dispose();
    });
  }

  private fixupRestoredPreviewTabs(): void {
    // After restore, update preview content and set up sync for any preview tabs
    for (const pane of this.panes.values()) {
      for (const tab of pane.getTabs()) {
        if (tab.isPreview && tab.sourceTabId) {
          const sourceTab = this.findTabById(tab.sourceTabId);
          if (sourceTab) {
            // Regenerate preview content from source
            tab.previewContent = this.renderMarkdownPreview(sourceTab.model.getValue());
            pane.updatePreviewContent(tab.id, tab.previewContent);

            // Set up live sync
            this.setupPreviewSync(sourceTab, tab.id);
          }
        }
      }
    }
  }

  private renderMarkdownPreview(markdown: string): string {
    if (!markdown || !markdown.trim()) {
      return '<div class="markdown-preview-content"><p class="empty-preview">Start typing to see preview...</p></div>';
    }

    const html = marked.parse(markdown, {
      gfm: true,        // GitHub Flavored Markdown
      breaks: false,    // Don't convert \n to <br>
    });

    return `<div class="markdown-preview-content">${html}</div>`;
  }

  // ============================================================
  // Code Execution (Java, etc.)
  // ============================================================

  /**
   * Check if a file can be run (has a runner available)
   */
  canRunFile(filename: string): boolean {
    return this.runnerManager.canRun(filename);
  }

  /**
   * Run the currently active file
   */
  async runActiveFile(): Promise<void> {
    if (!this.activePane) return;

    const activeTab = this.activePane.getActiveTab();
    if (!activeTab || activeTab.isPreview) return;

    const filename = activeTab.title;
    const code = activeTab.model.getValue();

    // Check if file is runnable
    if (!this.runnerManager.canRun(filename)) {
      this.showComingSoonDialog(filename);
      return;
    }

    // Show/create output pane
    this.showOutputPane();

    if (!this.outputPane) return;

    // Show reset button for SQL files
    const ext = filename.split('.').pop()?.toLowerCase();
    const isSqlFile = ext === 'pgsql' || ext === 'psql' || ext === 'duckdb' || ext === 'sql' || ext === 'sqlite' || ext === 'mysql' || ext === 'mssql';
    const isRemoteSqlFile = ext === 'mysql' || ext === 'mssql';
    this.outputPane.setShowResetDb(isSqlFile);

    // Enable SQL mode with query history for remote SQL files
    if (isRemoteSqlFile) {
      this.outputPane.setSqlMode(ext);
      this.outputPane.setQueryHistory(this.queryHistory);
    } else {
      this.outputPane.setSqlMode(null);
    }

    // Show loading state
    this.outputPane.showLoading('Initializing runtime...');

    try {
      // Run code
      const result = await this.runnerManager.runFile(filename, code);
      this.outputPane.showOutput(result);
    } catch (error) {
      this.outputPane.showOutput({
        success: false,
        output: '',
        error: `Execution failed: ${error}`
      });
    }
  }

  /**
   * Reset the SQL database for the current file type
   */
  private async resetDatabase(): Promise<void> {
    if (!this.outputPane || !this.activePane) return;

    const activeTab = this.activePane.getActiveTab();
    if (!activeTab) return;

    const ext = activeTab.title.split('.').pop()?.toLowerCase();
    const isPostgres = ext === 'pgsql' || ext === 'psql';
    const isDuckDB = ext === 'duckdb';
    const isSQLite = ext === 'sql' || ext === 'sqlite';
    const isMySql = ext === 'mysql';
    const isMsSql = ext === 'mssql';

    if (!isPostgres && !isDuckDB && !isSQLite && !isMySql && !isMsSql) return;

    const dbName = isPostgres ? 'PostgreSQL'
      : isDuckDB ? 'DuckDB'
      : isSQLite ? 'SQLite'
      : isMySql ? 'MySQL'
      : 'SQL Server';

    // Confirm with user
    const confirmMessage = isMySql || isMsSql
      ? `Are you sure you want to reset the ${dbName} connection?\n\nThis will create a new database instance.`
      : `Are you sure you want to reset the ${dbName} database?\n\nThis will delete all tables and data. This action cannot be undone.`;

    const confirmed = confirm(confirmMessage);
    if (!confirmed) return;

    this.outputPane.showLoading('Resetting database...');

    try {
      if (isPostgres) {
        const { PostgresRunner } = await import('../runners/PostgresRunner');
        const runner = new PostgresRunner();
        await runner.dropDatabase();
      } else if (isDuckDB) {
        const { DuckDBRunner } = await import('../runners/DuckDBRunner');
        const runner = new DuckDBRunner();
        await runner.resetDatabase();
      } else if (isSQLite) {
        const { SQLiteRunner } = await import('../runners/SQLiteRunner');
        const runner = new SQLiteRunner();
        await runner.resetDatabase();
      } else if (isMySql) {
        const { MySqlRunner } = await import('../runners/MySqlRunner');
        const runner = new MySqlRunner();
        await runner.resetDatabase();
      } else if (isMsSql) {
        const { MsSqlRunner } = await import('../runners/MsSqlRunner');
        const runner = new MsSqlRunner();
        await runner.resetDatabase();
      }

      const successMessage = isMySql || isMsSql
        ? `${dbName} connection reset successfully.\n\nA new database instance will be created on next run.`
        : `${dbName} database reset successfully.\n\nAll tables and data have been deleted.`;

      this.outputPane.showOutput({
        success: true,
        output: successMessage
      });
    } catch (error) {
      this.outputPane.showOutput({
        success: false,
        output: '',
        error: `Failed to reset database: ${error}`
      });
    }
  }

  /**
   * Show the output pane (create if needed)
   */
  private showOutputPane(): void {
    if (this.outputPane) return;

    // Create split container at bottom (30% height)
    const parent = this.layoutRoot.parentElement!;

    this.outputSplitContainer = document.createElement('div');
    this.outputSplitContainer.className = 'split-container split-vertical output-split';

    const topChild = document.createElement('div');
    topChild.className = 'split-child';
    topChild.style.flexBasis = '70%';

    const bottomChild = document.createElement('div');
    bottomChild.className = 'split-child output-pane-container';
    bottomChild.style.flexBasis = '30%';

    const resizer = document.createElement('div');
    resizer.className = 'resizer resizer-vertical';

    // Move existing layout root to top
    parent.replaceChild(this.outputSplitContainer, this.layoutRoot);
    topChild.appendChild(this.layoutRoot);

    this.outputSplitContainer.appendChild(topChild);
    this.outputSplitContainer.appendChild(resizer);
    this.outputSplitContainer.appendChild(bottomChild);

    // Create output pane
    this.outputPane = new OutputPane(bottomChild, {
      onClose: () => this.closeOutputPane(),
      onRerun: () => this.runActiveFile(),
      onResetDb: () => this.resetDatabase()
    });

    // Setup resizer
    this.setupResizer(resizer, this.outputSplitContainer, 'vertical');

    // Re-layout all panes
    this.panes.forEach(pane => pane.layout());
  }

  /**
   * Close the output pane
   */
  private closeOutputPane(): void {
    if (!this.outputPane || !this.outputSplitContainer) return;

    const parent = this.outputSplitContainer.parentElement!;

    // Remove output pane from DOM
    parent.replaceChild(this.layoutRoot, this.outputSplitContainer);

    this.outputPane = null;
    this.outputSplitContainer = null;

    // Re-layout all panes
    this.panes.forEach(pane => pane.layout());
  }

  /**
   * Show "Coming Soon" dialog for unsupported languages
   */
  private showComingSoonDialog(filename: string): void {
    const ext = filename.split('.').pop()?.toLowerCase() || 'unknown';

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'coming-soon-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'coming-soon-dialog';

    const icon = document.createElement('div');
    icon.className = 'coming-soon-icon';
    icon.textContent = '🚀';

    const title = document.createElement('h2');
    title.className = 'coming-soon-title';
    title.textContent = 'Support Coming Soon!';

    const message = document.createElement('p');
    message.className = 'coming-soon-message';
    message.textContent = `Running .${ext} files is not yet supported. We're working on adding more language runtimes.`;

    const supported = document.createElement('p');
    supported.className = 'coming-soon-supported';
    supported.innerHTML = '<strong>Currently supported:</strong> Java (.java), Python (.py), PostgreSQL (.pgsql), DuckDB (.duckdb)';

    const button = document.createElement('button');
    button.className = 'coming-soon-button';
    button.textContent = 'Got it';
    button.addEventListener('click', () => overlay.remove());

    dialog.appendChild(icon);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(supported);
    dialog.appendChild(button);
    overlay.appendChild(dialog);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Close on Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    document.body.appendChild(overlay);
    button.focus();
  }
}

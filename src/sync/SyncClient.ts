interface AwarenessState {
  color: string;
  tabId?: string;
  cursor?: { line: number; column: number };
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

interface SyncMessage {
  type: 'sync';
  state: DocumentState | null;
  layout?: { layout: LayoutSplitData; panes: PaneState[] } | null;
  awareness: Record<string, AwarenessState>;
  clientId: string; // Server-assigned client ID
}

interface UpdateMessage {
  type: 'update';
  tabId: string;
  content: string;
  from: string;
}

interface TabUpdateMessage {
  type: 'tab-update';
  tabId: string;
  title?: string;
  content?: string;
}

interface TabCreateMessage {
  type: 'tab-create';
  tabId: string;
  title: string;
  content: string;
  isPreview?: boolean;
  sourceTabId?: string;
}

interface TabCloseMessage {
  type: 'tab-close';
  tabId: string;
}

interface TabHideMessage {
  type: 'tab-hide';
  tabId: string;
}

interface TabRestoreMessage {
  type: 'tab-restore';
  tabId: string;
}

interface TabRenameMessage {
  type: 'tab-rename';
  tabId: string;
  title: string;
}

interface FullSyncMessage {
  type: 'full-sync';
  state: DocumentState;
}

interface LayoutUpdateMessage {
  type: 'layout-update';
  layout: LayoutSplitData;
  panes: PaneState[];
}

interface AwarenessUpdateMessage {
  type: 'awareness';
  clients: Record<string, AwarenessState>;
}

interface LayoutSplitData {
  type: 'pane' | 'split';
  direction?: 'horizontal' | 'vertical';
  children?: LayoutSplitData[];
  paneId?: string;
  sizes?: number[];
}

interface PaneState {
  id: string;
  tabIds: string[];
  activeTabId: string | null;
}

interface DocumentState {
  tabs: Array<{
    id: string;
    title: string;
    content: string;
    hidden?: boolean;
    isPreview?: boolean;
    sourceTabId?: string;
  }>;
  activeTabId: string | null;
  tabCounter: number;
  layout?: LayoutSplitData;
  panes?: PaneState[];
}

type ServerMessage = SyncMessage | UpdateMessage | AwarenessUpdateMessage | TabCreateMessage | TabCloseMessage | TabHideMessage | TabRestoreMessage | TabUpdateMessage | TabRenameMessage | FullSyncMessage | LayoutUpdateMessage;
type ClientMessage = TabUpdateMessage | TabCreateMessage | TabCloseMessage | TabHideMessage | TabRestoreMessage | TabRenameMessage | FullSyncMessage | LayoutUpdateMessage | { type: 'awareness'; cursor?: unknown; selection?: unknown };

export interface SyncClientOptions {
  spaceId: string;
  onSync?: (state: DocumentState | null) => void;
  onTabUpdate?: (tabId: string, content: string, title?: string) => void;
  onTabCreate?: (tabId: string, title: string, content: string, isPreview?: boolean, sourceTabId?: string) => void;
  onTabClose?: (tabId: string) => void;
  onTabHide?: (tabId: string) => void;
  onTabRestore?: (tabId: string) => void;
  onTabRename?: (tabId: string, title: string) => void;
  onLayoutUpdate?: (layout: LayoutSplitData, panes: PaneState[]) => void;
  onAwarenessChange?: (clients: Record<string, AwarenessState>) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export class SyncClient {
  private spaceId: string;
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private onSync?: (state: DocumentState) => void;
  private onTabUpdate?: (tabId: string, content: string, title?: string) => void;
  private onTabCreate?: (tabId: string, title: string, content: string, isPreview?: boolean, sourceTabId?: string) => void;
  private onTabClose?: (tabId: string) => void;
  private onTabHide?: (tabId: string) => void;
  private onTabRestore?: (tabId: string) => void;
  private onTabRename?: (tabId: string, title: string) => void;
  private onLayoutUpdate?: (layout: LayoutSplitData, panes: PaneState[]) => void;
  private onAwarenessChange?: (clients: Record<string, AwarenessState>) => void;
  private onConnectionChange?: (connected: boolean) => void;
  private localAwareness: Partial<AwarenessState> = {};
  private clientId: string | null = null; // Will be assigned by server

  constructor(options: SyncClientOptions) {
    this.spaceId = options.spaceId;
    this.onSync = options.onSync;
    this.onTabUpdate = options.onTabUpdate;
    this.onTabCreate = options.onTabCreate;
    this.onTabClose = options.onTabClose;
    this.onTabHide = options.onTabHide;
    this.onTabRestore = options.onTabRestore;
    this.onTabRename = options.onTabRename;
    this.onLayoutUpdate = options.onLayoutUpdate;
    this.onAwarenessChange = options.onAwarenessChange;
    this.onConnectionChange = options.onConnectionChange;

    this.connect();
  }

  private connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/space/${this.spaceId}`;

    console.log('Connecting to:', wsUrl);

    // Don't try to connect if on Parcel dev server (port 1234)
    if (window.location.port === '1234') {
      console.log('Running on Parcel dev server - sync disabled. Use wrangler dev for collaboration.');
      return;
    }

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.onConnectionChange?.(true);
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
        this.connected = false;
        this.onConnectionChange?.(false);
        this.scheduleReconnect();
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(message: ServerMessage): void {
    // Ignore messages from self
    if ('from' in message && message.from === this.clientId) {
      return;
    }

    switch (message.type) {
      case 'sync':
        // Store server-assigned client ID
        if (message.clientId) {
          this.clientId = message.clientId;
        }
        // Always call onSync so client can decide whether to send its state
        this.onSync?.(message.state);
        if (message.layout) {
          this.onLayoutUpdate?.(message.layout.layout, message.layout.panes);
        }
        if (message.awareness) {
          this.onAwarenessChange?.(message.awareness);
        }
        break;

      case 'full-sync':
        if (message.state) {
          this.onSync?.(message.state);
        }
        break;

      case 'tab-update':
        this.onTabUpdate?.(message.tabId, message.content || '', message.title);
        break;

      case 'tab-create':
        this.onTabCreate?.(message.tabId, message.title, message.content, message.isPreview, message.sourceTabId);
        break;

      case 'tab-close':
        this.onTabClose?.(message.tabId);
        break;

      case 'tab-hide':
        this.onTabHide?.(message.tabId);
        break;

      case 'tab-restore':
        this.onTabRestore?.(message.tabId);
        break;

      case 'tab-rename':
        this.onTabRename?.(message.tabId, message.title);
        break;

      case 'layout-update':
        this.onLayoutUpdate?.(message.layout, message.panes);
        break;

      case 'awareness':
        this.onAwarenessChange?.(message.clients);
        break;
    }
  }

  sendTabUpdate(tabId: string, content: string, title?: string): void {
    this.send({
      type: 'tab-update',
      tabId,
      content,
      title,
    });
  }

  sendTabCreate(tabId: string, title: string, content: string, isPreview?: boolean, sourceTabId?: string): void {
    this.send({
      type: 'tab-create',
      tabId,
      title,
      content,
      isPreview,
      sourceTabId,
    });
  }

  sendTabClose(tabId: string): void {
    this.send({
      type: 'tab-close',
      tabId,
    });
  }

  sendTabHide(tabId: string): void {
    this.send({
      type: 'tab-hide',
      tabId,
    });
  }

  sendTabRestore(tabId: string): void {
    this.send({
      type: 'tab-restore',
      tabId,
    });
  }

  sendTabRename(tabId: string, title: string): void {
    this.send({
      type: 'tab-rename',
      tabId,
      title,
    });
  }

  sendFullSync(state: DocumentState): void {
    this.send({
      type: 'full-sync',
      state,
    });
  }

  sendLayoutUpdate(layout: LayoutSplitData, panes: PaneState[]): void {
    this.send({
      type: 'layout-update',
      layout,
      panes,
    });
  }

  private send(message: ClientMessage): void {
    if (this.connected && this.socket && this.clientId) {
      this.socket.send(JSON.stringify({ ...message, from: this.clientId }));
    }
  }

  updateAwareness(state: Partial<AwarenessState>): void {
    this.localAwareness = { ...this.localAwareness, ...state };

    if (this.connected && this.socket && this.clientId) {
      this.socket.send(JSON.stringify({
        type: 'awareness',
        ...this.localAwareness,
        from: this.clientId,
      }));
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getClientId(): string | null {
    return this.clientId;
  }

  destroy(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

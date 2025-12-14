interface Session {
  socket: WebSocket;
  clientId: string;
  color: string;
  tabId?: string;
  cursor?: { line: number; column: number };
  selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
}

interface LayoutSplitData {
  type: 'pane' | 'split';
  direction?: 'horizontal' | 'vertical';
  children?: LayoutSplitData[];
  paneId?: string;
}

interface PaneState {
  id: string;
  tabIds: string[];
  activeTabId: string | null;
}

interface DocumentState {
  tabs: Array<{ id: string; title: string; content: string; hidden?: boolean }>;
  activeTabId: string | null;
  tabCounter: number;
}

interface LayoutState {
  layout: LayoutSplitData;
  panes: PaneState[];
}

interface TabUpdateMessage {
  type: 'tab-update';
  tabId: string;
  title?: string;
  content?: string;
  from: string;
}

interface TabCreateMessage {
  type: 'tab-create';
  tabId: string;
  title: string;
  content: string;
  from: string;
}

interface TabCloseMessage {
  type: 'tab-close';
  tabId: string;
  from: string;
}

interface TabHideMessage {
  type: 'tab-hide';
  tabId: string;
  from: string;
}

interface TabRestoreMessage {
  type: 'tab-restore';
  tabId: string;
  from: string;
}

interface TabRenameMessage {
  type: 'tab-rename';
  tabId: string;
  title: string;
  from: string;
}

interface FullSyncMessage {
  type: 'full-sync';
  state: DocumentState;
  from: string;
}

interface AwarenessMessage {
  type: 'awareness';
  tabId?: string;
  cursor?: { line: number; column: number };
  selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
  from: string;
}

interface LayoutUpdateMessage {
  type: 'layout-update';
  layout: LayoutSplitData;
  panes: PaneState[];
  from: string;
}

type ClientMessage = TabUpdateMessage | TabCreateMessage | TabCloseMessage | TabHideMessage | TabRestoreMessage | TabRenameMessage | FullSyncMessage | AwarenessMessage | LayoutUpdateMessage;

// Generate random color for cursor
function generateColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export class SpaceRoom {
  private state: DurableObjectState;
  private sessions: Map<string, Session> = new Map();
  private documentState: DocumentState | null = null;
  private layoutState: LayoutState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;

    // Load persisted state
    this.state.blockConcurrencyWhile(async () => {
      this.documentState = await this.state.storage.get('documentState') || null;
      this.layoutState = await this.state.storage.get('layoutState') || null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket();
    }

    return new Response('Expected WebSocket', { status: 400 });
  }

  private handleWebSocket(): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const clientId = crypto.randomUUID();
    const color = generateColor();

    const session: Session = {
      socket: server,
      clientId,
      color,
    };

    // Accept the WebSocket
    server.accept();

    this.sessions.set(clientId, session);
    console.log(`Client ${clientId} connected. Total clients: ${this.sessions.size}`);

    // Send initial sync with current state
    this.sendSync(server, clientId);

    // Handle messages
    server.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data as string) as ClientMessage;
        await this.handleMessage(clientId, message);
      } catch (error) {
        console.error('Failed to handle message:', error);
      }
    });

    // Handle close
    server.addEventListener('close', () => {
      console.log(`Client ${clientId} disconnected`);
      this.sessions.delete(clientId);
      this.broadcastAwareness();
    });

    // Handle errors
    server.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.sessions.delete(clientId);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private sendSync(socket: WebSocket, clientId: string): void {
    const awareness: Record<string, { color: string; tabId?: string; cursor?: unknown; selection?: unknown }> = {};

    this.sessions.forEach((session, id) => {
      if (id !== clientId) {
        awareness[id] = {
          color: session.color,
          tabId: session.tabId,
          cursor: session.cursor,
          selection: session.selection,
        };
      }
    });

    const message = {
      type: 'sync',
      state: this.documentState,
      layout: this.layoutState,
      awareness,
      clientId, // Tell client their ID
    };

    socket.send(JSON.stringify(message));
  }

  private async handleMessage(clientId: string, message: ClientMessage): Promise<void> {
    const session = this.sessions.get(clientId);
    if (!session) return;

    console.log(`Received ${message.type} from ${clientId}`);

    switch (message.type) {
      case 'tab-update':
        // Update document state
        if (this.documentState) {
          const tab = this.documentState.tabs.find(t => t.id === message.tabId);
          if (tab) {
            if (message.content !== undefined) tab.content = message.content;
            if (message.title !== undefined) tab.title = message.title;
            await this.persistState();
          }
        }
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;

      case 'tab-create':
        // Add tab to document state
        if (!this.documentState) {
          this.documentState = { tabs: [], activeTabId: null, tabCounter: 0 };
        }
        this.documentState.tabs.push({
          id: message.tabId,
          title: message.title,
          content: message.content,
        });
        await this.persistState();
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;

      case 'tab-close':
        // Remove tab from document state
        if (this.documentState) {
          this.documentState.tabs = this.documentState.tabs.filter(t => t.id !== message.tabId);
          await this.persistState();
        }
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;

      case 'tab-hide':
        // Mark tab as hidden (soft delete)
        if (this.documentState) {
          const tab = this.documentState.tabs.find(t => t.id === message.tabId);
          if (tab) {
            tab.hidden = true;
            await this.persistState();
          }
        }
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;

      case 'tab-restore':
        // Restore hidden tab
        if (this.documentState) {
          const tab = this.documentState.tabs.find(t => t.id === message.tabId);
          if (tab) {
            tab.hidden = false;
            await this.persistState();
          }
        }
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;

      case 'tab-rename':
        // Rename tab in document state
        if (this.documentState) {
          const tab = this.documentState.tabs.find(t => t.id === message.tabId);
          if (tab) {
            tab.title = message.title;
            await this.persistState();
          }
        }
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;

      case 'full-sync':
        // Store the full state
        this.documentState = message.state;
        await this.persistState();
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;

      case 'awareness':
        // Update session awareness
        session.tabId = message.tabId;
        session.cursor = message.cursor;
        session.selection = message.selection;
        // Broadcast awareness to all clients
        this.broadcastAwareness();
        break;

      case 'layout-update':
        // Store layout state
        this.layoutState = {
          layout: message.layout,
          panes: message.panes,
        };
        await this.persistLayout();
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;
    }
  }

  private async persistState(): Promise<void> {
    if (this.documentState) {
      await this.state.storage.put('documentState', this.documentState);
    }
  }

  private async persistLayout(): Promise<void> {
    if (this.layoutState) {
      await this.state.storage.put('layoutState', this.layoutState);
    }
  }

  private broadcast(excludeClientId: string, message: unknown): void {
    const data = JSON.stringify(message);

    this.sessions.forEach((session, id) => {
      if (id !== excludeClientId) {
        try {
          session.socket.send(data);
        } catch (error) {
          console.error('Failed to send to client:', id, error);
        }
      }
    });
  }

  private broadcastAwareness(): void {
    const awareness: Record<string, { color: string; tabId?: string; cursor?: unknown; selection?: unknown }> = {};

    this.sessions.forEach((session, id) => {
      awareness[id] = {
        color: session.color,
        tabId: session.tabId,
        cursor: session.cursor,
        selection: session.selection,
      };
    });

    const message = {
      type: 'awareness',
      clients: awareness,
    };

    const data = JSON.stringify(message);

    this.sessions.forEach((session) => {
      try {
        session.socket.send(data);
      } catch (error) {
        console.error('Failed to send awareness:', error);
      }
    });
  }
}

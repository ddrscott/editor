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

interface Env {
  DB: D1Database;
}

export class SpaceRoom {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<string, Session> = new Map();
  private documentState: DocumentState | null = null;
  private layoutState: LayoutState | null = null;
  private sql: SqlStorage;
  private spaceId: string | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;

    // Initialize SQLite schema and load state
    this.state.blockConcurrencyWhile(async () => {
      this.initializeSchema();
      this.loadState();
    });
  }

  private initializeSchema(): void {
    // Create tables if they don't exist
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS document_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_tab_id TEXT,
        tab_counter INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tabs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        hidden INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS layout_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        layout_json TEXT NOT NULL,
        panes_json TEXT NOT NULL
      );
    `);
  }

  private loadState(): void {
    // Load document state (use toArray to handle empty results)
    const docRows = this.sql.exec('SELECT active_tab_id, tab_counter FROM document_state WHERE id = 1').toArray();
    const docRow = docRows.length > 0 ? docRows[0] : null;

    // Load tabs
    const tabRows = this.sql.exec('SELECT id, title, content, hidden FROM tabs ORDER BY sort_order').toArray();
    const tabs = tabRows.map(row => ({
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      hidden: row.hidden === 1,
    }));

    if (docRow || tabs.length > 0) {
      this.documentState = {
        tabs,
        activeTabId: docRow?.active_tab_id as string | null ?? null,
        tabCounter: (docRow?.tab_counter as number) ?? 0,
      };
    }

    // Load layout state (use toArray to handle empty results)
    const layoutRows = this.sql.exec('SELECT layout_json, panes_json FROM layout_state WHERE id = 1').toArray();
    if (layoutRows.length > 0) {
      const layoutRow = layoutRows[0];
      this.layoutState = {
        layout: JSON.parse(layoutRow.layout_json as string),
        panes: JSON.parse(layoutRow.panes_json as string),
      };
    }
  }

  async fetch(request: Request): Promise<Response> {
    // Extract spaceId from URL if not already set
    if (!this.spaceId) {
      const url = new URL(request.url);
      const match = url.pathname.match(/\/ws\/space\/(.+)/);
      if (match) {
        this.spaceId = match[1];
      }
    }

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket();
    }

    return new Response('Expected WebSocket', { status: 400 });
  }

  private async trackWrite(): Promise<void> {
    if (!this.spaceId || !this.env.DB) return;

    try {
      await this.env.DB.prepare(`
        INSERT INTO spaces (id, reads, writes)
        VALUES (?, 0, 1)
        ON CONFLICT(id) DO UPDATE SET
          writes = writes + 1,
          updated_at = datetime('now')
      `).bind(this.spaceId).run();
    } catch (error) {
      console.error('Failed to track space write:', error);
    }
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
    server.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as ClientMessage;
        this.handleMessage(clientId, message);
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

  private handleMessage(clientId: string, message: ClientMessage): void {
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
            this.persistState();
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
        this.persistState();
        this.trackWrite(); // Track in D1
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;

      case 'tab-close':
        // Remove tab from document state
        if (this.documentState) {
          this.documentState.tabs = this.documentState.tabs.filter(t => t.id !== message.tabId);
          this.persistState();
          this.trackWrite(); // Track in D1
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
            this.persistState();
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
            this.persistState();
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
            this.persistState();
          }
        }
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;

      case 'full-sync':
        // Store the full state
        this.documentState = message.state;
        this.persistState();
        this.trackWrite(); // Track in D1
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
        this.persistLayout();
        this.trackWrite(); // Track in D1
        // Broadcast to all other clients
        this.broadcast(clientId, message);
        break;
    }
  }

  private persistState(): void {
    if (!this.documentState) return;

    // Upsert document state
    this.sql.exec(
      `INSERT INTO document_state (id, active_tab_id, tab_counter)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         active_tab_id = excluded.active_tab_id,
         tab_counter = excluded.tab_counter`,
      this.documentState.activeTabId,
      this.documentState.tabCounter
    );

    // Get current tab IDs in database
    const existingIds = new Set(
      this.sql.exec('SELECT id FROM tabs').toArray().map(r => r.id as string)
    );
    const currentIds = new Set(this.documentState.tabs.map(t => t.id));

    // Delete removed tabs
    for (const id of existingIds) {
      if (!currentIds.has(id)) {
        this.sql.exec('DELETE FROM tabs WHERE id = ?', id);
      }
    }

    // Upsert tabs
    this.documentState.tabs.forEach((tab, index) => {
      this.sql.exec(
        `INSERT INTO tabs (id, title, content, hidden, sort_order)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           content = excluded.content,
           hidden = excluded.hidden,
           sort_order = excluded.sort_order`,
        tab.id,
        tab.title,
        tab.content,
        tab.hidden ? 1 : 0,
        index
      );
    });
  }

  private persistLayout(): void {
    if (!this.layoutState) return;

    this.sql.exec(
      `INSERT INTO layout_state (id, layout_json, panes_json)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         layout_json = excluded.layout_json,
         panes_json = excluded.panes_json`,
      JSON.stringify(this.layoutState.layout),
      JSON.stringify(this.layoutState.panes)
    );
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

# Monaco Editor - Collaborative Code Editor

A real-time collaborative code editor built with Monaco Editor, Cloudflare Workers, and Durable Objects.

**Live at:** https://monaco.ljs.app

## Features

- **Monaco Editor** - VS Code's editor with syntax highlighting for 80+ languages
- **Real-time Collaboration** - Multiple users can edit simultaneously via WebSocket sync
- **Split Panes** - Horizontal and vertical splits with draggable resizers
- **Markdown Preview** - Live preview with `Cmd+K V` (side-by-side) or `Cmd+Shift+V` (replace)
- **Multi-tab Interface** - Create, rename, close, and drag tabs between panes
- **Persistent State** - All tabs, content, splits, and previews persist via Durable Objects
- **Shareable Spaces** - Share any space URL for instant collaboration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────┤
│  Worker (index.ts)                                          │
│  ├── Static Assets (dist/)                                  │
│  ├── /new → Creates space, redirects to /space/{id}         │
│  └── /ws/space/{id} → WebSocket to Durable Object           │
├─────────────────────────────────────────────────────────────┤
│  SpaceRoom (Durable Object)                                 │
│  ├── SQLite Storage (tabs, layout, document state)          │
│  ├── WebSocket sessions (real-time sync)                    │
│  └── Awareness (cursors, selections)                        │
├─────────────────────────────────────────────────────────────┤
│  D1 Database                                                │
│  └── Space metadata (reads/writes tracking)                 │
└─────────────────────────────────────────────────────────────┘
```

### Client Architecture

```
src/
├── index.ts              # Entry point, router setup
├── router/Router.ts      # Client-side routing
├── pages/
│   ├── LandingPage.ts    # Homepage
│   └── LegalPage.ts      # Terms/Privacy
├── app/EditorApp.ts      # Main editor (tabs, panes, Monaco)
├── sync/SyncClient.ts    # WebSocket sync client
└── preview/
    ├── MarkdownPreview.ts
    └── HTMLPreview.ts
```

### Server Architecture

```
worker/
├── index.ts              # Cloudflare Worker entry
└── SpaceRoom.ts          # Durable Object (state + WebSocket)
```

## Development

### Prerequisites

- Node.js 18+
- Cloudflare account (for Wrangler)

### Setup

```bash
# Install dependencies
npm install

# Run locally with Wrangler (full stack)
npm run dev

# Or run Parcel dev server (frontend only, no sync)
npm start
```

### Commands

| Command | Description |
|---------|-------------|
| `npm start` | Parcel dev server (port 1234, no WebSocket sync) |
| `npm run dev` | Wrangler dev server (port 8787, full sync) |
| `npm run build` | Build for production |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:migrate` | Apply D1 database migrations |

### Local Development Notes

- Use `npm run dev` (Wrangler) to test collaboration features
- `npm start` (Parcel) is faster for UI-only changes but disables sync
- Durable Object state persists locally in `.wrangler/`

## Data Flow

1. User visits `/new` → Worker creates Durable Object with default document
2. Redirect to `/space/{uuid}` → Client connects via WebSocket
3. Durable Object sends initial state (tabs, layout, content)
4. All changes sync bidirectionally:
   - Tab create/close/rename/hide/restore
   - Content updates
   - Layout changes (splits, resize)
   - Preview tabs (linked to source)

### Sync Protocol

Messages between client and server:

| Type | Direction | Description |
|------|-----------|-------------|
| `sync` | Server→Client | Initial state + client ID |
| `full-sync` | Bidirectional | Complete document state |
| `tab-update` | Bidirectional | Content/title change |
| `tab-create` | Bidirectional | New tab (including previews) |
| `tab-close` | Bidirectional | Remove tab |
| `tab-hide/restore` | Bidirectional | Soft delete/restore |
| `tab-rename` | Bidirectional | Rename tab |
| `layout-update` | Bidirectional | Pane structure + sizes |
| `awareness` | Bidirectional | Cursor/selection positions |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New tab |
| `Cmd+W` | Close tab |
| `Cmd+S` | Save (triggers sync) |
| `Cmd+K V` | Split with markdown preview |
| `Cmd+Shift+V` | Markdown preview (replace) |
| `Cmd+\` | Split pane |
| `Cmd+1/2/3` | Focus pane by index |

## Deployment

Deployed to Cloudflare Workers with:

- **Workers** - Edge compute for routing and WebSocket handling
- **Durable Objects** - Stateful collaboration rooms with SQLite
- **D1** - Global database for space metadata
- **Assets** - Static file serving from `dist/`

```bash
# Deploy to production
npm run deploy
```

## Configuration

### wrangler.toml

- `routes` - Custom domain configuration
- `durable_objects` - SpaceRoom binding
- `d1_databases` - Analytics database
- `assets` - Static file directory

### Environment

No secrets required. All state is stored in Durable Objects.

## License

MIT

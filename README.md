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
- **Quick Start Grid** - One-click buttons for 20 popular languages on the landing page
- **Custom Filename URLs** - Create spaces with specific filenames via `/new/{filename}`
- **Code Execution** - Run Java, Python, Ruby, Lua, PostgreSQL, DuckDB, and SQLite directly in the browser

## Quick Start URLs

Create a new space with a specific filename by visiting `/new/{filename}`:

| URL | Creates |
|-----|---------|
| `monaco.ljs.app/new/Hello.java` | Space with `Hello.java` |
| `monaco.ljs.app/new/script.py` | Space with `script.py` |
| `monaco.ljs.app/new/README.md` | Space with `README.md` |
| `monaco.ljs.app/new/index.html` | Space with `index.html` |

This is useful for:
- **Classrooms** - Teachers share links like `/new/Assignment1.java`
- **Workshops** - Pre-configured starting files for tutorials
- **Quick sharing** - Direct links to specific file types

## Code Execution

Run code directly in the browser using the **Run** button or `Cmd+R`:

| Language | Runtime | Extensions |
|----------|---------|------------|
| Java | CheerpJ (WebAssembly JVM) | `.java` |
| Python | Pyodide (WebAssembly CPython) | `.py` |
| Ruby | ruby.wasm (CRuby 3.4 WASM) | `.rb` |
| Lua | Fengari (Lua 5.3 JS) | `.lua` |
| PostgreSQL | PGlite (WebAssembly Postgres) | `.pgsql`, `.psql` |
| DuckDB | DuckDB-WASM | `.duckdb` |
| SQLite | sql.js (Emscripten SQLite) | `.sql`, `.sqlite` |

For unsupported languages, clicking Run shows a "Coming Soon" dialog.

**Note:** First run may take a few seconds to download the runtime (~15-30MB cached).

### PostgreSQL Features

- **Persistent Storage**: Each space has its own PostgreSQL database stored in IndexedDB
- **Full PostgreSQL**: Supports tables, indexes, constraints, CTEs, window functions, etc.
- **Reset Database**: Click "Reset DB" in the output panel to clear all tables and data
- **ASCII Tables**: Query results display as formatted ASCII tables

### DuckDB Features

- **In-Memory Analytics**: Optimized for analytical queries (OLAP)
- **Columnar Storage**: Efficient for aggregations and data analysis
- **Modern SQL**: Supports CTEs, window functions, UNNEST, LIST types, etc.
- **Data Import**: Can query CSV, Parquet, and JSON files via URLs
- **Reset Database**: Click "Reset DB" to clear all tables

### SQLite Features

- **In-Memory Database**: Fast, lightweight embedded SQL database
- **Full SQL Support**: Standard SQL with SQLite extensions
- **Reset Database**: Click "Reset DB" to clear all tables

### Ruby Features

- **Full CRuby**: Complete Ruby interpreter via WebAssembly
- **Standard Library**: Most of Ruby's stdlib available
- **Output Capture**: stdout and return values displayed

### Lua Features

- **Lua 5.3**: Full Lua via Fengari (pure JavaScript)
- **Lightweight**: No WASM, fast startup
- **print() Support**: Output captured and displayed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────┤
│  Worker (index.ts)                                          │
│  ├── Static Assets (dist/)                                  │
│  ├── /new → Creates space, redirects to /space/{id}         │
│  ├── /new/{filename} → Creates space with custom filename   │
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
├── runners/
│   ├── RunnerManager.ts  # Code execution router
│   ├── JavaRunner.ts     # CheerpJ JVM
│   ├── PythonRunner.ts   # Pyodide CPython
│   ├── RubyRunner.ts     # ruby.wasm CRuby
│   ├── LuaRunner.ts      # Fengari Lua 5.3
│   ├── PostgresRunner.ts # PGlite (IndexedDB)
│   ├── DuckDBRunner.ts   # DuckDB-WASM (CDN)
│   └── SQLiteRunner.ts   # sql.js (in-memory)
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

1. User visits `/new` or `/new/{filename}` → Worker creates Durable Object
   - `/new` creates default `untitled-1.txt`
   - `/new/Hello.java` creates `Hello.java` with proper syntax highlighting
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
| `Cmd+R` | Run code (Java, Python, Ruby, Lua, SQL) |
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

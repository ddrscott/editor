import { SpaceRoom } from './SpaceRoom';

export { SpaceRoom };

interface Env {
  SPACE_ROOM: DurableObjectNamespace;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  DB: D1Database;
  DB_API_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Create new space - server generates ID and initializes Durable Object
    // Supports /new and /new/:filename patterns
    if (path === '/new' || path.startsWith('/new/')) {
      const spaceId = crypto.randomUUID();

      // Extract optional filename from path (e.g., /new/Hello.java -> Hello.java)
      const filename = path.startsWith('/new/') ? decodeURIComponent(path.slice(5)) : null;

      // Initialize the Durable Object with default state
      const id = env.SPACE_ROOM.idFromName(spaceId);
      const room = env.SPACE_ROOM.get(id);

      // Call init endpoint to ensure DO is created with default state
      // Pass filename in body if provided
      const initRequest = new Request('https://internal/init', {
        method: 'POST',
        headers: filename ? { 'Content-Type': 'application/json' } : {},
        body: filename ? JSON.stringify({ filename }) : null,
      });
      await room.fetch(initRequest);

      // Track the new space
      await trackSpaceRead(env.DB, spaceId);

      // Redirect to the new space
      return Response.redirect(`${url.origin}/space/${spaceId}`, 302);
    }

    // API proxy to db-api for MySQL/MSSQL execution
    if (path.startsWith('/api/db/')) {
      const dbApiUrl = env.DB_API_URL || 'https://db-api.ljs.app';
      const targetUrl = dbApiUrl + path.replace('/api/db', '/db');

      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      const response = await fetch(proxyRequest);

      // Return response (handles both JSON and text formats)
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'text/plain',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // WebSocket upgrade for space collaboration
    if (path.startsWith('/ws/space/')) {
      const spaceId = path.replace('/ws/space/', '');
      return handleWebSocket(request, env, spaceId);
    }

    // Check if this is a static asset request (has file extension)
    const isStaticAsset = path.includes('.') || path === '/';

    if (env.ASSETS) {
      if (isStaticAsset) {
        // Serve static assets directly
        return env.ASSETS.fetch(request);
      } else {
        // SPA route - serve index.html but keep the URL
        const indexUrl = new URL('/index.html', request.url);
        const indexRequest = new Request(indexUrl.toString(), {
          method: 'GET',
          headers: request.headers,
        });
        const response = await env.ASSETS.fetch(indexRequest);

        // Return the response with the original URL (don't follow redirects)
        if (response.status === 307 || response.status === 301 || response.status === 302) {
          // If ASSETS redirects, fetch the redirect target
          const location = response.headers.get('Location');
          if (location) {
            const redirectUrl = new URL(location, request.url);
            return env.ASSETS.fetch(new Request(redirectUrl.toString()));
          }
        }
        return response;
      }
    }

    // Fallback when no ASSETS binding
    return new Response('Not Found', { status: 404 });
  },
};

async function handleWebSocket(request: Request, env: Env, spaceId: string): Promise<Response> {
  // Track read in D1 (upsert space and increment reads)
  await trackSpaceRead(env.DB, spaceId);

  const id = env.SPACE_ROOM.idFromName(spaceId);
  const room = env.SPACE_ROOM.get(id);
  return room.fetch(request);
}

async function trackSpaceRead(db: D1Database, spaceId: string): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO spaces (id, reads, writes)
      VALUES (?, 1, 0)
      ON CONFLICT(id) DO UPDATE SET
        reads = reads + 1,
        updated_at = datetime('now')
    `).bind(spaceId).run();
  } catch (error) {
    console.error('Failed to track space read:', error);
  }
}

export async function trackSpaceWrite(db: D1Database, spaceId: string): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO spaces (id, reads, writes)
      VALUES (?, 0, 1)
      ON CONFLICT(id) DO UPDATE SET
        writes = writes + 1,
        updated_at = datetime('now')
    `).bind(spaceId).run();
  } catch (error) {
    console.error('Failed to track space write:', error);
  }
}

import { SpaceRoom } from './SpaceRoom';

export { SpaceRoom };

interface Env {
  SPACE_ROOM: DurableObjectNamespace;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

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
  const id = env.SPACE_ROOM.idFromName(spaceId);
  const room = env.SPACE_ROOM.get(id);
  return room.fetch(request);
}

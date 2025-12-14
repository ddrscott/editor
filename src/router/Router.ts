type RouteHandler = (params: Record<string, string>) => void | Promise<void>;

interface Route {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];
  private currentCleanup: (() => void) | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    window.addEventListener('popstate', () => this.handleRoute());
  }

  route(path: string, handler: RouteHandler): this {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    this.routes.push({
      pattern: new RegExp(`^${patternStr}$`),
      paramNames,
      handler
    });

    return this;
  }

  navigate(path: string, replace = false): void {
    if (replace) {
      history.replaceState(null, '', path);
    } else {
      history.pushState(null, '', path);
    }
    this.handleRoute();
  }

  private async handleRoute(): Promise<void> {
    const path = window.location.pathname;

    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = null;
    }

    for (const route of this.routes) {
      const match = path.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });
        await route.handler(params);
        return;
      }
    }

    // No match - redirect to home
    this.navigate('/', true);
  }

  setCleanup(fn: () => void): void {
    this.currentCleanup = fn;
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  start(): void {
    this.handleRoute();
  }
}

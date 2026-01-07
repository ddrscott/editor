import { LanguageRunner, ExecutionResult } from './LanguageRunner';

// Fengari types
interface FengariModule {
  lua: any;
  lauxlib: any;
  lualib: any;
  to_luastring: (str: string) => Uint8Array;
  to_jsstring: (bytes: Uint8Array) => string;
}

// Global for CDN-loaded fengari
declare global {
  interface Window {
    fengari?: FengariModule;
  }
}

/**
 * Lua code executor using Fengari (Lua 5.3 in pure JavaScript).
 * Runs Lua entirely in the browser with no WASM required.
 */
export class LuaRunner implements LanguageRunner {
  readonly language = 'lua';
  readonly supportedExtensions = ['lua'];

  private L: any = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this._initialize();
    await this.initializing;
  }

  private loadFengari(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.fengari) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js';
      script.onload = () => {
        if (window.fengari) {
          resolve();
        } else {
          reject(new Error('Fengari not found after script load'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load Fengari runtime'));
      document.head.appendChild(script);

      // Timeout fallback
      setTimeout(() => {
        if (!window.fengari) {
          reject(new Error('Fengari load timeout'));
        }
      }, 30000);
    });
  }

  private async _initialize(): Promise<void> {
    try {
      await this.loadFengari();

      const { lauxlib, lualib } = window.fengari!;

      // Create new Lua state
      this.L = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(this.L);
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Lua runtime: ${error}`);
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  async execute(code: string, _filename: string): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      if (!this.initialized || !this.L) {
        await this.initialize();
      }

      if (!this.L) {
        throw new Error('Lua not initialized');
      }

      const fengari = window.fengari!;
      const { lua, lauxlib } = fengari;

      // Capture print output
      const outputs: string[] = [];

      // Create a custom print function
      const printFunc = (L: any) => {
        const n = lua.lua_gettop(L);
        const parts: string[] = [];
        for (let i = 1; i <= n; i++) {
          const s = lauxlib.luaL_tolstring(L, i);
          parts.push(fengari.to_jsstring(s));
          lua.lua_pop(L, 1);
        }
        outputs.push(parts.join('\t'));
        return 0;
      };

      // Register custom print
      lua.lua_pushcfunction(this.L, printFunc);
      lua.lua_setglobal(this.L, fengari.to_luastring('print'));

      // Execute the code
      const codeBytes = fengari.to_luastring(code);
      const status = lauxlib.luaL_dostring(this.L, codeBytes);

      if (status !== lua.LUA_OK) {
        const errorMsg = lua.lua_tojsstring(this.L, -1);
        lua.lua_pop(this.L, 1);
        return {
          success: false,
          output: '',
          error: `Lua Error: ${errorMsg}`,
          executionTime: performance.now() - startTime
        };
      }

      // Check for return value
      let output = outputs.join('\n');
      const top = lua.lua_gettop(this.L);
      if (top > 0 && outputs.length === 0) {
        const result = lauxlib.luaL_tolstring(this.L, -1);
        output = fengari.to_jsstring(result);
        lua.lua_pop(this.L, top + 1);
      } else if (top > 0) {
        lua.lua_pop(this.L, top);
      }

      const executionTime = performance.now() - startTime;

      return {
        success: true,
        output: output || '(no output)',
        executionTime
      };

    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Lua Error: ${error}`,
        executionTime: performance.now() - startTime
      };
    }
  }

  dispose(): void {
    if (this.L && window.fengari) {
      window.fengari.lua.lua_close(this.L);
      this.L = null;
    }
    this.initialized = false;
    this.initializing = null;
  }
}

import { LanguageRunner, ExecutionResult } from './LanguageRunner';

// Global for CDN-loaded ruby.wasm
declare global {
  interface Window {
    RubyVM?: any;
    rubyVM?: any;
  }
}

/**
 * Ruby code executor using ruby.wasm.
 * Runs Ruby (CRuby 3.4) entirely in the browser via WebAssembly.
 */
export class RubyRunner implements LanguageRunner {
  readonly language = 'ruby';
  readonly supportedExtensions = ['rb'];

  private vm: any = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this._initialize();
    await this.initializing;
  }

  private loadRubyScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.rubyVM) {
        resolve();
        return;
      }

      // Load the IIFE script which sets up ruby.wasm automatically
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@ruby/3.4-wasm-wasi@2.7.2/dist/browser.script.iife.js';

      script.onload = () => {
        // The IIFE script sets up the Ruby VM - we need to wait a moment for it
        const checkReady = () => {
          if (window.rubyVM) {
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        // Give it a moment to initialize
        setTimeout(checkReady, 500);
      };

      script.onerror = () => reject(new Error('Failed to load Ruby runtime'));
      document.head.appendChild(script);

      // Timeout fallback (Ruby WASM is large)
      setTimeout(() => {
        if (!window.rubyVM) {
          reject(new Error('Ruby load timeout'));
        }
      }, 120000);
    });
  }

  private async _initialize(): Promise<void> {
    try {
      await this.loadRubyScript();
      this.vm = window.rubyVM;
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Ruby runtime: ${error}`);
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  async execute(code: string, _filename: string): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      if (!this.initialized || !this.vm) {
        await this.initialize();
      }

      if (!this.vm) {
        throw new Error('Ruby not initialized');
      }

      // Capture stdout by wrapping code
      const wrappedCode = `
        require 'stringio'
        $stdout = StringIO.new
        $stderr = StringIO.new
        begin
          __result__ = begin
            ${code}
          end
          __output__ = $stdout.string
          __errors__ = $stderr.string
          if __errors__.length > 0
            __output__ + "\\n" + __errors__
          elsif __output__.length > 0
            __output__
          elsif !__result__.nil?
            __result__.inspect
          else
            ""
          end
        rescue Exception => e
          $stderr.string + "\\n" + e.class.to_s + ": " + e.message + "\\n" + e.backtrace.first(5).join("\\n")
        end
      `;

      const result = this.vm.eval(wrappedCode);
      const output = String(result || '');
      const executionTime = performance.now() - startTime;

      // Check if output contains error indicators
      if (output.includes('Error:') || output.includes('Exception:')) {
        return {
          success: false,
          output: '',
          error: output,
          executionTime
        };
      }

      return {
        success: true,
        output: output || '(no output)',
        executionTime
      };

    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Ruby Error: ${error}`,
        executionTime: performance.now() - startTime
      };
    }
  }

  dispose(): void {
    this.vm = null;
    this.initialized = false;
    this.initializing = null;
  }
}

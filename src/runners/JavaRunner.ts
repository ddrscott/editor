import { LanguageRunner, ExecutionResult } from './LanguageRunner';

// CheerpJ types
declare global {
  interface Window {
    cheerpjInit: (options?: {
      status?: string;
    }) => Promise<void>;
    cheerpjRunMain: (className: string, classPath: string, ...args: string[]) => Promise<number>;
    cheerpjCreateDisplay: (width: number, height: number, parent: HTMLElement) => void;
    cheerpOSAddStringFile: (path: string, data: Uint8Array) => void;
  }
}

/**
 * Java code executor using CheerpJ WebAssembly JVM.
 * Compiles and runs Java code entirely in the browser.
 */
export class JavaRunner implements LanguageRunner {
  readonly language = 'java';
  readonly supportedExtensions = ['java'];

  private initialized = false;
  private initializing: Promise<void> | null = null;
  private consoleElement: HTMLDivElement | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this._initialize();
    await this.initializing;
  }

  private async _initialize(): Promise<void> {
    try {
      // Load CheerpJ script dynamically
      await this.loadCheerpJScript();

      // Create console output element for CheerpJ
      // CheerpJ automatically writes System.out to element with id="console"
      this.consoleElement = document.createElement('div');
      this.consoleElement.id = 'console';
      this.consoleElement.style.display = 'none';
      document.body.appendChild(this.consoleElement);

      // Initialize CheerpJ runtime
      await window.cheerpjInit({
        status: 'none'
      });

      this.initialized = true;
    } catch (error) {
      // Don't reset initializing here - all waiters should get the same error
      // If initialization fails, the user will need to refresh the page
      throw new Error(`Failed to initialize Java runtime: ${error}`);
    }
  }

  private loadCheerpJScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (typeof window.cheerpjInit === 'function') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cjrtnc.leaningtech.com/4.2/loader.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load CheerpJ runtime'));
      document.head.appendChild(script);
    });
  }

  isReady(): boolean {
    return this.initialized;
  }

  async execute(code: string, filename: string): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      // Ensure initialized
      if (!this.initialized) {
        await this.initialize();
      }

      // Clear previous console output
      if (this.consoleElement) {
        this.consoleElement.textContent = '';
      }

      // Extract class name from code (public class Name)
      const classNameMatch = code.match(/public\s+class\s+(\w+)/);
      const className = classNameMatch ? classNameMatch[1] : filename.replace(/\.java$/, '');
      const javaFilename = `${className}.java`;

      // Write source file to virtual filesystem
      const encoder = new TextEncoder();
      window.cheerpOSAddStringFile(`/str/${javaFilename}`, encoder.encode(code));

      // Compile with javac - /app/ maps to web server root where tools.jar is served
      const classPath = `/app/tools.jar:/files/`;

      const compileExitCode = await window.cheerpjRunMain(
        'com.sun.tools.javac.Main',
        classPath,
        '-d', '/files/',
        `/str/${javaFilename}`
      );

      const compilerOutput = this.consoleElement?.textContent || '';

      if (compileExitCode !== 0) {
        return {
          success: false,
          output: compilerOutput || 'Compilation failed',
          error: `Compilation failed with exit code ${compileExitCode}`,
          executionTime: performance.now() - startTime
        };
      }

      // Clear console for program output
      if (this.consoleElement) {
        this.consoleElement.textContent = '';
      }

      // Execute compiled class
      const runExitCode = await window.cheerpjRunMain(
        className,
        classPath
      );

      const programOutput = this.consoleElement?.textContent || '';
      const executionTime = performance.now() - startTime;

      return {
        success: runExitCode === 0,
        output: programOutput || '(no output)',
        error: runExitCode !== 0 ? `Program exited with code ${runExitCode}` : undefined,
        executionTime
      };

    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Execution error: ${error}`,
        executionTime: performance.now() - startTime
      };
    }
  }

  dispose(): void {
    if (this.consoleElement) {
      this.consoleElement.remove();
      this.consoleElement = null;
    }
    this.initialized = false;
    this.initializing = null;
  }
}

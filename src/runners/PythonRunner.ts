import { LanguageRunner, ExecutionResult } from './LanguageRunner';

// Pyodide types
declare global {
  interface Window {
    loadPyodide: (config?: {
      indexURL?: string;
      stdout?: (msg: string) => void;
      stderr?: (msg: string) => void;
    }) => Promise<PyodideInterface>;
  }
}

interface PyodideInterface {
  runPython: (code: string) => unknown;
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (options: { batched: (msg: string) => void }) => void;
  setStderr: (options: { batched: (msg: string) => void }) => void;
  globals: unknown;
}

/**
 * Python code executor using Pyodide WebAssembly runtime.
 * Runs Python code entirely in the browser.
 */
export class PythonRunner implements LanguageRunner {
  readonly language = 'python';
  readonly supportedExtensions = ['py'];

  private pyodide: PyodideInterface | null = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this._initialize();
    await this.initializing;
  }

  private async _initialize(): Promise<void> {
    try {
      // Load Pyodide script dynamically
      await this.loadPyodideScript();

      // Initialize Pyodide runtime
      this.pyodide = await window.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
      });

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Python runtime: ${error}`);
    }
  }

  private loadPyodideScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (typeof window.loadPyodide === 'function') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Pyodide runtime'));
      document.head.appendChild(script);
    });
  }

  isReady(): boolean {
    return this.initialized;
  }

  async execute(code: string, _filename: string): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      // Ensure initialized
      if (!this.initialized || !this.pyodide) {
        await this.initialize();
      }

      if (!this.pyodide) {
        throw new Error('Pyodide not initialized');
      }

      // Wrap user code to capture stdout/stderr via Python's io module
      const wrappedCode = `
import sys
from io import StringIO

__stdout_capture__ = StringIO()
__stderr_capture__ = StringIO()
__old_stdout__ = sys.stdout
__old_stderr__ = sys.stderr
sys.stdout = __stdout_capture__
sys.stderr = __stderr_capture__

__exec_error__ = None
try:
${code.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    __exec_error__ = str(e)

sys.stdout = __old_stdout__
sys.stderr = __old_stderr__

(__stdout_capture__.getvalue(), __stderr_capture__.getvalue(), __exec_error__)
`;

      // Execute wrapped Python code
      let result: unknown;
      try {
        result = await this.pyodide.runPythonAsync(wrappedCode);
      } catch (pythonError) {
        const executionTime = performance.now() - startTime;
        return {
          success: false,
          output: '',
          error: String(pythonError),
          executionTime
        };
      }

      const executionTime = performance.now() - startTime;

      // Extract stdout, stderr, and error from result tuple
      const [stdout, stderr, execError] = result as [string, string, string | null];

      if (execError) {
        return {
          success: false,
          output: stdout,
          error: execError,
          executionTime
        };
      }

      return {
        success: true,
        output: stdout || '(no output)',
        error: stderr || undefined,
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
    this.pyodide = null;
    this.initialized = false;
    this.initializing = null;
  }
}

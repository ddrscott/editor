import { LanguageRunner, ExecutionResult } from './LanguageRunner';
import { JavaRunner } from './JavaRunner';
import { PythonRunner } from './PythonRunner';

/**
 * Manages language runners and routes execution requests to the appropriate runner.
 */
export class RunnerManager {
  private runners: Map<string, LanguageRunner> = new Map();
  private extensionMap: Map<string, LanguageRunner> = new Map();

  constructor() {
    // Register built-in runners
    this.registerRunner(new JavaRunner());
    this.registerRunner(new PythonRunner());
  }

  /**
   * Register a new language runner
   */
  registerRunner(runner: LanguageRunner): void {
    this.runners.set(runner.language, runner);

    // Map extensions to runner
    for (const ext of runner.supportedExtensions) {
      this.extensionMap.set(ext, runner);
    }
  }

  /**
   * Get the runner for a given filename based on file extension
   */
  getRunnerForFile(filename: string): LanguageRunner | null {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext) return null;
    return this.extensionMap.get(ext) || null;
  }

  /**
   * Check if a file type is runnable
   */
  canRun(filename: string): boolean {
    return this.getRunnerForFile(filename) !== null;
  }

  /**
   * Run code from a file
   */
  async runFile(filename: string, code: string): Promise<ExecutionResult> {
    const runner = this.getRunnerForFile(filename);

    if (!runner) {
      return {
        success: false,
        output: '',
        error: `No runner available for file type: ${filename.split('.').pop() || 'unknown'}`
      };
    }

    // Initialize if needed (lazy initialization)
    if (!runner.isReady()) {
      try {
        await runner.initialize();
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to initialize ${runner.language} runtime: ${error}`
        };
      }
    }

    return runner.execute(code, filename);
  }

  /**
   * Get list of supported file extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }

  /**
   * Cleanup all runners
   */
  dispose(): void {
    this.runners.forEach(runner => runner.dispose());
    this.runners.clear();
    this.extensionMap.clear();
  }
}

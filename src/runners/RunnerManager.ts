import { LanguageRunner, ExecutionResult } from './LanguageRunner';

// Runner metadata for lazy loading
interface RunnerInfo {
  language: string;
  extensions: string[];
  loader: () => Promise<LanguageRunner>;
}

// Define runners with their loaders (dynamic imports for code splitting)
const RUNNER_REGISTRY: RunnerInfo[] = [
  {
    language: 'java',
    extensions: ['java'],
    loader: async () => {
      const { JavaRunner } = await import('./JavaRunner');
      return new JavaRunner();
    }
  },
  {
    language: 'python',
    extensions: ['py'],
    loader: async () => {
      const { PythonRunner } = await import('./PythonRunner');
      return new PythonRunner();
    }
  },
  {
    language: 'postgres',
    extensions: ['pgsql', 'psql'],
    loader: async () => {
      const { PostgresRunner } = await import('./PostgresRunner');
      return new PostgresRunner();
    }
  },
  {
    language: 'duckdb',
    extensions: ['duckdb'],
    loader: async () => {
      const { DuckDBRunner } = await import('./DuckDBRunner');
      return new DuckDBRunner();
    }
  },
  {
    language: 'sqlite',
    extensions: ['sql', 'sqlite'],
    loader: async () => {
      const { SQLiteRunner } = await import('./SQLiteRunner');
      return new SQLiteRunner();
    }
  },
  {
    language: 'ruby',
    extensions: ['rb'],
    loader: async () => {
      const { RubyRunner } = await import('./RubyRunner');
      return new RubyRunner();
    }
  },
  {
    language: 'lua',
    extensions: ['lua'],
    loader: async () => {
      const { LuaRunner } = await import('./LuaRunner');
      return new LuaRunner();
    }
  }
];

/**
 * Manages language runners and routes execution requests to the appropriate runner.
 * Uses dynamic imports for code splitting - runner code is only loaded when needed.
 */
export class RunnerManager {
  private runners: Map<string, LanguageRunner> = new Map();
  private extensionToLanguage: Map<string, string> = new Map();
  private loaders: Map<string, () => Promise<LanguageRunner>> = new Map();

  constructor() {
    // Register extension mappings and loaders (but don't load runner code yet)
    for (const info of RUNNER_REGISTRY) {
      this.loaders.set(info.language, info.loader);
      for (const ext of info.extensions) {
        this.extensionToLanguage.set(ext, info.language);
      }
    }
  }

  /**
   * Get the language for a file extension
   */
  private getLanguageForFile(filename: string): string | null {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext) return null;
    return this.extensionToLanguage.get(ext) || null;
  }

  /**
   * Get or load the runner for a language
   */
  private async getRunner(language: string): Promise<LanguageRunner | null> {
    // Return cached runner if available
    if (this.runners.has(language)) {
      return this.runners.get(language)!;
    }

    // Load runner dynamically
    const loader = this.loaders.get(language);
    if (!loader) return null;

    const runner = await loader();
    this.runners.set(language, runner);
    return runner;
  }

  /**
   * Check if a file type is runnable
   */
  canRun(filename: string): boolean {
    return this.getLanguageForFile(filename) !== null;
  }

  /**
   * Run code from a file
   */
  async runFile(filename: string, code: string): Promise<ExecutionResult> {
    const language = this.getLanguageForFile(filename);

    if (!language) {
      return {
        success: false,
        output: '',
        error: `No runner available for file type: ${filename.split('.').pop() || 'unknown'}`
      };
    }

    // Load runner (dynamic import happens here)
    const runner = await this.getRunner(language);

    if (!runner) {
      return {
        success: false,
        output: '',
        error: `Failed to load ${language} runner`
      };
    }

    // Initialize runtime if needed
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
    return Array.from(this.extensionToLanguage.keys());
  }

  /**
   * Cleanup all runners
   */
  dispose(): void {
    this.runners.forEach(runner => runner.dispose());
    this.runners.clear();
  }
}

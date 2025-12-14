/**
 * Result of executing code
 */
export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime?: number;
}

/**
 * Interface for language-specific code executors.
 * Implement this interface to add support for new languages.
 */
export interface LanguageRunner {
  /** Unique identifier for this runner (e.g., 'java', 'python') */
  readonly language: string;

  /** File extensions this runner supports (e.g., ['java']) */
  readonly supportedExtensions: string[];

  /** Initialize the runtime (async, called once on first use) */
  initialize(): Promise<void>;

  /** Check if runtime is ready */
  isReady(): boolean;

  /** Execute code and return result */
  execute(code: string, filename: string): Promise<ExecutionResult>;

  /** Cleanup resources */
  dispose(): void;
}

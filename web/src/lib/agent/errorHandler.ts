/**
 * Error Handler - Retry logic and error recovery
 * Adapted from browser-use error handling patterns
 */

// ============ Error Types ============

/**
 * Base agent error
 */
export class AgentError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    readonly context: Record<string, any>;

    constructor(
        message: string,
        code: string,
        retryable: boolean = false,
        context: Record<string, any> = {}
    ) {
        super(message);
        this.name = 'AgentError';
        this.code = code;
        this.retryable = retryable;
        this.context = context;
    }
}

/**
 * Element not found error
 */
export class ElementNotFoundError extends AgentError {
    constructor(index: number, context: Record<string, any> = {}) {
        super(
            `Element with index ${index} not found or no longer visible`,
            'ELEMENT_NOT_FOUND',
            true,
            { index, ...context }
        );
        this.name = 'ElementNotFoundError';
    }
}

/**
 * Action timeout error
 */
export class ActionTimeoutError extends AgentError {
    constructor(action: string, timeoutMs: number, context: Record<string, any> = {}) {
        super(
            `Action '${action}' timed out after ${timeoutMs}ms`,
            'ACTION_TIMEOUT',
            true,
            { action, timeoutMs, ...context }
        );
        this.name = 'ActionTimeoutError';
    }
}

/**
 * Page navigation error
 */
export class NavigationError extends AgentError {
    constructor(url: string, reason: string, context: Record<string, any> = {}) {
        super(
            `Navigation to '${url}' failed: ${reason}`,
            'NAVIGATION_ERROR',
            true,
            { url, reason, ...context }
        );
        this.name = 'NavigationError';
    }
}

/**
 * LLM response error
 */
export class LLMResponseError extends AgentError {
    constructor(reason: string, rawResponse?: string) {
        super(
            `LLM response error: ${reason}`,
            'LLM_RESPONSE_ERROR',
            true,
            { reason, rawResponse: rawResponse?.slice(0, 500) }
        );
        this.name = 'LLMResponseError';
    }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AgentError {
    readonly retryAfter: number;

    constructor(retryAfterMs: number = 60000) {
        super(
            `Rate limit reached. Retry after ${retryAfterMs / 1000}s`,
            'RATE_LIMIT',
            true,
            { retryAfterMs }
        );
        this.name = 'RateLimitError';
        this.retryAfter = retryAfterMs;
    }
}

/**
 * CAPTCHA detected error
 */
export class CaptchaError extends AgentError {
    constructor(captchaType?: string) {
        super(
            `CAPTCHA detected${captchaType ? `: ${captchaType}` : ''}`,
            'CAPTCHA_DETECTED',
            false,
            { captchaType }
        );
        this.name = 'CaptchaError';
    }
}

/**
 * Extension communication error
 */
export class ExtensionError extends AgentError {
    constructor(message: string) {
        super(
            `Extension error: ${message}`,
            'EXTENSION_ERROR',
            true,
            {}
        );
        this.name = 'ExtensionError';
    }
}

// ============ Retry Config ============

export interface RetryConfig {
    maxRetries: number;
    retryDelay: number;  // Base delay in ms
    exponentialBackoff: boolean;
    maxDelay: number;
    jitter: boolean;  // Add randomness to delays
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    retryDelay: 500,
    exponentialBackoff: true,
    maxDelay: 10000,
    jitter: true,
};

// ============ Retry Handler ============

/**
 * ActionRetryHandler - Handles retry logic with backoff
 * Matches browser-use retry patterns
 */
export class ActionRetryHandler {
    private config: RetryConfig;

    constructor(config: Partial<RetryConfig> = {}) {
        this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    }

    /**
     * Execute an action with retry logic
     */
    async executeWithRetry<T>(
        action: () => Promise<T>,
        actionName: string,
        options?: {
            onRetry?: (attempt: number, error: Error) => void | Promise<void>;
            shouldRetry?: (error: Error, attempt: number) => boolean;
        }
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
            try {
                return await action();
            } catch (error) {
                lastError = error as Error;

                // Check if we should retry
                const shouldRetry = this.shouldRetry(lastError, attempt, options?.shouldRetry);

                if (!shouldRetry) {
                    throw lastError;
                }

                // Calculate delay
                const delay = this.calculateDelay(attempt);

                console.warn(
                    `[RetryHandler] ${actionName} attempt ${attempt} failed: ${lastError.message}. ` +
                    `Retrying in ${delay}ms...`
                );

                // Callback
                await options?.onRetry?.(attempt, lastError);

                // Wait before retry
                await this.sleep(delay);
            }
        }

        // All retries exhausted
        throw lastError || new Error(`${actionName} failed after ${this.config.maxRetries} retries`);
    }

    /**
     * Determine if action should be retried
     */
    private shouldRetry(
        error: Error,
        attempt: number,
        customCheck?: (error: Error, attempt: number) => boolean
    ): boolean {
        // Check if max retries reached
        if (attempt > this.config.maxRetries) {
            return false;
        }

        // Custom check
        if (customCheck) {
            return customCheck(error, attempt);
        }

        // Check if error is retryable
        if (error instanceof AgentError) {
            return error.retryable;
        }

        // Default: retry on these error types
        const retryablePatterns = [
            'timeout',
            'network',
            'ECONNRESET',
            'ETIMEDOUT',
            'ENOTFOUND',
            'socket hang up',
            'temporarily unavailable',
            'rate limit',
            '429',
            '503',
            '502',
            'bad gateway',
        ];

        const errorMessage = error.message.toLowerCase();
        return retryablePatterns.some(pattern =>
            errorMessage.includes(pattern.toLowerCase())
        );
    }

    /**
     * Calculate delay for retry attempt
     */
    private calculateDelay(attempt: number): number {
        let delay = this.config.retryDelay;

        if (this.config.exponentialBackoff) {
            delay = delay * Math.pow(2, attempt - 1);
        }

        // Apply max delay
        delay = Math.min(delay, this.config.maxDelay);

        // Add jitter (± 20%)
        if (this.config.jitter) {
            const jitter = delay * 0.2 * (Math.random() * 2 - 1);
            delay = Math.round(delay + jitter);
        }

        return delay;
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============ Error Recovery Strategies ============

/**
 * Recovery strategy for handling errors
 */
export interface RecoveryStrategy {
    name: string;
    canHandle: (error: Error) => boolean;
    recover: (error: Error, context: any) => Promise<RecoveryResult>;
}

export interface RecoveryResult {
    success: boolean;
    action?: any;  // Suggested recovery action
    message?: string;
}

/**
 * Element not found recovery - try scrolling to find element
 */
export const scrollToFindElementStrategy: RecoveryStrategy = {
    name: 'scrollToFindElement',
    canHandle: (error) => error instanceof ElementNotFoundError,
    recover: async (error, context) => {
        console.log('[Recovery] Attempting to scroll to find missing element');

        // Suggest scrolling action
        return {
            success: true,
            action: { scroll: { down: true, pages: 0.5 } },
            message: 'Scrolling to find the element',
        };
    },
};

/**
 * Page not loaded recovery - wait and refresh state
 */
export const waitForLoadStrategy: RecoveryStrategy = {
    name: 'waitForLoad',
    canHandle: (error) => {
        const msg = error.message.toLowerCase();
        return msg.includes('not loaded') || msg.includes('loading');
    },
    recover: async () => {
        console.log('[Recovery] Waiting for page to load');

        return {
            success: true,
            action: { wait: { seconds: 2 } },
            message: 'Waiting for page to fully load',
        };
    },
};

/**
 * Navigation failed recovery - go back and try alternative
 */
export const navigationFailedStrategy: RecoveryStrategy = {
    name: 'navigationFailed',
    canHandle: (error) => error instanceof NavigationError,
    recover: async () => {
        console.log('[Recovery] Navigation failed, going back');

        return {
            success: true,
            action: { goBack: {} },
            message: 'Navigating back to try an alternative approach',
        };
    },
};

/**
 * Rate limit recovery - wait with exponential backoff
 */
export const rateLimitStrategy: RecoveryStrategy = {
    name: 'rateLimit',
    canHandle: (error) => error instanceof RateLimitError,
    recover: async (error) => {
        const waitTime = (error as RateLimitError).retryAfter / 1000;
        console.log(`[Recovery] Rate limited, waiting ${waitTime}s`);

        return {
            success: true,
            action: { wait: { seconds: Math.min(waitTime, 30) } },
            message: `Rate limited, waiting ${waitTime} seconds`,
        };
    },
};

/**
 * Default recovery strategies
 */
export const DEFAULT_RECOVERY_STRATEGIES: RecoveryStrategy[] = [
    scrollToFindElementStrategy,
    waitForLoadStrategy,
    navigationFailedStrategy,
    rateLimitStrategy,
];

/**
 * Recovery Manager - Applies recovery strategies
 */
export class RecoveryManager {
    private strategies: RecoveryStrategy[];

    constructor(strategies: RecoveryStrategy[] = DEFAULT_RECOVERY_STRATEGIES) {
        this.strategies = strategies;
    }

    /**
     * Attempt to recover from an error
     */
    async attemptRecovery(error: Error, context: any = {}): Promise<RecoveryResult> {
        for (const strategy of this.strategies) {
            if (strategy.canHandle(error)) {
                console.log(`[RecoveryManager] Applying strategy: ${strategy.name}`);
                try {
                    return await strategy.recover(error, context);
                } catch (recoveryError) {
                    console.error(`[RecoveryManager] Strategy ${strategy.name} failed:`, recoveryError);
                }
            }
        }

        return {
            success: false,
            message: `No recovery strategy found for: ${error.message}`,
        };
    }

    /**
     * Add a custom recovery strategy
     */
    addStrategy(strategy: RecoveryStrategy): void {
        this.strategies.push(strategy);
    }
}

// ============ Utility Functions ============

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    errorHandler: (error: Error) => any
): T {
    return (async (...args: Parameters<T>) => {
        try {
            return await fn(...args);
        } catch (error) {
            return errorHandler(error as Error);
        }
    }) as T;
}

/**
 * Create an action retry handler with default config
 */
export function createRetryHandler(config?: Partial<RetryConfig>): ActionRetryHandler {
    return new ActionRetryHandler(config);
}

/**
 * Create a recovery manager with default strategies
 */
export function createRecoveryManager(
    additionalStrategies?: RecoveryStrategy[]
): RecoveryManager {
    const strategies = [...DEFAULT_RECOVERY_STRATEGIES, ...(additionalStrategies || [])];
    return new RecoveryManager(strategies);
}

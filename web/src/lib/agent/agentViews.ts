/**
 * Agent Views - Types for agent state, output, and history
 * Adapted from browser-use/browser_use/agent/views.py
 */

import { z } from 'zod';
import type { DOMSelectorMap, InteractiveElement, DOMInteractedElement, DOMRect } from './domViews';

// ============ Agent Settings (matching browser-use AgentSettings) ============

export interface AgentSettings {
    useVision: boolean | 'auto';
    visionDetailLevel: 'auto' | 'low' | 'high';
    maxFailures: number;
    maxActionsPerStep: number;
    useThinking: boolean;
    flashMode: boolean;
    maxSteps: number;
    stepTimeout: number;
    llmTimeout: number;
    finalResponseAfterFailure: boolean;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
    useVision: true,
    visionDetailLevel: 'auto',
    maxFailures: 3,
    maxActionsPerStep: 3,
    useThinking: true,
    flashMode: false,
    maxSteps: 100,
    stepTimeout: 180,
    llmTimeout: 60,
    finalResponseAfterFailure: true,
};

// ============ Agent State (matching browser-use AgentState) ============

export interface AgentState {
    agentId: string;
    nSteps: number;
    consecutiveFailures: number;
    lastResult: ActionResult[] | null;
    lastPlan: string | null;
    lastModelOutput: AgentOutput | null;

    // Pause/resume state
    paused: boolean;
    stopped: boolean;
    sessionInitialized: boolean;
}

export function createInitialAgentState(): AgentState {
    return {
        agentId: crypto.randomUUID(),
        nSteps: 1,
        consecutiveFailures: 0,
        lastResult: null,
        lastPlan: null,
        lastModelOutput: null,
        paused: false,
        stopped: false,
        sessionInitialized: false,
    };
}

// ============ Step Info (matching browser-use AgentStepInfo) ============

export interface AgentStepInfo {
    stepNumber: number;
    maxSteps: number;
}

export function isLastStep(stepInfo: AgentStepInfo): boolean {
    return stepInfo.stepNumber >= stepInfo.maxSteps - 1;
}

// ============ Action Result (matching browser-use ActionResult) ============

export interface JudgementResult {
    reasoning: string | null;
    verdict: boolean;
    failureReason: string | null;
    impossibleTask: boolean;
    reachedCaptcha: boolean;
}

export interface ActionResult {
    // For done action
    isDone: boolean | null;
    success: boolean | null;

    // For trace judgement
    judgement: JudgementResult | null;

    // Error handling
    error: string | null;

    // Files
    attachments: string[] | null;

    // Images (base64 encoded)
    images: Array<{ name: string; data: string }> | null;

    // Memory
    longTermMemory: string | null;
    extractedContent: string | null;
    includeExtractedContentOnlyOnce: boolean;

    // Metadata for observability
    metadata: Record<string, any> | null;
}

export function createActionResult(partial: Partial<ActionResult> = {}): ActionResult {
    return {
        isDone: partial.isDone ?? false,
        success: partial.success ?? null,
        judgement: partial.judgement ?? null,
        error: partial.error ?? null,
        attachments: partial.attachments ?? null,
        images: partial.images ?? null,
        longTermMemory: partial.longTermMemory ?? null,
        extractedContent: partial.extractedContent ?? null,
        includeExtractedContentOnlyOnce: partial.includeExtractedContentOnlyOnce ?? false,
        metadata: partial.metadata ?? null,
    };
}

// ============ Step Metadata (matching browser-use StepMetadata) ============

export interface StepMetadata {
    stepStartTime: number;
    stepEndTime: number;
    stepNumber: number;
    stepInterval: number | null;
}

export function getStepDuration(metadata: StepMetadata): number {
    return metadata.stepEndTime - metadata.stepStartTime;
}

// ============ Agent Brain (matching browser-use AgentBrain) ============

export interface AgentBrain {
    thinking: string | null;
    evaluationPreviousGoal: string;
    memory: string;
    nextGoal: string;
}

// ============ Action Schemas (matching browser-use tools/views.py) ============

// Using Zod for validation (TypeScript equivalent of Pydantic)

export const ClickActionSchema = z.object({
    click: z.object({
        index: z.number().int().min(1).describe('Element index from browser_state'),
        coordinateX: z.number().int().optional().describe('Horizontal coordinate relative to viewport'),
        coordinateY: z.number().int().optional().describe('Vertical coordinate relative to viewport'),
    }),
});

export const InputTextActionSchema = z.object({
    input: z.object({
        index: z.number().int().min(0).describe('Element index from browser_state'),
        text: z.string().describe('Text to input'),
        clear: z.boolean().default(true).describe('Clear existing content before typing'),
    }),
});

export const NavigateActionSchema = z.object({
    navigate: z.object({
        url: z.string().describe('URL to navigate to'),
        newTab: z.boolean().default(false).describe('Open in new tab'),
    }),
});

export const SearchActionSchema = z.object({
    search: z.object({
        query: z.string().describe('Search query'),
        engine: z.enum(['duckduckgo', 'google', 'bing']).default('duckduckgo'),
    }),
});

export const ScrollActionSchema = z.object({
    scroll: z.object({
        down: z.boolean().default(true).describe('True=scroll down, False=scroll up'),
        pages: z.number().default(1.0).describe('Pages to scroll (0.5=half, 1=full, 10=top/bottom)'),
        index: z.number().int().optional().describe('Element index to scroll within'),
    }),
});

export const SendKeysActionSchema = z.object({
    sendKeys: z.object({
        keys: z.string().describe('Keys (Escape, Enter, PageDown) or shortcuts (Control+o)'),
    }),
});

export const SwitchTabActionSchema = z.object({
    switchTab: z.object({
        tabId: z.string().min(4).max(4).describe('4-char tab id'),
    }),
});

export const CloseTabActionSchema = z.object({
    closeTab: z.object({
        tabId: z.string().min(4).max(4).describe('4-char tab id'),
    }),
});

export const ExtractActionSchema = z.object({
    extract: z.object({
        query: z.string().describe('What information to extract'),
        extractLinks: z.boolean().default(false).describe('Include links in extraction'),
    }),
});

export const SelectDropdownActionSchema = z.object({
    selectDropdown: z.object({
        index: z.number().int().min(1).describe('Dropdown element index'),
        text: z.string().describe('Option text/value to select'),
    }),
});

export const GetDropdownOptionsActionSchema = z.object({
    getDropdownOptions: z.object({
        index: z.number().int().min(1).describe('Dropdown element index'),
    }),
});

export const UploadFileActionSchema = z.object({
    uploadFile: z.object({
        index: z.number().int().min(1).describe('File input element index'),
        path: z.string().describe('Path to file to upload'),
    }),
});

export const ScreenshotActionSchema = z.object({
    screenshot: z.object({
        description: z.string().optional().describe('Optional description'),
    }),
});

export const WaitActionSchema = z.object({
    wait: z.object({
        seconds: z.number().default(3).describe('Seconds to wait'),
    }),
});

export const GoBackActionSchema = z.object({
    goBack: z.object({
        description: z.string().optional(),
    }),
});

export const DoneActionSchema = z.object({
    done: z.object({
        text: z.string().describe('Final message to user'),
        success: z.boolean().default(true).describe('Whether task completed successfully'),
        filesToDisplay: z.array(z.string()).default([]).describe('Files to show to user'),
    }),
});

// Combined action schema
export const ActionSchema = z.union([
    ClickActionSchema,
    InputTextActionSchema,
    NavigateActionSchema,
    SearchActionSchema,
    ScrollActionSchema,
    SendKeysActionSchema,
    SwitchTabActionSchema,
    CloseTabActionSchema,
    ExtractActionSchema,
    SelectDropdownActionSchema,
    GetDropdownOptionsActionSchema,
    UploadFileActionSchema,
    ScreenshotActionSchema,
    WaitActionSchema,
    GoBackActionSchema,
    DoneActionSchema,
]);

export type AgentAction = z.infer<typeof ActionSchema>;

// ============ Agent Output (matching browser-use AgentOutput) ============

export const AgentOutputSchema = z.object({
    thinking: z.string().nullable().optional().describe('Structured reasoning'),
    evaluationPreviousGoal: z.string().nullable().optional().describe('Assessment of last action'),
    memory: z.string().nullable().optional().describe('Key facts to remember'),
    nextGoal: z.string().nullable().optional().describe('Immediate next objective'),
    action: z.array(ActionSchema).min(1).describe('Actions to execute'),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// ============ Browser State (for observation) ============

export interface ViewportInfo {
    width: number;
    height: number;
    devicePixelRatio: number;
    scrollX: number;
    scrollY: number;
    scrollHeight: number;
    scrollWidth: number;
}

export interface TabInfo {
    id: string;  // 4-char id
    title: string;
    url: string;
    active: boolean;
}

export interface BrowserState {
    url: string;
    title: string;
    timestamp: number;

    // Interactive elements (for browser_state in prompt)
    interactiveElements: InteractiveElement[];

    // Selector map for action execution
    selectorMap: DOMSelectorMap;

    // Viewport info
    viewport: ViewportInfo;

    // Open tabs
    tabs: TabInfo[];

    // Page metadata
    metadata: {
        formCount: number;
        iframeCount: number;
        hasScrollableContent: boolean;
        isLoading: boolean;
    };

    // Optional screenshot (base64)
    screenshot?: string;
    screenshotPath?: string;
}

// ============ Browser State History (for replay) ============

export interface BrowserStateHistory {
    url: string;
    title: string;
    tabs: TabInfo[];
    interactedElement: DOMInteractedElement[] | null;
    screenshot?: string;
    screenshotPath?: string;
}

// ============ Agent History (matching browser-use AgentHistory) ============

export interface AgentHistory {
    modelOutput: AgentOutput | null;
    result: ActionResult[];
    state: BrowserStateHistory;
    metadata: StepMetadata | null;
    stateMessage: string | null;
}

export interface AgentHistoryList {
    history: AgentHistory[];

    // Computed properties as functions
    totalDurationSeconds(): number;
    errors(): (string | null)[];
    finalResult(): string | null;
    isDone(): boolean;
    isSuccessful(): boolean | null;
    urls(): (string | null)[];
    actionNames(): string[];
    numberOfSteps(): number;
}

export function createAgentHistoryList(history: AgentHistory[] = []): AgentHistoryList {
    return {
        history,

        totalDurationSeconds() {
            return history.reduce((total, h) => {
                if (h.metadata) {
                    return total + getStepDuration(h.metadata);
                }
                return total;
            }, 0);
        },

        errors() {
            return history.map(h => {
                const stepErrors = h.result.filter(r => r.error).map(r => r.error!);
                return stepErrors.length > 0 ? stepErrors[0] : null;
            });
        },

        finalResult() {
            if (history.length > 0) {
                const lastResult = history[history.length - 1].result;
                if (lastResult.length > 0 && lastResult[lastResult.length - 1].extractedContent) {
                    return lastResult[lastResult.length - 1].extractedContent;
                }
            }
            return null;
        },

        isDone() {
            if (history.length > 0) {
                const lastResults = history[history.length - 1].result;
                if (lastResults.length > 0) {
                    return lastResults[lastResults.length - 1].isDone === true;
                }
            }
            return false;
        },

        isSuccessful() {
            if (history.length > 0) {
                const lastResults = history[history.length - 1].result;
                if (lastResults.length > 0) {
                    const lastResult = lastResults[lastResults.length - 1];
                    if (lastResult.isDone === true) {
                        return lastResult.success;
                    }
                }
            }
            return null;
        },

        urls() {
            return history.map(h => h.state.url || null);
        },

        actionNames() {
            const names: string[] = [];
            for (const h of history) {
                if (h.modelOutput) {
                    for (const action of h.modelOutput.action) {
                        const actionKey = Object.keys(action)[0];
                        if (actionKey) names.push(actionKey);
                    }
                }
            }
            return names;
        },

        numberOfSteps() {
            return history.length;
        },
    };
}

// ============ Agent Error (matching browser-use AgentError) ============

export const AgentError = {
    VALIDATION_ERROR: 'Invalid model output format. Please follow the correct schema.',
    RATE_LIMIT_ERROR: 'Rate limit reached. Waiting before retry.',
    NO_VALID_ACTION: 'No valid action found',

    formatError(error: Error, includeTrace: boolean = false): string {
        const message = error.message;

        // Check for validation errors
        if (error.name === 'ZodError') {
            return `${AgentError.VALIDATION_ERROR}\nDetails: ${message}`;
        }

        // Check for rate limit
        if (message.includes('rate limit') || message.includes('429')) {
            return AgentError.RATE_LIMIT_ERROR;
        }

        if (includeTrace && error.stack) {
            return `${message}\nStacktrace:\n${error.stack}`;
        }

        return message;
    },
};

// ============ Utility Functions ============

/**
 * Parse and validate agent output from LLM response
 */
export function parseAgentOutput(raw: unknown): AgentOutput | null {
    try {
        return AgentOutputSchema.parse(raw);
    } catch (error) {
        console.error('[Agent] Failed to parse agent output:', error);
        return null;
    }
}

/**
 * Get action name from action object
 */
export function getActionName(action: AgentAction): string {
    return Object.keys(action)[0];
}

/**
 * Get index from action if it has one
 */
export function getActionIndex(action: AgentAction): number | null {
    const actionName = getActionName(action);
    const actionData = (action as any)[actionName];

    if (typeof actionData === 'object' && 'index' in actionData) {
        return actionData.index;
    }

    return null;
}

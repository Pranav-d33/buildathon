/**
 * Agent Module - Browser-use compatible agent architecture
 * 
 * This module provides the core agent functionality for browser automation,
 * adapted from the browser-use Python library to TypeScript.
 */

// ============ DOM Views ============
export {
    // Types
    type DOMRect,
    type AXNode,
    type AXProperty,
    type SnapshotNode,
    type EnhancedDOMTreeNode,
    type SimplifiedNode,
    type DOMSelectorMap,
    type SerializedDOMState,
    type InteractiveElement,
    type DOMInteractedElement,

    // Enums & Constants
    NodeType,
    DEFAULT_INCLUDE_ATTRIBUTES,

    // Functions
    inferAriaRole,
    getAccessibleName,
    capTextLength,
    generateXPath,
} from './domViews';

// ============ Agent Views ============
export {
    // Types
    type AgentSettings,
    type AgentState,
    type AgentStepInfo,
    type JudgementResult,
    type ActionResult,
    type StepMetadata,
    type AgentBrain,
    type AgentAction,
    type AgentOutput,
    type ViewportInfo,
    type TabInfo,
    type BrowserState,
    type BrowserStateHistory,
    type AgentHistory,
    type AgentHistoryList,

    // Schemas (Zod)
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
    ActionSchema,
    AgentOutputSchema,

    // Constants
    DEFAULT_AGENT_SETTINGS,
    AgentError,

    // Functions
    createInitialAgentState,
    isLastStep,
    createActionResult,
    getStepDuration,
    createAgentHistoryList,
    parseAgentOutput,
    getActionName,
    getActionIndex,
} from './agentViews';

// ============ DOM Serializer ============
export {
    // Types
    type RawElementData,

    // Functions
    serializeBrowserStateForLLM,
    formatElementForLLM,
    buildInteractiveElements,
    createBrowserState,
    generateTabId,
    formatHistoryForLLM,
} from './domSerializer';

// ============ System Prompts ============
export {
    getAgentSystemPrompt,
    getActionSchemaDescription,
    buildAgentPrompt,
} from './systemPrompt';

// ============ Agent Service ============
export {
    // Types
    type AgentConfig,
    type AgentStepResult,
    type AgentRunResult,

    // Class
    Agent,

    // Functions
    runAgent,
} from './agentService';

// ============ Action Executor ============
export {
    // Types
    type ActionContext,
    type ExtensionAction,
    type ExtensionResponse,

    // Class
    ActionExecutor,

    // Functions
    createActionExecutor,
} from './actionExecutor';

// ============ Error Handler ============
export {
    // Error Classes
    AgentError as AgentErrorClass,
    ElementNotFoundError,
    ActionTimeoutError,
    NavigationError,
    LLMResponseError,
    RateLimitError,
    CaptchaError,
    ExtensionError,

    // Types
    type RetryConfig,
    type RecoveryStrategy,
    type RecoveryResult,

    // Classes
    ActionRetryHandler,
    RecoveryManager,

    // Constants
    DEFAULT_RETRY_CONFIG,
    DEFAULT_RECOVERY_STRATEGIES,

    // Functions
    withErrorHandling,
    createRetryHandler,
    createRecoveryManager,
} from './errorHandler';

// ============ Memory ============
export {
    // Types
    type MemoryEntry,
    type ActionSummary,
    type WorkingMemory,
    type MemoryConfig,

    // Class
    AgentMemory,

    // Constants
    DEFAULT_MEMORY_CONFIG,

    // Functions
    createAgentMemory,
    serializeMemory,
} from './memory';

// ============ Vision Integration ============
export {
    // Types
    type VisionObservation,
    type VisionAnalysis,
    type VisionElement,
    type VisionActionHint,
    type CaptchaInfo,

    // Functions
    observeWithVision,
    resolveActionWithVision,
    handleCaptchaForAgent,
    analyzeFieldForAgent,
    enhanceBrowserStateWithVision,
} from './agentVision';

// ============ Accessibility Tree (Full AX Tree Module) ============
export {
    // Types (aliased to avoid conflicts with domViews)
    type AXNode as FullAXNode,
    type AXProperty as FullAXProperty,
    type AXTree,
    type AXTreeOptions,
    type SimplifiedAXNode,

    // Functions (aliased to avoid conflicts with domViews)
    getAccessibleRole,
    getAccessibleName as getFullAccessibleName,
    getAccessibleDescription,
    getAccessibleValue,
    extractAXProperties,
    isIgnored as isAXIgnored,
    buildAXTree,
    buildSimplifiedAXTree,
    serializeAXTree,
    formatAXTreeForLLM,
} from './axTree';


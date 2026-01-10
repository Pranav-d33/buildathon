/**
 * Autonomous Browser Agent Execution Loop
 * Implements strict action set with HITL (Human-in-the-Loop) controls
 * 
 * Output format: Thought (free-text reasoning) + Action (JSON)
 */

import { callLLM, MODELS } from '@/lib/llm';
import type {
    BrowserState,
    AgentHistory,
    AgentAction,
    ActionResult,
    BrowserStateHistory,
} from './agentViews';
import type { WorkingMemory } from './memory';
import type { EnhancedDOMTreeNode } from './domViews';
import { verifyAction, generateReflection, shouldReflect } from './verifyReflect';

// ============ Input/Output Schemas ============

/**
 * Page state enumeration
 */
export type PageState = 'loading' | 'idle' | 'modal_open' | 'captcha' | 'error';

/**
 * Simple history entry for the loop (compatible with internal usage)
 */
export interface LoopHistoryEntry {
    stepNumber: number;
    thought: string;
    action: AgentLoopAction;
    success: boolean;
    url?: string;
    error?: string;
}

/**
 * Input context for each agent loop iteration
 */
export interface AgentLoopInput {
    goal: string | null;
    observation: BrowserState;
    memory: WorkingMemory | null;
    history: LoopHistoryEntry[];
    page_state: PageState;
}

/**
 * Strict action set (10 actions as specified)
 */
export type AgentLoopAction =
    | { type: 'navigate'; url: string }
    | { type: 'click_link'; target: string }           // linkText or selector
    | { type: 'click_button'; target: string }         // label or selector
    | { type: 'fill_input'; fieldName: string; value: string }
    | { type: 'select_option'; fieldName: string; optionText: string }
    | { type: 'upload_file'; fieldName: string }       // HITL triggered
    | { type: 'scroll'; target: 'up' | 'down' | string }
    | { type: 'wait'; condition: string }
    | { type: 'go_back' }
    | { type: 'ask_human'; question: string };         // HITL trigger

/**
 * HITL request types
 */
export interface HITLRequest {
    type: 'confirmation' | 'otp' | 'captcha' | 'credentials' | 'ambiguity';
    reason: string;
    options?: string[];  // For ambiguity resolution
}

/**
 * Output from each loop iteration
 */
export interface AgentLoopOutput {
    thought: string;
    action: AgentLoopAction;
    hitl_required?: HITLRequest;
    success?: boolean;
    error?: string;
}

/**
 * Special output when no goal is provided
 */
export const WAITING_FOR_GOAL = 'WAITING_FOR_GOAL' as const;

/**
 * Loop state tracking
 */
export interface LoopState {
    stepNumber: number;
    totalSteps: number;
    isRunning: boolean;
    isPaused: boolean;
    lastAction?: AgentLoopAction;
    lastResult?: ActionResult;
    reflectionCount: number;
    errorCount: number;
}

/**
 * Configuration for the autonomous loop
 */
export interface AutonomousLoopConfig {
    goal: string;
    maxSteps?: number;
    maxReflections?: number;
    onStep?: (output: AgentLoopOutput, state: LoopState) => void | Promise<void>;
    onHITL?: (request: HITLRequest) => Promise<{ proceed: boolean; data?: unknown }>;
    getBrowserState: () => Promise<BrowserState>;
    executeAction: (action: AgentAction) => Promise<ActionResult>;
    getMemory?: () => WorkingMemory | null;
}

// ============ System Prompt (Phase 11 - Prompt Surgery Applied) ============

const AUTONOMOUS_LOOP_SYSTEM_PROMPT = `You are an autonomous browser agent. You observe the page, reason about goals, and emit actions.

## STRICT OUTPUT FORMAT
You MUST output in this exact format:

Thought: [your structured reasoning - analyze current state, evaluate confidence, plan next step]
Confidence: [HIGH/MEDIUM/LOW]
Action: {"type": "...", ...params}

NO OTHER FORMAT IS ALLOWED. Every response must have exactly one Thought, one Confidence level, and one Action.

## CONFIDENCE LEVELS
- HIGH (80%+ certain): Element is clearly visible, action is straightforward
- MEDIUM (50-80%): Element likely exists but may have alternatives  
- LOW (<50%): Uncertain about element or best approach

CRITICAL: For LOW confidence, prefer ask_human. For MEDIUM, proceed but note uncertainty.

## AVAILABLE ACTIONS (STRICT SET - 10 ACTIONS ONLY)

1. navigate(url) - Go to a URL
   Action: {"type": "navigate", "url": "https://example.com"}

2. click_link(target) - Click link by EXACT visible text
   Action: {"type": "click_link", "target": "Submit Application"}

3. click_button(target) - Click button by EXACT visible label
   Action: {"type": "click_button", "target": "Next"}

4. fill_input(fieldName, value) - Fill text input
   Action: {"type": "fill_input", "fieldName": "email", "value": "user@example.com"}

5. select_option(fieldName, optionText) - Select dropdown option
   Action: {"type": "select_option", "fieldName": "state", "optionText": "Karnataka"}

6. upload_file(fieldName) - Request file upload (triggers human input)
   Action: {"type": "upload_file", "fieldName": "document"}

7. scroll(target) - Scroll the page to discover more elements
   Action: {"type": "scroll", "target": "down"}

8. wait(condition) - Wait for page/condition
   Action: {"type": "wait", "condition": "page_load"}

9. go_back() - Navigate back in history
   Action: {"type": "go_back"}

10. ask_human(question) - Ask human for input/clarification/confirmation
    Action: {"type": "ask_human", "question": "What is your registration number?"}

## ANTI-HALLUCINATION RULES (CRITICAL - NEVER VIOLATE)

1. NEVER guess or fabricate URLs
   - Only use URLs that are EXPLICITLY visible in the page observation as link href values
   - If you need a URL not visible, use scroll or ask_human
   
2. NEVER invent CSS selectors or element identifiers
   - Only use element text/labels that appear in the [index] list from observation
   - Match elements by their EXACT visible text
   
3. NEVER assume form field names
   - Use ONLY field names/labels visible in the observation
   - If field label is unclear, scroll or ask_human
   
4. NEVER fabricate user information
   - If you need user data (name, email, phone), use ask_human
   - Do not fill forms with placeholder data

5. If element is not found:
   - First: scroll to discover more elements
   - Second: wait briefly for dynamic loading
   - Third: ask_human for guidance

## REFUSAL CONDITIONS (MUST REFUSE WITHOUT HITL)

ALWAYS use ask_human for confirmation before:
- Payment or financial transactions
- Submitting applications or forms with legal implications
- Deleting or removing data
- Account actions (login with new credentials, password changes)
- Actions on pages that appear suspicious or phishing-like
- Any action where mistake would be irreversible

## PAGE STATE HANDLING

- loading: Use wait action, do NOT attempt interactions
- idle: Proceed with action based on goal
- modal_open: Address modal first (interact or close) before other actions
- captcha: MUST use ask_human - do not attempt to bypass
- error: Analyze error message, attempt recovery OR ask_human

## REASONING CHECKLIST (Follow in Thought)

1. What is my current sub-goal?
2. What elements do I see that could help?
3. Have I verified the element exists in observation?
4. What is my confidence level and why?
5. Is this a sensitive action requiring HITL?
6. What could go wrong and how would I recover?
`;

// ============ Helper: Get accessible info from EnhancedDOMTreeNode ============

function getNodeText(node: EnhancedDOMTreeNode): string {
    // Priority: AX name > nodeValue > empty
    if (node.axNode?.name) return node.axNode.name;
    if (node.nodeValue) return node.nodeValue.trim();
    return '';
}

function getNodeRole(node: EnhancedDOMTreeNode): string {
    if (node.axNode?.role) return node.axNode.role;
    // Infer from nodeName
    const tag = node.nodeName.toLowerCase();
    const roleMap: Record<string, string> = {
        'a': 'link',
        'button': 'button',
        'input': 'textbox',
        'select': 'combobox',
        'textarea': 'textbox',
    };
    return roleMap[tag] || 'generic';
}

function isInputNode(node: EnhancedDOMTreeNode): boolean {
    const tag = node.nodeName.toUpperCase();
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
}

function isLinkNode(node: EnhancedDOMTreeNode): boolean {
    return node.nodeName.toUpperCase() === 'A';
}

function isButtonNode(node: EnhancedDOMTreeNode): boolean {
    if (node.nodeName.toUpperCase() === 'BUTTON') return true;
    if (node.axNode?.role === 'button') return true;
    if (node.attributes?.role === 'button') return true;
    return false;
}

// ============ Prompt Builder ============

/**
 * Build the prompt context for LLM
 */
export function buildLoopPrompt(input: AgentLoopInput): Array<{ role: 'system' | 'user'; content: string }> {
    if (!input.goal) {
        return [];
    }

    // Build observation summary
    const observationSummary = buildObservationSummary(input.observation);

    // Build history summary (last 3 steps)
    const historySummary = buildHistorySummary(input.history.slice(-3));

    // Build memory context
    const memoryContext = buildMemoryContext(input.memory);

    const userPrompt = `
## CURRENT GOAL
${input.goal}

## PAGE STATE
${input.page_state}

## CURRENT URL
${input.observation.url || 'unknown'}

## PAGE OBSERVATION
${observationSummary}

## RECENT HISTORY
${historySummary || 'No previous actions'}

## MEMORY
${memoryContext || 'No relevant memories'}

Now analyze the page and provide your Thought and Action.
`;

    return [
        { role: 'system', content: AUTONOMOUS_LOOP_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
    ];
}

export function buildObservationSummary(state: BrowserState): string {
    const parts: string[] = [];

    // Title
    if (state.title) {
        parts.push(`Page Title: ${state.title}`);
    }

    // Interactive elements from selectorMap
    if (state.selectorMap) {
        const elements = Object.entries(state.selectorMap);
        const links: [string, EnhancedDOMTreeNode][] = [];
        const buttons: [string, EnhancedDOMTreeNode][] = [];
        const inputs: [string, EnhancedDOMTreeNode][] = [];

        for (const [indexStr, element] of elements) {
            if (isLinkNode(element)) {
                links.push([indexStr, element]);
            } else if (isButtonNode(element)) {
                buttons.push([indexStr, element]);
            } else if (isInputNode(element)) {
                inputs.push([indexStr, element]);
            }
        }

        if (links.length > 0) {
            parts.push(`\nLinks (${links.length}):`);
            links.slice(0, 10).forEach(([idx, link]) => {
                const text = getNodeText(link) || '[no text]';
                parts.push(`  [${idx}] ${text.substring(0, 50)}`);
            });
            if (links.length > 10) parts.push(`  ... and ${links.length - 10} more`);
        }

        if (buttons.length > 0) {
            parts.push(`\nButtons (${buttons.length}):`);
            buttons.slice(0, 10).forEach(([idx, btn]) => {
                const text = getNodeText(btn) || '[no text]';
                parts.push(`  [${idx}] ${text.substring(0, 50)}`);
            });
            if (buttons.length > 10) parts.push(`  ... and ${buttons.length - 10} more`);
        }

        if (inputs.length > 0) {
            parts.push(`\nInput Fields (${inputs.length}):`);
            inputs.slice(0, 15).forEach(([idx, input]) => {
                const label = getNodeText(input) || input.attributes?.placeholder || input.attributes?.name || '[unlabeled]';
                const type = input.attributes?.type || input.nodeName.toLowerCase();
                parts.push(`  [${idx}] ${type}: "${label}"`);
            });
            if (inputs.length > 15) parts.push(`  ... and ${inputs.length - 15} more`);
        }
    }

    // Fallback if no selector map
    if (parts.length <= 1) {
        parts.push('(Limited page observation available)');
    }

    return parts.join('\n');
}

export function buildHistorySummary(history: LoopHistoryEntry[]): string {
    if (!history.length) return '';

    return history.map((h) => {
        const actionSummary = JSON.stringify(h.action).substring(0, 80);
        const result = h.success ? '✓' : '✗';
        return `Step ${h.stepNumber}: ${result} ${actionSummary}`;
    }).join('\n');
}

export function buildMemoryContext(memory: WorkingMemory | null): string {
    if (!memory) return '';

    const parts: string[] = [];

    if (memory.completedSubtasks?.length) {
        parts.push('Completed:');
        memory.completedSubtasks.slice(-5).forEach(s => {
            parts.push(`  - ${s}`);
        });
    }

    if (memory.facts?.length) {
        parts.push('Key facts:');
        memory.facts.slice(-3).forEach(f => {
            parts.push(`  - ${f}`);
        });
    }

    if (memory.failedApproaches?.length) {
        parts.push('Avoid (failed):');
        memory.failedApproaches.slice(-3).forEach(f => {
            parts.push(`  - ${f}`);
        });
    }

    return parts.join('\n');
}

// ============ Response Parser ============

/**
 * Confidence levels for action decisions
 */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Parse LLM response into Thought + Confidence + Action
 */
export function parseThoughtAction(response: string): {
    thought: string;
    confidence: ConfidenceLevel;
    action: AgentLoopAction
} | null {
    // Extract Thought (everything between "Thought:" and "Confidence:" or "Action:")
    const thoughtMatch = response.match(/Thought:\s*([\s\S]*?)(?=Confidence:|Action:|$)/i);
    const thought = thoughtMatch ? thoughtMatch[1].trim() : '';

    // Extract Confidence level
    const confidenceMatch = response.match(/Confidence:\s*(HIGH|MEDIUM|LOW)/i);
    const confidence: ConfidenceLevel = confidenceMatch
        ? (confidenceMatch[1].toUpperCase() as ConfidenceLevel)
        : 'MEDIUM'; // Default to MEDIUM if not specified

    // Extract Action JSON
    const actionMatch = response.match(/Action:\s*(\{[\s\S]*?\})(?:\s*$|\s*\n)/i);
    if (!actionMatch) {
        // Try to find any JSON object
        const jsonMatch = response.match(/\{[\s\S]*?"type"[\s\S]*?\}/);
        if (!jsonMatch) return null;

        try {
            const action = JSON.parse(jsonMatch[0]);
            if (!validateAction(action)) return null;
            return { thought: thought || 'No explicit reasoning provided', confidence, action };
        } catch {
            return null;
        }
    }

    try {
        const action = JSON.parse(actionMatch[1]);
        if (!validateAction(action)) return null;
        return { thought, confidence, action };
    } catch {
        return null;
    }
}

/**
 * Validate action matches strict action set
 */
function validateAction(action: unknown): action is AgentLoopAction {
    if (!action || typeof action !== 'object' || !('type' in action)) return false;
    const a = action as Record<string, unknown>;

    const validTypes = [
        'navigate', 'click_link', 'click_button', 'fill_input',
        'select_option', 'upload_file', 'scroll', 'wait', 'go_back', 'ask_human'
    ];

    if (typeof a.type !== 'string' || !validTypes.includes(a.type)) return false;

    // Validate required fields per action type
    switch (a.type) {
        case 'navigate':
            return typeof a.url === 'string';
        case 'click_link':
        case 'click_button':
            return typeof a.target === 'string';
        case 'fill_input':
            return typeof a.fieldName === 'string' && typeof a.value === 'string';
        case 'select_option':
            return typeof a.fieldName === 'string' && typeof a.optionText === 'string';
        case 'upload_file':
            return typeof a.fieldName === 'string';
        case 'scroll':
            return typeof a.target === 'string';
        case 'wait':
            return typeof a.condition === 'string';
        case 'go_back':
            return true;
        case 'ask_human':
            return typeof a.question === 'string';
        default:
            return false;
    }
}

// ============ HITL Control ============

/**
 * Check if action requires HITL confirmation
 */
export function shouldRequireHITL(action: AgentLoopAction, pageState: PageState): HITLRequest | null {
    // Direct HITL actions
    if (action.type === 'ask_human') {
        return {
            type: 'ambiguity',
            reason: action.question
        };
    }

    if (action.type === 'upload_file') {
        return {
            type: 'confirmation',
            reason: `File upload requested for field: ${action.fieldName}`
        };
    }

    // CAPTCHA page state
    if (pageState === 'captcha') {
        return {
            type: 'captcha',
            reason: 'CAPTCHA detected on page. Please complete verification manually.'
        };
    }

    // Sensitive button clicks
    if (action.type === 'click_button') {
        const sensitivePatterns = [
            /submit/i, /login/i, /sign\s*in/i, /pay/i, /confirm/i,
            /delete/i, /remove/i, /cancel/i, /subscribe/i
        ];

        if (sensitivePatterns.some(p => p.test(action.target))) {
            return {
                type: 'confirmation',
                reason: `Sensitive action detected: clicking "${action.target}". Please confirm.`
            };
        }
    }

    return null;
}

// ============ Action Translator ============

/**
 * Translate loop action to internal AgentAction
 */
export function translateToAgentAction(action: AgentLoopAction, observation: BrowserState): AgentAction | null {
    switch (action.type) {
        case 'navigate':
            return { navigate: { url: action.url, newTab: false } };

        case 'click_link':
        case 'click_button': {
            // Find element index from selector map
            const index = findElementIndex(action.target, observation);
            if (index !== null) {
                return { click: { index } };
            }
            return null;
        }

        case 'fill_input': {
            const index = findInputIndex(action.fieldName, observation);
            if (index !== null) {
                return { input: { index, text: action.value, clear: true } };
            }
            return null;
        }

        case 'select_option': {
            const index = findInputIndex(action.fieldName, observation);
            if (index !== null) {
                return { selectDropdown: { index, text: action.optionText } };
            }
            return null;
        }

        case 'scroll':
            return { scroll: { down: action.target !== 'up', pages: 1 } };

        case 'wait':
            return { wait: { seconds: 2 } };

        case 'go_back':
            return { goBack: {} };

        case 'upload_file':
            // Requires HITL - handle separately
            return null;

        case 'ask_human':
            // HITL action - handle separately
            return null;

        default:
            return null;
    }
}

function findElementIndex(target: string, observation: BrowserState): number | null {
    if (!observation.selectorMap) return null;

    const targetLower = target.toLowerCase();

    for (const [indexStr, element] of Object.entries(observation.selectorMap)) {
        const text = getNodeText(element).toLowerCase();
        if (text.includes(targetLower) || targetLower.includes(text)) {
            return parseInt(indexStr, 10);
        }
    }

    return null;
}

function findInputIndex(fieldName: string, observation: BrowserState): number | null {
    if (!observation.selectorMap) return null;

    const fieldLower = fieldName.toLowerCase();

    for (const [indexStr, element] of Object.entries(observation.selectorMap)) {
        if (!isInputNode(element)) continue;

        const name = (element.attributes?.name || '').toLowerCase();
        const label = getNodeText(element).toLowerCase();
        const placeholder = (element.attributes?.placeholder || '').toLowerCase();

        if (name.includes(fieldLower) || label.includes(fieldLower) || placeholder.includes(fieldLower)) {
            return parseInt(indexStr, 10);
        }
    }

    return null;
}

// ============ Page State Detection ============

/**
 * Detect page state from observation
 */
export function detectPageState(state: BrowserState): PageState {
    if (!state.selectorMap) return 'idle';

    // Check for CAPTCHA indicators
    const hasCaptcha = Object.values(state.selectorMap).some(el => {
        const text = getNodeText(el).toLowerCase();
        return text.includes('captcha') || text.includes('verify');
    });
    if (hasCaptcha) return 'captcha';

    // Check for modal
    const hasModal = Object.values(state.selectorMap).some(el => {
        const role = getNodeRole(el);
        return role === 'dialog' || el.attributes?.['aria-modal'] === 'true';
    });
    if (hasModal) return 'modal_open';

    // Check for error indicators
    const hasError = Object.values(state.selectorMap).some(el => {
        const text = getNodeText(el).toLowerCase();
        return text.includes('error') || text.includes('failed');
    });
    if (hasError) return 'error';

    // Check loading
    if (state.metadata?.isLoading) return 'loading';

    // Default to idle
    return 'idle';
}

// ============ Execution Loop ============

/**
 * Run the autonomous agent loop
 * Returns an async generator that yields AgentLoopOutput for each step
 */
export async function* runAutonomousLoop(
    config: AutonomousLoopConfig
): AsyncGenerator<AgentLoopOutput | typeof WAITING_FOR_GOAL> {
    // Check for goal
    if (!config.goal) {
        yield WAITING_FOR_GOAL;
        return;
    }

    const maxSteps = config.maxSteps ?? 50;
    const maxReflections = config.maxReflections ?? 3;

    const loopState: LoopState = {
        stepNumber: 0,
        totalSteps: maxSteps,
        isRunning: true,
        isPaused: false,
        reflectionCount: 0,
        errorCount: 0
    };

    const history: LoopHistoryEntry[] = [];
    let beforeState: BrowserState | null = null;

    while (loopState.isRunning && loopState.stepNumber < maxSteps) {
        loopState.stepNumber++;

        try {
            // 1. OBSERVE
            const observation = await config.getBrowserState();
            const pageState = detectPageState(observation);
            const memory = config.getMemory?.() ?? null;

            // Store before state for verification
            beforeState = observation;

            // 2. BUILD PROMPT
            const input: AgentLoopInput = {
                goal: config.goal,
                observation,
                memory,
                history,
                page_state: pageState
            };

            const messages = buildLoopPrompt(input);
            if (!messages.length) {
                yield WAITING_FOR_GOAL;
                return;
            }

            // 3. CALL LLM
            const response = await callLLM(messages, MODELS.CONVERSATION);

            // 4. PARSE THOUGHT + ACTION
            const parsed = parseThoughtAction(response);
            if (!parsed) {
                const errorOutput: AgentLoopOutput = {
                    thought: 'Failed to parse LLM response',
                    action: { type: 'wait', condition: 'retry' },
                    success: false,
                    error: 'Invalid LLM response format'
                };
                yield errorOutput;
                loopState.errorCount++;

                if (loopState.errorCount > 3) {
                    loopState.isRunning = false;
                }
                continue;
            }

            const { thought, action } = parsed;

            // 5. CHECK HITL
            const hitlRequest = shouldRequireHITL(action, pageState);
            if (hitlRequest) {
                const output: AgentLoopOutput = {
                    thought,
                    action,
                    hitl_required: hitlRequest
                };
                yield output;

                // Wait for HITL callback
                if (config.onHITL) {
                    const hitlResult = await config.onHITL(hitlRequest);
                    if (!hitlResult.proceed) {
                        loopState.isPaused = true;
                        continue;
                    }
                    // Resume with any data provided
                } else {
                    // No HITL handler - pause
                    loopState.isPaused = true;
                    continue;
                }
            }

            // 6. TRANSLATE ACTION
            const agentAction = translateToAgentAction(action, observation);
            if (!agentAction) {
                const errorOutput: AgentLoopOutput = {
                    thought,
                    action,
                    success: false,
                    error: 'Could not translate action to executable command'
                };
                yield errorOutput;
                continue;
            }

            // 7. EXECUTE
            const result = await config.executeAction(agentAction);
            loopState.lastAction = action;
            loopState.lastResult = result;

            // 8. VERIFY
            const afterState = await config.getBrowserState();
            const verification = await verifyAction(
                agentAction,
                result,
                beforeState!,
                afterState
            );

            if (!verification.success && shouldReflect(loopState.reflectionCount, maxReflections)) {
                // Generate corrective action
                await generateReflection(
                    agentAction,
                    verification,
                    afterState
                );
                loopState.reflectionCount++;

                // TODO: Execute corrective action in next iteration
            }

            // 9. UPDATE HISTORY
            history.push({
                stepNumber: loopState.stepNumber,
                thought,
                action,
                success: result.success ?? false,
                url: observation.url,
                error: result.error ?? undefined,
            });

            // 10. YIELD OUTPUT
            const output: AgentLoopOutput = {
                thought,
                action,
                success: result.success ?? undefined
            };

            if (config.onStep) {
                await config.onStep(output, loopState);
            }

            yield output;

            // Check for done
            if (action.type === 'ask_human' && action.question.toLowerCase().includes('done')) {
                loopState.isRunning = false;
            }

        } catch (error) {
            loopState.errorCount++;
            const errorOutput: AgentLoopOutput = {
                thought: 'Error during execution',
                action: { type: 'wait', condition: 'error_recovery' },
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
            yield errorOutput;

            if (loopState.errorCount > 5) {
                loopState.isRunning = false;
            }
        }
    }
}

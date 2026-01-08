/**
 * Verification + Reflection Layer
 * LLM-based action verification and corrective action generation
 * Inspired by BacktrackAgent and WebOperator recovery patterns
 */

import { callLLM, MODELS } from '@/lib/llm';
import type { AgentAction, ActionResult, BrowserState } from './agentViews';
import { getActionName, getActionIndex } from './agentViews';

// ============ Types ============

export interface VerificationResult {
    success: boolean;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
    evidence?: string;
}

export interface CorrectiveAction {
    action: 'scroll' | 'retry' | 'click_alternative' | 'go_back' | 'wait' | 'skip';
    target?: string;
    targetIndex?: number;
    reason: string;
    shouldRetryOriginal: boolean;
}

export interface ReflectionResult {
    analysis: string;
    correctiveAction: CorrectiveAction;
    alternativeApproaches: string[];
}

// ============ Verification ============

/**
 * Verify if an action succeeded by analyzing the current DOM/screenshot state
 * This is the core of the BacktrackAgent-style verification
 */
export async function verifyAction(
    action: AgentAction,
    result: ActionResult,
    beforeState: BrowserState,
    afterState: BrowserState,
    screenshot?: string
): Promise<VerificationResult> {
    const actionName = getActionName(action);
    const actionIndex = getActionIndex(action);

    // Quick checks for obvious success/failure
    if (result.error) {
        return {
            success: false,
            confidence: 'high',
            reason: `Action failed with error: ${result.error}`,
        };
    }

    if (result.isDone) {
        return {
            success: true,
            confidence: 'high',
            reason: 'Action marked task as complete',
        };
    }

    // For navigation, check URL change
    if (actionName === 'navigate') {
        const urlChanged = beforeState.url !== afterState.url;
        return {
            success: urlChanged,
            confidence: urlChanged ? 'high' : 'medium',
            reason: urlChanged
                ? `Navigation successful: ${afterState.url}`
                : 'URL did not change after navigation attempt',
        };
    }

    // For clicks, check for page/DOM changes
    if (actionName === 'click') {
        const domChanged = beforeState.interactiveElements.length !== afterState.interactiveElements.length;
        const urlChanged = beforeState.url !== afterState.url;

        if (urlChanged || domChanged) {
            return {
                success: true,
                confidence: 'medium',
                reason: urlChanged
                    ? 'Click caused page navigation'
                    : 'Click caused DOM changes',
            };
        }
    }

    // For input, verify the field received the value
    if (actionName === 'input' && actionIndex !== null) {
        // Check if we can verify the input was received
        // This is a heuristic - real verification would need field value checking
        return {
            success: true,
            confidence: 'low',
            reason: 'Input action executed (value verification not available)',
        };
    }

    // For complex cases, use LLM verification
    return await verifyWithLLM(action, result, afterState, screenshot);
}

/**
 * Use LLM to verify action success when heuristics are insufficient
 */
async function verifyWithLLM(
    action: AgentAction,
    result: ActionResult,
    currentState: BrowserState,
    screenshot?: string
): Promise<VerificationResult> {
    const actionName = getActionName(action);
    const actionData = (action as any)[actionName];

    const prompt = `You are verifying if a browser automation action succeeded.

ACTION PERFORMED:
Type: ${actionName}
${actionData ? `Data: ${JSON.stringify(actionData)}` : ''}

ACTION RESULT:
${JSON.stringify(result, null, 2)}

CURRENT PAGE STATE:
URL: ${currentState.url}
Title: ${currentState.title}
Interactive Elements: ${currentState.interactiveElements.length}

Analyze whether this action succeeded based on the available evidence.

Respond in JSON format:
{
    "success": true/false,
    "confidence": "high" | "medium" | "low",
    "reason": "Brief explanation",
    "evidence": "What specific evidence supports your conclusion"
}`;

    try {
        const response = await callLLM(
            [
                { role: 'system', content: 'You are a precise action verification system. Analyze browser state to determine action success.' },
                { role: 'user', content: prompt }
            ],
            MODELS.CONVERSATION
        );

        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            success: parsed.success ?? false,
            confidence: parsed.confidence ?? 'low',
            reason: parsed.reason ?? 'Unknown',
            evidence: parsed.evidence,
        };
    } catch (error) {
        console.error('[VerifyReflect] LLM verification failed:', error);
        // Default to optimistic on LLM failure
        return {
            success: !result.error,
            confidence: 'low',
            reason: 'LLM verification unavailable, using fallback',
        };
    }
}

// ============ Reflection ============

/**
 * Generate corrective actions when verification fails
 * This is what makes the agent a "recovery loop" instead of a "blind guesser"
 */
export async function generateReflection(
    failedAction: AgentAction,
    verificationResult: VerificationResult,
    browserState: BrowserState,
    errorMessage?: string,
    screenshot?: string
): Promise<ReflectionResult> {
    const actionName = getActionName(failedAction);
    const actionIndex = getActionIndex(failedAction);

    const domSummary = buildDOMSummary(browserState);

    const prompt = `You are analyzing a failed browser automation action to suggest recovery.

FAILED ACTION:
Type: ${actionName}
${actionIndex !== null ? `Target Element Index: ${actionIndex}` : ''}

FAILURE REASON:
${verificationResult.reason}

ERROR (if any):
${errorMessage || 'None'}

CURRENT DOM CONTEXT:
${domSummary}

Based on this context, suggest a corrective action to recover and continue the task.

AVAILABLE CORRECTIVE ACTIONS:
- scroll: Scroll the page to find the target element
- retry: Retry the same action (useful for timing issues)
- click_alternative: Click a different but similar element
- go_back: Navigate back (if we went to wrong page)
- wait: Wait for page to load/update
- skip: Skip this action and move to next step

Respond in JSON format:
{
    "analysis": "What went wrong and why",
    "correctiveAction": {
        "action": "scroll" | "retry" | "click_alternative" | "go_back" | "wait" | "skip",
        "target": "Description of what to target (if applicable)",
        "targetIndex": element_index_number_or_null,
        "reason": "Why this corrective action",
        "shouldRetryOriginal": true/false
    },
    "alternativeApproaches": ["approach1", "approach2"]
}`;

    try {
        const response = await callLLM(
            [
                { role: 'system', content: 'You are an expert at recovering from browser automation failures. Be specific and actionable.' },
                { role: 'user', content: prompt }
            ],
            MODELS.CONVERSATION
        );

        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            analysis: parsed.analysis ?? 'Unknown failure',
            correctiveAction: {
                action: parsed.correctiveAction?.action ?? 'skip',
                target: parsed.correctiveAction?.target,
                targetIndex: parsed.correctiveAction?.targetIndex,
                reason: parsed.correctiveAction?.reason ?? 'Fallback action',
                shouldRetryOriginal: parsed.correctiveAction?.shouldRetryOriginal ?? false,
            },
            alternativeApproaches: parsed.alternativeApproaches ?? [],
        };
    } catch (error) {
        console.error('[VerifyReflect] Reflection generation failed:', error);
        // Default corrective action
        return {
            analysis: 'LLM reflection unavailable',
            correctiveAction: {
                action: 'skip',
                reason: 'Fallback: skipping failed action',
                shouldRetryOriginal: false,
            },
            alternativeApproaches: [],
        };
    }
}

/**
 * Convert corrective action to executable AgentAction
 */
export function correctiveToAgentAction(
    corrective: CorrectiveAction,
    originalAction: AgentAction
): AgentAction | null {
    switch (corrective.action) {
        case 'scroll':
            return {
                scroll: {
                    down: true,
                    pages: 0.5,
                },
            };

        case 'wait':
            return {
                wait: {
                    seconds: 2,
                },
            };

        case 'go_back':
            return {
                goBack: {},
            };

        case 'click_alternative':
            if (corrective.targetIndex !== undefined) {
                return {
                    click: {
                        index: corrective.targetIndex,
                    },
                };
            }
            return null;

        case 'retry':
            // Return the original action for retry
            return originalAction;

        case 'skip':
        default:
            return null;
    }
}

// ============ Helpers ============

/**
 * Build a summary of the DOM for reflection context
 */
function buildDOMSummary(state: BrowserState): string {
    const elements = state.interactiveElements.slice(0, 20);

    const summary = elements.map((el, idx) => {
        const role = el.role || el.tagName;
        const text = el.text?.slice(0, 50) || '';
        return `[${idx}] ${role}: "${text}"`;
    }).join('\n');

    return `URL: ${state.url}
Title: ${state.title}
Elements (first 20):
${summary}`;
}

// Fix: Use correct parameter name in generateReflection

/**
 * Quick check if action likely needs verification
 */
export function shouldVerify(action: AgentAction): boolean {
    const actionName = getActionName(action);

    // Always verify these critical actions
    const criticalActions = ['click', 'navigate', 'input', 'selectDropdown'];

    return criticalActions.includes(actionName);
}

/**
 * Check if we should attempt reflection (limit retries)
 */
export function shouldReflect(
    reflectionCount: number,
    maxReflections: number = 2
): boolean {
    return reflectionCount < maxReflections;
}

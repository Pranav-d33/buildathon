/**
 * Agent Vision Integration - Connects vision capabilities with agent module
 * Bridges existing vision.ts with the browser-use style agent architecture
 */

import {
    analyzeScreenshot,
    checkForCaptcha,
    solveCaptcha,
    analyzeUnfillableField,
    callVisionLLM,
    type UnfillableFieldAnalysis,
} from '@/lib/vision';
import type { BrowserState, ActionResult, AgentAction } from '@/lib/agent';
import { createActionResult } from '@/lib/agent';

// ============ Types ============

export interface VisionObservation {
    screenshot: string;
    analysis: VisionAnalysis;
    captcha?: CaptchaInfo;
    timestamp: number;
}

export interface VisionAnalysis {
    pageDescription: string;
    visibleElements: VisionElement[];
    suggestedActions: VisionActionHint[];
    confidence: 'high' | 'medium' | 'low';
}

export interface VisionElement {
    type: 'button' | 'input' | 'link' | 'text' | 'image' | 'captcha' | 'other';
    label: string;
    position: { x: number; y: number };
    bounds?: { width: number; height: number };
    interactable: boolean;
}

export interface VisionActionHint {
    action: 'click' | 'input' | 'scroll' | 'wait';
    target: string;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
}

export interface CaptchaInfo {
    detected: boolean;
    type?: 'text' | 'math' | 'recaptcha' | 'hcaptcha' | 'image_selection' | 'unknown';
    solvable: boolean;
    solution?: string;
}

// ============ Agent Vision Observer ============

/**
 * Analyze screenshot for agent decision-making
 * Produces structured observations that complement DOM scanning
 */
export async function observeWithVision(
    screenshot: string,
    browserState: BrowserState,
    task: string
): Promise<VisionObservation> {
    const timestamp = Date.now();

    // Build analysis using existing vision functions
    const browserContext = {
        url: browserState.url,
        title: browserState.title,
        domain: new URL(browserState.url).hostname,
        viewport: {
            width: browserState.viewport.width,
            height: browserState.viewport.height,
            scrollY: browserState.viewport.scrollY,
            scrollHeight: browserState.viewport.scrollHeight,
        },
        visibleInputs: browserState.interactiveElements
            .filter(el => el.tagName === 'input' || el.tagName === 'textarea')
            .map(el => ({
                tag: el.tagName as 'input' | 'textarea' | 'select',
                type: el.attributes.type || 'text',
                name: el.attributes.name || '',
                id: el.attributes.id || '',
                label: el.attributes['aria-label'] || '',
                selector: '',
                value: el.value || '',
                placeholder: el.placeholder || '',
                disabled: el.attributes.disabled === 'true',
                required: el.attributes.required === 'true',
                position: { x: el.rect.x, y: el.rect.y },
            })),
        buttons: browserState.interactiveElements
            .filter(el => el.tagName === 'button' || el.role === 'button')
            .map(el => ({
                text: el.text,
                selector: '',
                type: el.attributes.type || 'button',
                position: { x: el.rect.x, y: el.rect.y },
                disabled: el.attributes.disabled === 'true',
            })),
        links: [],
        formsPresent: browserState.metadata.formCount > 0,
        formCount: browserState.metadata.formCount,
        timestamp,
    };

    try {
        // Get main analysis
        const visionResult = await analyzeScreenshot(screenshot, browserContext, task);

        // Check for CAPTCHA
        const captchaCheck = await checkForCaptcha(screenshot, browserContext);

        let captcha: CaptchaInfo | undefined;
        if (captchaCheck.hasCaptcha) {
            captcha = {
                detected: true,
                type: captchaCheck.type as CaptchaInfo['type'],
                solvable: captchaCheck.type === 'text' || captchaCheck.type === 'math' || captchaCheck.type === 'image',
            };

            // Try to solve if it's a solvable type
            if (captcha.solvable && captcha.type && ['text', 'math', 'image'].includes(captcha.type)) {
                const solveResult = await solveCaptcha(screenshot);
                if (solveResult.solved && solveResult.solution) {
                    captcha.solution = solveResult.solution;
                }
            }
        }

        // Convert vision result to VisionAnalysis
        const analysis: VisionAnalysis = {
            pageDescription: visionResult.layoutNotes,
            visibleElements: visionResult.possibleInputs.map(input => ({
                type: 'input' as const,
                label: input.label,
                position: { x: 0, y: 0 }, // Vision doesn't give exact positions
                interactable: true,
            })),
            suggestedActions: [], // Vision module doesn't suggest actions
            confidence: captchaCheck.hasCaptcha ? 'medium' : 'high',
        };

        // Add CAPTCHA as visible element if detected
        if (captcha?.detected) {
            analysis.visibleElements.push({
                type: 'captcha',
                label: `CAPTCHA (${captcha.type || 'unknown'})`,
                position: { x: 0, y: 0 },
                interactable: captcha.solvable,
            });
        }

        return {
            screenshot,
            analysis,
            captcha,
            timestamp,
        };
    } catch (error) {
        console.error('[AgentVision] Observation failed:', error);

        return {
            screenshot,
            analysis: {
                pageDescription: 'Vision analysis failed',
                visibleElements: [],
                suggestedActions: [],
                confidence: 'low',
            },
            timestamp,
        };
    }
}

// ============ Vision-Assisted Action Resolution ============

/**
 * Use vision to resolve an action that failed due to element not found
 * Returns a corrected action if vision can identify the target
 */
export async function resolveActionWithVision(
    screenshot: string,
    failedAction: AgentAction,
    browserState: BrowserState,
    errorMessage: string
): Promise<{ resolved: boolean; action?: AgentAction; reason: string }> {
    const actionName = Object.keys(failedAction)[0];
    const actionData = (failedAction as any)[actionName];

    console.log(`[AgentVision] Attempting to resolve failed ${actionName} action`);

    // Build context for vision analysis
    const contextPrompt = `
The agent tried to perform action "${actionName}" but failed with error: "${errorMessage}"
Action details: ${JSON.stringify(actionData)}
Current URL: ${browserState.url}
Task context: Find the correct element to interact with.
`;

    try {
        const messages = [
            {
                role: 'system' as const,
                content: `You are helping resolve a failed browser automation action.
                
Look at the screenshot and identify the correct element to interact with.
Return JSON with:
{
    "found": boolean,
    "elementDescription": "description of the element you found",
    "coordinates": {"x": number, "y": number} if you can identify the position,
    "reason": "explanation"
}`
            },
            {
                role: 'user' as const,
                content: [
                    { type: 'text' as const, text: contextPrompt },
                    { type: 'image_url' as const, image_url: { url: screenshot } }
                ]
            }
        ];

        const response = await callVisionLLM(messages);
        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.found && parsed.coordinates) {
            // Return coordinate-based action
            if (actionName === 'click') {
                return {
                    resolved: true,
                    action: {
                        click: {
                            coordinateX: parsed.coordinates.x,
                            coordinateY: parsed.coordinates.y,
                        }
                    } as AgentAction,
                    reason: parsed.reason || 'Found via vision',
                };
            }
        }

        return {
            resolved: false,
            reason: parsed.reason || 'Could not resolve action with vision',
        };
    } catch (error) {
        console.error('[AgentVision] Action resolution failed:', error);
        return {
            resolved: false,
            reason: 'Vision resolution failed',
        };
    }
}

// ============ CAPTCHA Handling for Agent ============

/**
 * Handle CAPTCHA during agent execution
 * Returns action result with CAPTCHA solution if possible
 */
export async function handleCaptchaForAgent(
    screenshot: string,
    captchaType: string
): Promise<ActionResult> {
    console.log(`[AgentVision] Handling CAPTCHA of type: ${captchaType}`);

    // Only try to solve text/math CAPTCHAs
    if (!['text', 'math', 'image'].includes(captchaType)) {
        return createActionResult({
            error: `CAPTCHA type "${captchaType}" cannot be automatically solved`,
            metadata: {
                captchaType,
                requiresManualIntervention: true,
            },
        });
    }

    try {
        const result = await solveCaptcha(screenshot);

        if (result.solved && result.solution) {
            return createActionResult({
                extractedContent: result.solution,
                metadata: {
                    captchaType: result.type,
                    solved: true,
                    solution: result.solution,
                },
            });
        }

        return createActionResult({
            error: result.reason || 'Failed to solve CAPTCHA',
            metadata: {
                captchaType: result.type,
                solved: false,
            },
        });
    } catch (error) {
        return createActionResult({
            error: `CAPTCHA handling failed: ${(error as Error).message}`,
        });
    }
}

// ============ Field Analysis for Agent ============

/**
 * Analyze a field that couldn't be filled
 * Uses vision to provide more context
 */
export async function analyzeFieldForAgent(
    screenshot: string,
    fieldLabel: string,
    fieldType: string,
    pageContext: string
): Promise<{
    canFill: boolean;
    suggestedValue?: string;
    needsUserInput: boolean;
    reason: string;
}> {
    try {
        const analysis = await analyzeUnfillableField(
            screenshot,
            fieldLabel,
            fieldType,
            pageContext
        );

        return {
            canFill: analysis.canFill,
            suggestedValue: analysis.suggestedValue,
            needsUserInput: analysis.needsUserInput,
            reason: analysis.reason,
        };
    } catch (error) {
        return {
            canFill: false,
            needsUserInput: true,
            reason: 'Vision analysis failed',
        };
    }
}

// ============ Vision-Enhanced Browser State ============

/**
 * Enhance browser state with vision observations
 * Adds screenshot and vision analysis to the state
 */
export function enhanceBrowserStateWithVision(
    browserState: BrowserState,
    visionObservation: VisionObservation
): BrowserState {
    return {
        ...browserState,
        screenshot: visionObservation.screenshot,
        metadata: {
            ...browserState.metadata,
            visionAnalysis: visionObservation.analysis,
            captchaDetected: visionObservation.captcha?.detected || false,
            captchaSolution: visionObservation.captcha?.solution,
        } as any,
    };
}

// ============ Exports ============

export {
    analyzeScreenshot,
    checkForCaptcha,
    solveCaptcha,
    analyzeUnfillableField,
} from '@/lib/vision';

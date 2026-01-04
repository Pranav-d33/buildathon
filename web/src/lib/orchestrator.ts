// Orchestrator - State Machine for Task Execution
// This is NOT AI - it's pure logic with context awareness

import { Task, Step, createTask } from './task'
import { IntentResult } from './llm'
import type { ContextSummary, ContextConfidence, BrowserContext, UserState } from '@/types/context'
import { calculateConfidence, shouldTriggerVision } from './contextSummarizer'

export type OrchestratorAction =
    | { action: 'ASK_USER'; questions: string[] }
    | { action: 'PLAN'; taskType: Task['type']; context?: ContextSummary }
    | { action: 'EXECUTE'; steps: Step[] }
    | { action: 'PAUSE'; reason: string }
    | { action: 'COMPLETE' }
    | { action: 'ERROR'; message: string }
    | { action: 'NEED_VISION'; reason: string }
    | { action: 'WAIT_FOR_USER'; reason: string }

// Orchestrator state
type OrchestratorState = {
    plannerRetryCount: number
    lastConfidence: ContextConfidence | null
    visionUsed: boolean
}

let state: OrchestratorState = {
    plannerRetryCount: 0,
    lastConfidence: null,
    visionUsed: false
}

// Reset orchestrator state
export function resetOrchestratorState() {
    state = {
        plannerRetryCount: 0,
        lastConfidence: null,
        visionUsed: false
    }
}

// Main orchestrator function with context awareness
export function orchestrate(
    task: Task | null,
    llmResponse: IntentResult,
    browserContext?: BrowserContext
): OrchestratorAction {
    // Calculate confidence if we have browser context
    if (browserContext) {
        state.lastConfidence = calculateConfidence(browserContext)

        // Check if we need vision fallback
        if (shouldTriggerVision(state.lastConfidence, state.plannerRetryCount) && !state.visionUsed) {
            return {
                action: 'NEED_VISION',
                reason: state.lastConfidence.reasons.join(', ')
            }
        }
    }

    // If missing info, ask user first
    if (llmResponse.missing_info.length > 0 && llmResponse.clarifying_questions) {
        return {
            action: 'ASK_USER',
            questions: llmResponse.clarifying_questions
        }
    }

    // If we have enough info, create plan
    return {
        action: 'PLAN',
        taskType: llmResponse.task_type
    }
}

// Orchestrate with full context (DOM + User state)
export function orchestrateWithContext(
    task: Task | null,
    browserContext: BrowserContext,
    userState: UserState,
    userIntent?: string
): OrchestratorAction {
    const confidence = calculateConfidence(browserContext)
    state.lastConfidence = confidence

    // Check if page looks like it needs user intervention
    if (detectCaptchaElements(browserContext)) {
        return {
            action: 'WAIT_FOR_USER',
            reason: 'CAPTCHA or verification detected. Please complete it manually.'
        }
    }

    // Check if we need vision
    if (shouldTriggerVision(confidence, state.plannerRetryCount) && !state.visionUsed) {
        return {
            action: 'NEED_VISION',
            reason: `Low confidence (${confidence.score}%): ${confidence.reasons.join(', ')}`
        }
    }

    // If task is executing, get next step
    if (task && task.status === 'executing') {
        return getNextAction(task)
    }

    // Default: ready to plan
    return {
        action: 'PLAN',
        taskType: task?.type || 'GENERIC'
    }
}

// Mark vision as used
export function markVisionUsed() {
    state.visionUsed = true
}

// Increment planner retry count
export function incrementPlannerRetry() {
    state.plannerRetryCount++
}

// Get current confidence
export function getLastConfidence(): ContextConfidence | null {
    return state.lastConfidence
}

// Detect CAPTCHA elements in DOM
function detectCaptchaElements(browserContext: BrowserContext): boolean {
    const captchaKeywords = ['captcha', 'recaptcha', 'hcaptcha', 'verification', 'verify']

    // Check inputs
    const hasCaptchaInput = browserContext.visibleInputs.some(input =>
        captchaKeywords.some(kw =>
            input.label.toLowerCase().includes(kw) ||
            input.selector.toLowerCase().includes(kw) ||
            input.name.toLowerCase().includes(kw)
        )
    )

    // Check buttons
    const hasCaptchaButton = browserContext.buttons.some(btn =>
        captchaKeywords.some(kw => btn.text.toLowerCase().includes(kw))
    )

    return hasCaptchaInput || hasCaptchaButton
}

// Plan validation
export function validatePlan(steps: Step[]): { valid: boolean; reason?: string } {
    for (const step of steps) {
        // Never auto-submit
        if (step.action === 'click' && step.label?.toLowerCase().includes('submit')) {
            return { valid: false, reason: 'Cannot auto-submit forms. User must click submit.' }
        }

        // Don't interact with captcha
        if (step.selector?.toLowerCase().includes('captcha') ||
            step.label?.toLowerCase().includes('captcha')) {
            return { valid: false, reason: 'Cannot handle CAPTCHA. User must complete verification.' }
        }

        // Don't handle payments
        if (step.label?.toLowerCase().includes('payment') ||
            step.label?.toLowerCase().includes('pay now')) {
            return { valid: false, reason: 'Cannot handle payments. User must complete transaction.' }
        }
    }

    return { valid: true }
}

// Step execution controller
export function getNextAction(task: Task): OrchestratorAction {
    if (!task) {
        return { action: 'ERROR', message: 'No active task' }
    }

    switch (task.status) {
        case 'idle':
            return { action: 'PLAN', taskType: task.type }

        case 'planning':
            return { action: 'PLAN', taskType: task.type }

        case 'executing':
            if (task.currentStep >= task.steps.length) {
                return { action: 'COMPLETE' }
            }

            const currentStep = task.steps[task.currentStep]

            // Check if we should pause before this step
            const pauseCheck = shouldPauseBeforeStep(currentStep)
            if (pauseCheck.pause) {
                return { action: 'PAUSE', reason: pauseCheck.reason! }
            }

            return { action: 'EXECUTE', steps: [currentStep] }

        case 'paused':
            return { action: 'PAUSE', reason: 'Task paused by user' }

        case 'completed':
            return { action: 'COMPLETE' }

        case 'error':
            return { action: 'ERROR', message: 'Task encountered an error' }

        default:
            return { action: 'ERROR', message: 'Unknown task status' }
    }
}

// Check if we should pause before certain actions
export function shouldPauseBeforeStep(step: Step): { pause: boolean; reason?: string } {
    if (step.action === 'click') {
        const label = step.label?.toLowerCase() || ''
        const desc = step.description?.toLowerCase() || ''

        if (label.includes('submit') || desc.includes('submit')) {
            return { pause: true, reason: 'Pausing before submission. Please review and click submit yourself.' }
        }

        if (label.includes('confirm') || desc.includes('confirm')) {
            return { pause: true, reason: 'Pausing before confirmation. Please review and confirm yourself.' }
        }

        if (label.includes('pay') || desc.includes('payment')) {
            return { pause: true, reason: 'Pausing before payment. Please complete payment yourself.' }
        }
    }

    // Pause action
    if (step.action === 'pause') {
        return { pause: true, reason: step.description || 'Manual intervention required' }
    }

    return { pause: false }
}

// Create initial task from intent
export function createTaskFromIntent(intent: IntentResult): Task {
    return createTask(intent.task_type, {
        intentSummary: intent.intent_summary,
    })
}

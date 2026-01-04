// Context Summarizer - Layer 3
// Compresses DOM and User state into human-readable context for LLM

import type { BrowserContext, UserState, ContextSummary, ContextConfidence } from '@/types/context'

/**
 * Calculate confidence score for the DOM context
 * Score 0-100, where higher = better context quality
 */
export function calculateConfidence(browser: BrowserContext): ContextConfidence {
    const reasons: string[] = []
    let score = 100

    // Check if we have visible inputs
    if (browser.visibleInputs.length === 0) {
        score -= 30
        reasons.push('No visible input fields detected')
    }

    // Check for labels on inputs
    const inputsWithLabels = browser.visibleInputs.filter(input => input.label && input.label.length > 0)
    const labelRatio = browser.visibleInputs.length > 0
        ? inputsWithLabels.length / browser.visibleInputs.length
        : 0

    if (labelRatio < 0.5) {
        score -= 20
        reasons.push('Many inputs missing labels')
    }

    // Check for forms
    if (browser.visibleInputs.length > 0 && !browser.formsPresent) {
        score -= 10
        reasons.push('Inputs found but no form element')
    }

    // Check if this might be a canvas/image-heavy page
    if (browser.visibleInputs.length === 0 && browser.buttons.length === 0 && browser.links.length < 3) {
        score -= 25
        reasons.push('Page appears to have minimal interactive elements')
    }

    // Check for generic/unhelpful selectors
    const genericSelectors = browser.visibleInputs.filter(input =>
        !input.id && !input.name && input.selector.includes('nth-of-type')
    )
    if (genericSelectors.length > browser.visibleInputs.length * 0.5) {
        score -= 15
        reasons.push('Many inputs have non-unique selectors')
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score))

    return {
        score,
        reasons,
        needsVision: score < 50
    }
}

/**
 * Summarize browser context into human-readable format
 */
export function summarizeContext(
    browser: BrowserContext,
    user: UserState,
    userIntent?: string
): ContextSummary {
    const confidence = calculateConfidence(browser)

    // Format visible fields
    const visibleFields = browser.visibleInputs.map(input => ({
        label: input.label || input.name || input.placeholder || 'Unnamed field',
        type: input.type,
        filled: Boolean(input.value && input.value.length > 0)
    }))

    // Format last user action
    let lastUserAction = 'None'
    if (user.lastAction.type) {
        switch (user.lastAction.type) {
            case 'CLICK':
                lastUserAction = `Clicked ${user.lastAction.selector?.slice(0, 50) || 'element'}`
                break
            case 'INPUT':
                lastUserAction = `Typing in ${user.focusedLabel || user.focusedElement || 'field'}`
                break
            case 'FOCUS':
                lastUserAction = `Focused on ${user.focusedLabel || user.focusedElement || 'field'}`
                break
            case 'SCROLL':
                lastUserAction = `Scrolled ${user.scrollDirection || 'page'}`
                break
            default:
                lastUserAction = user.lastAction.type
        }
    }

    return {
        page: browser.title,
        url: browser.url,
        domain: browser.domain,
        visibleFields,
        focusedField: user.focusedLabel || user.focusedElement,
        lastUserAction,
        userIntent,
        confidence: confidence.score,
        timestamp: Date.now()
    }
}

/**
 * Convert context summary to a text prompt for LLM
 */
export function contextToPrompt(summary: ContextSummary, userMessage?: string): string {
    const fieldsList = summary.visibleFields
        .map(f => `- ${f.label} (${f.type})${f.filled ? ' [filled]' : ''}`)
        .join('\n')

    return `Page: ${summary.page}
URL: ${summary.url}

Visible fields:
${fieldsList || '(no visible fields)'}

Focused field: ${summary.focusedField || 'None'}
User last action: ${summary.lastUserAction}

${userMessage ? `User said: "${userMessage}"` : ''}`.trim()
}

/**
 * Determine if vision fallback should be triggered
 */
export function shouldTriggerVision(
    confidence: ContextConfidence,
    plannerRetryCount: number = 0
): boolean {
    // Trigger vision if:
    // 1. Confidence is below threshold
    if (confidence.needsVision) return true

    // 2. Planner has failed twice
    if (plannerRetryCount >= 2) return true

    return false
}

/**
 * Get a compact context for logging/debugging
 */
export function getCompactContext(browser: BrowserContext, user: UserState): object {
    return {
        url: browser.url,
        title: browser.title,
        inputCount: browser.visibleInputs.length,
        buttonCount: browser.buttons.length,
        formCount: browser.formCount,
        focused: user.focusedLabel || user.focusedElement,
        lastAction: user.lastAction.type,
        cursor: user.cursor
    }
}

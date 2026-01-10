/**
 * Completion Detector - Task Success Detection Module
 * Phase 8: Detect when tasks are successfully completed
 * 
 * Prevents infinite loops by detecting:
 * - URL patterns (success pages, confirmation pages)
 * - Success messages on page
 * - Form submission completion
 * - Page state changes
 */

import type { BrowserState } from './agentViews';
import type { PageObservation, AffordanceMap } from './affordances';
import { containsSuccessKeyword } from './affordances';

// ============ Types ============

/**
 * Completion criteria types
 */
export type CompletionCriteriaType =
    | 'url_pattern'
    | 'url_change'
    | 'element_present'
    | 'element_absent'
    | 'text_match'
    | 'form_submitted'
    | 'page_contains'
    | 'llm_judgment';

/**
 * Single completion criterion
 */
export interface CompletionCriterion {
    type: CompletionCriteriaType;
    pattern?: string | RegExp;
    selector?: string;
    text?: string;
    weight?: number;  // For weighted scoring (default: 1.0)
}

/**
 * Completion detection result
 */
export interface CompletionResult {
    isComplete: boolean;
    confidence: number;      // 0-100 percentage
    matchedCriteria: string[];
    evidence: string[];
    recommendation: 'continue' | 'complete' | 'ask_human';
}

/**
 * Success message indicators (common patterns)
 */
export const SUCCESS_PATTERNS = {
    // URL patterns
    URL_SUCCESS: [
        /\/success/i,
        /\/confirmation/i,
        /\/thank-?you/i,
        /\/complete/i,
        /\/done/i,
        /\/submitted/i,
        /\?status=success/i,
        /\?result=ok/i,
    ],

    // Page text patterns
    TEXT_SUCCESS: [
        /thank\s*you/i,
        /success(ful(ly)?)?/i,
        /has been (submitted|received|confirmed|processed)/i,
        /application (submitted|received|confirmed)/i,
        /form (submitted|received)/i,
        /request (submitted|received|registered)/i,
        /confirmation number/i,
        /reference (number|id)/i,
        /your request has been/i,
        /we have received/i,
        /you will receive/i,
        /registration complete/i,
        /transaction (complete|successful)/i,
    ],

    // Error patterns (negative indicators)
    TEXT_ERROR: [
        /error/i,
        /failed/i,
        /invalid/i,
        /please (correct|fix|try again)/i,
        /could not be processed/i,
        /something went wrong/i,
    ],
};

// ============ Core Detection Functions ============

/**
 * Detect task completion by comparing before/after states
 */
export function detectCompletion(
    criteria: CompletionCriterion[],
    beforeState: BrowserState,
    afterState: BrowserState,
    afterObservation?: PageObservation
): CompletionResult {
    const matchedCriteria: string[] = [];
    const evidence: string[] = [];
    let totalWeight = 0;
    let matchedWeight = 0;

    for (const criterion of criteria) {
        const weight = criterion.weight ?? 1.0;
        totalWeight += weight;

        const result = evaluateCriterion(criterion, beforeState, afterState, afterObservation);

        if (result.matched) {
            matchedWeight += weight;
            matchedCriteria.push(criterion.type);
            evidence.push(result.evidence);
        }
    }

    // Calculate confidence
    const confidence = totalWeight > 0
        ? Math.round((matchedWeight / totalWeight) * 100)
        : 0;

    // Determine recommendation
    let recommendation: 'continue' | 'complete' | 'ask_human' = 'continue';
    if (confidence >= 70) {
        recommendation = 'complete';
    } else if (confidence >= 40) {
        recommendation = 'ask_human';
    }

    return {
        isComplete: confidence >= 70,
        confidence,
        matchedCriteria,
        evidence,
        recommendation,
    };
}

/**
 * Evaluate a single criterion
 */
function evaluateCriterion(
    criterion: CompletionCriterion,
    beforeState: BrowserState,
    afterState: BrowserState,
    afterObservation?: PageObservation
): { matched: boolean; evidence: string } {
    switch (criterion.type) {
        case 'url_pattern': {
            if (!criterion.pattern) {
                return { matched: false, evidence: 'No pattern specified' };
            }
            const pattern = typeof criterion.pattern === 'string'
                ? new RegExp(criterion.pattern, 'i')
                : criterion.pattern;
            const matched = pattern.test(afterState.url);
            return {
                matched,
                evidence: matched
                    ? `URL matches pattern: ${afterState.url}`
                    : `URL does not match pattern`,
            };
        }

        case 'url_change': {
            const changed = beforeState.url !== afterState.url;
            return {
                matched: changed,
                evidence: changed
                    ? `URL changed: ${beforeState.url} → ${afterState.url}`
                    : 'URL unchanged',
            };
        }

        case 'text_match': {
            if (!criterion.text) {
                return { matched: false, evidence: 'No text specified' };
            }
            // Check in page title and visible text
            const pageText = [
                afterState.title || '',
                ...(afterObservation?.affordances.errors.map(e => e.message) || []),
            ].join(' ');

            const matched = pageText.toLowerCase().includes(criterion.text.toLowerCase());
            return {
                matched,
                evidence: matched
                    ? `Found text: "${criterion.text}"`
                    : `Text not found: "${criterion.text}"`,
            };
        }

        case 'form_submitted': {
            // Check if form fields were cleared or page changed after form interaction
            if (!afterObservation) {
                return { matched: false, evidence: 'No observation available' };
            }

            // Signs of submission:
            // 1. URL changed
            // 2. Success messages present
            // 3. Form no longer visible or cleared

            const urlChanged = beforeState.url !== afterState.url;
            const hasSuccessMessage = afterObservation.affordances.errors.some(
                e => e.severity === 'info' && containsSuccessKeyword(e.message)
            );

            const matched = urlChanged || hasSuccessMessage;
            return {
                matched,
                evidence: matched
                    ? `Form appears submitted: ${urlChanged ? 'URL changed' : 'success message detected'}`
                    : 'No evidence of form submission',
            };
        }

        case 'page_contains': {
            if (!criterion.text) {
                return { matched: false, evidence: 'No text specified' };
            }
            // This would need access to page content
            const matched = afterState.title?.toLowerCase().includes(criterion.text.toLowerCase()) || false;
            return {
                matched,
                evidence: matched
                    ? `Page contains: "${criterion.text}"`
                    : `Page does not contain: "${criterion.text}"`,
            };
        }

        case 'element_present': {
            if (!criterion.selector) {
                return { matched: false, evidence: 'No selector specified' };
            }
            // Check if element exists in selector map
            const matched = Object.values(afterState.selectorMap || {}).some(el =>
                el.attributes?.id === criterion.selector?.replace('#', '') ||
                el.attributes?.class?.includes(criterion.selector?.replace('.', '') || '')
            );
            return {
                matched,
                evidence: matched
                    ? `Element found: ${criterion.selector}`
                    : `Element not found: ${criterion.selector}`,
            };
        }

        case 'element_absent': {
            if (!criterion.selector) {
                return { matched: false, evidence: 'No selector specified' };
            }
            const present = Object.values(afterState.selectorMap || {}).some(el =>
                el.attributes?.id === criterion.selector?.replace('#', '')
            );
            return {
                matched: !present,
                evidence: !present
                    ? `Element absent: ${criterion.selector}`
                    : `Element still present: ${criterion.selector}`,
            };
        }

        case 'llm_judgment': {
            // This requires async LLM call - return false for sync evaluation
            return {
                matched: false,
                evidence: 'LLM judgment requires async evaluation'
            };
        }

        default:
            return { matched: false, evidence: `Unknown criterion type: ${criterion.type}` };
    }
}

// ============ Auto-Detection Functions ============

/**
 * Auto-detect completion without explicit criteria
 * Uses heuristics based on common success patterns
 */
export function autoDetectCompletion(
    beforeState: BrowserState,
    afterState: BrowserState,
    afterObservation?: PageObservation
): CompletionResult {
    const evidence: string[] = [];
    const matchedCriteria: string[] = [];
    let score = 0;
    const maxScore = 100;

    // 1. Check URL for success patterns (30 points)
    for (const pattern of SUCCESS_PATTERNS.URL_SUCCESS) {
        if (pattern.test(afterState.url)) {
            score += 30;
            matchedCriteria.push('url_pattern');
            evidence.push(`URL matches success pattern: ${afterState.url}`);
            break;
        }
    }

    // 2. Check for URL change (10 points)
    if (beforeState.url !== afterState.url) {
        score += 10;
        matchedCriteria.push('url_change');
        evidence.push(`URL changed: ${beforeState.url} → ${afterState.url}`);
    }

    // 3. Check title for success keywords (15 points)
    if (afterState.title) {
        for (const pattern of SUCCESS_PATTERNS.TEXT_SUCCESS) {
            if (pattern.test(afterState.title)) {
                score += 15;
                matchedCriteria.push('title_success');
                evidence.push(`Title contains success pattern: ${afterState.title}`);
                break;
            }
        }
    }

    // 4. Check for success messages in affordances (25 points)
    if (afterObservation?.affordances) {
        const hasSuccessText = afterObservation.affordances.errors.some(
            e => e.severity !== 'error' && containsSuccessKeyword(e.message)
        );
        if (hasSuccessText) {
            score += 25;
            matchedCriteria.push('success_message');
            evidence.push('Success message detected on page');
        }
    }

    // 5. Check for no errors (10 points)
    if (afterObservation?.affordances) {
        const hasErrors = afterObservation.affordances.errors.some(e => e.severity === 'error');
        if (!hasErrors) {
            score += 10;
            matchedCriteria.push('no_errors');
            evidence.push('No error messages on page');
        }
    }

    // 6. Check page state (10 points)
    if (afterObservation?.pageState === 'idle' && beforeState.url !== afterState.url) {
        score += 10;
        matchedCriteria.push('page_stable');
        evidence.push('Page is stable after navigation');
    }

    // Negative indicators (reduce score)
    if (afterObservation?.affordances) {
        const hasErrorMessages = afterObservation.affordances.errors.some(
            e => e.severity === 'error'
        );
        if (hasErrorMessages) {
            score = Math.max(0, score - 30);
            evidence.push('Error messages present on page');
        }
    }

    // Check for CAPTCHA (blocks completion)
    if (afterObservation?.pageState === 'captcha') {
        score = Math.max(0, score - 50);
        evidence.push('CAPTCHA detected - human intervention required');
    }

    // Normalize score
    const confidence = Math.min(100, Math.max(0, score));

    // Determine recommendation
    let recommendation: 'continue' | 'complete' | 'ask_human' = 'continue';
    if (confidence >= 70) {
        recommendation = 'complete';
    } else if (confidence >= 40) {
        recommendation = 'ask_human';
    }

    return {
        isComplete: confidence >= 70,
        confidence,
        matchedCriteria,
        evidence,
        recommendation,
    };
}

// ============ Criterion Builders ============

/**
 * Build criteria for URL-based completion
 */
export function urlContains(pattern: string, weight?: number): CompletionCriterion {
    return {
        type: 'url_pattern',
        pattern,
        weight,
    };
}

/**
 * Build criteria for text presence
 */
export function pageContainsText(text: string, weight?: number): CompletionCriterion {
    return {
        type: 'text_match',
        text,
        weight,
    };
}

/**
 * Build criteria for element presence
 */
export function elementExists(selector: string, weight?: number): CompletionCriterion {
    return {
        type: 'element_present',
        selector,
        weight,
    };
}

/**
 * Build criteria for form submission
 */
export function formWasSubmitted(weight?: number): CompletionCriterion {
    return {
        type: 'form_submitted',
        weight,
    };
}

/**
 * Create standard RTI completion criteria
 */
export function createRTICompletionCriteria(): CompletionCriterion[] {
    return [
        urlContains('confirmation', 2.0),
        urlContains('success', 2.0),
        urlContains('status', 1.5),
        pageContainsText('registration number', 2.0),
        pageContainsText('reference number', 2.0),
        pageContainsText('submitted successfully', 2.0),
        pageContainsText('thank you', 1.5),
        formWasSubmitted(1.0),
    ];
}

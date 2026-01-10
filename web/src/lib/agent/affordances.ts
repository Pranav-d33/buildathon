/**
 * Affordances Module - Structured Page Perception Layer
 * Phase 1: Enhanced DOM/AX Tree extraction with typed affordances
 * 
 * Based on BrowserGym/WebArena research for robust page understanding.
 * Provides high-level structures beyond raw DOM for agent decision-making.
 */

// ============ Core Affordance Types ============

/**
 * Page state enumeration for agent decision-making
 */
export type PageState =
    | 'idle'           // Normal page, ready for interaction
    | 'loading'        // Page is loading
    | 'modal_open'     // Modal/dialog is open
    | 'captcha'        // CAPTCHA detected
    | 'error'          // Error state detected
    | 'form_filling'   // User is filling a form
    | 'submitting';    // Form submission in progress

/**
 * Link affordance - clickable navigation element
 */
export interface LinkAffordance {
    index: number;
    text: string;
    href: string;
    selector: string;
    isVisible: boolean;
    isExternal: boolean;
    position: { x: number; y: number };
    ariaLabel?: string;
}

/**
 * Button affordance - actionable button element
 */
export interface ButtonAffordance {
    index: number;
    text: string;
    selector: string;
    buttonType: 'submit' | 'reset' | 'button' | 'menu';
    isVisible: boolean;
    isDisabled: boolean;
    position: { x: number; y: number };
    ariaLabel?: string;
    formId?: string;
}

/**
 * Input affordance - form input element
 */
export interface InputAffordance {
    index: number;
    label: string;
    inputType: string;
    selector: string;
    name: string;
    value: string;
    placeholder: string;
    isVisible: boolean;
    isDisabled: boolean;
    isRequired: boolean;
    isReadonly: boolean;
    position: { x: number; y: number };
    constraints?: {
        min?: string;
        max?: string;
        step?: string;
        pattern?: string;
        maxLength?: number;
        minLength?: number;
    };
    validationMessage?: string;
}

/**
 * Select/Dropdown affordance
 */
export interface SelectAffordance {
    index: number;
    label: string;
    selector: string;
    name: string;
    isVisible: boolean;
    isDisabled: boolean;
    isRequired: boolean;
    isMultiple: boolean;
    selectedValue: string;
    selectedText: string;
    options: Array<{
        value: string;
        text: string;
        isSelected: boolean;
        isDisabled: boolean;
    }>;
    position: { x: number; y: number };
}

/**
 * Modal/Dialog affordance
 */
export interface ModalAffordance {
    index: number;
    type: 'dialog' | 'alert' | 'confirm' | 'prompt' | 'popup' | 'overlay';
    title?: string;
    content: string;
    selector: string;
    isVisible: boolean;
    hasCloseButton: boolean;
    closeButtonSelector?: string;
    buttons: Array<{
        text: string;
        selector: string;
        role: 'confirm' | 'cancel' | 'close' | 'other';
    }>;
    position: { x: number; y: number; width: number; height: number };
}

/**
 * Error/Validation message
 */
export interface ErrorMessage {
    index: number;
    type: 'validation' | 'form_error' | 'page_error' | 'network_error' | 'alert';
    message: string;
    selector?: string;
    associatedField?: string;
    severity: 'error' | 'warning' | 'info';
    isVisible: boolean;
    position?: { x: number; y: number };
}

/**
 * Form structure for grouped understanding
 */
export interface FormAffordance {
    index: number;
    id?: string;
    name?: string;
    action?: string;
    method: 'GET' | 'POST' | 'DIALOG';
    selector: string;
    inputs: number[];      // Indexes of InputAffordance
    selects: number[];     // Indexes of SelectAffordance
    buttons: number[];     // Indexes of ButtonAffordance
    submitButton?: number; // Index of submit button
    hasFileUpload: boolean;
    isFilled: number;      // Percentage of required fields filled
    validationErrors: string[];
}

/**
 * CAPTCHA detection result
 */
export interface CaptchaAffordance {
    type: 'recaptcha' | 'hcaptcha' | 'text' | 'image' | 'audio' | 'unknown';
    selector: string;
    isVisible: boolean;
    isSolved: boolean;
    position: { x: number; y: number; width: number; height: number };
}

// ============ Aggregated Types ============

/**
 * Complete affordance map for a page
 */
export interface AffordanceMap {
    links: LinkAffordance[];
    buttons: ButtonAffordance[];
    inputs: InputAffordance[];
    selects: SelectAffordance[];
    modals: ModalAffordance[];
    errors: ErrorMessage[];
    forms: FormAffordance[];
    captcha?: CaptchaAffordance;
}

/**
 * Complete page observation for agent
 * This is the primary output of the perception layer
 */
export interface PageObservation {
    url: string;
    title: string;
    pageState: PageState;
    affordances: AffordanceMap;
    axTreeFormatted: string;
    viewport: {
        width: number;
        height: number;
        scrollY: number;
        scrollHeight: number;
    };
    screenshot?: string;
    timestamp: number;
}

// ============ Detection Helpers ============

/**
 * Keywords for detecting error messages
 */
export const ERROR_KEYWORDS = [
    'error', 'invalid', 'required', 'failed', 'incorrect',
    'wrong', 'missing', 'cannot', 'unable', 'must', 'please enter',
    'already exists', 'not found', 'expired', 'denied'
] as const;

/**
 * Keywords for detecting success messages
 */
export const SUCCESS_KEYWORDS = [
    'success', 'thank you', 'submitted', 'confirmed', 'completed',
    'received', 'saved', 'registered', 'created', 'sent',
    'approved', 'accepted', 'done', 'congratulations'
] as const;

/**
 * CAPTCHA element selectors
 */
export const CAPTCHA_SELECTORS = [
    '[class*="captcha"]',
    '[id*="captcha"]',
    '[class*="recaptcha"]',
    '#g-recaptcha',
    '.h-captcha',
    '[data-sitekey]',
    '[data-callback]',
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]'
] as const;

/**
 * Modal/Dialog selectors
 */
export const MODAL_SELECTORS = [
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[aria-modal="true"]',
    '.modal',
    '.dialog',
    '.popup',
    '.overlay',
    '[class*="modal"]',
    '[class*="dialog"]',
    '[class*="popup"]'
] as const;

// ============ Utility Functions ============

/**
 * Check if text contains error keywords (case-insensitive)
 */
export function containsErrorKeyword(text: string): boolean {
    const lowerText = text.toLowerCase();
    return ERROR_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

/**
 * Check if text contains success keywords (case-insensitive)
 */
export function containsSuccessKeyword(text: string): boolean {
    const lowerText = text.toLowerCase();
    return SUCCESS_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

/**
 * Infer page state from affordances
 */
export function inferPageState(affordances: AffordanceMap): PageState {
    // Check for CAPTCHA first
    if (affordances.captcha?.isVisible) {
        return 'captcha';
    }

    // Check for modals
    if (affordances.modals.some(m => m.isVisible)) {
        return 'modal_open';
    }

    // Check for page-level errors
    if (affordances.errors.some(e => e.type === 'page_error' && e.severity === 'error')) {
        return 'error';
    }

    // Check if user is actively filling forms
    const activeForms = affordances.forms.filter(f => f.isFilled > 0 && f.isFilled < 100);
    if (activeForms.length > 0) {
        return 'form_filling';
    }

    return 'idle';
}

/**
 * Get actionable elements count
 */
export function getActionableCount(affordances: AffordanceMap): number {
    return (
        affordances.links.filter(l => l.isVisible).length +
        affordances.buttons.filter(b => b.isVisible && !b.isDisabled).length +
        affordances.inputs.filter(i => i.isVisible && !i.isDisabled && !i.isReadonly).length +
        affordances.selects.filter(s => s.isVisible && !s.isDisabled).length
    );
}

/**
 * Find element by text (fuzzy match)
 */
export function findByText<T extends { text?: string; label?: string }>(
    elements: T[],
    searchText: string
): T | undefined {
    const lowerSearch = searchText.toLowerCase().trim();

    // Exact match first
    let match = elements.find(e => {
        const text = (e.text || e.label || '').toLowerCase().trim();
        return text === lowerSearch;
    });

    if (match) return match;

    // Partial match
    match = elements.find(e => {
        const text = (e.text || e.label || '').toLowerCase().trim();
        return text.includes(lowerSearch) || lowerSearch.includes(text);
    });

    return match;
}

/**
 * Filter visible affordances only
 */
export function visibleOnly<T extends { isVisible: boolean }>(elements: T[]): T[] {
    return elements.filter(e => e.isVisible);
}

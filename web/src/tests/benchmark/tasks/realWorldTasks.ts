/**
 * Real World Tasks - Phase 12 Production Site Validation
 * Multi-step tasks for real government and production websites
 */

import type { BenchmarkTask } from '../harness';

// ============ Tier Definitions ============

/**
 * Task complexity tiers for generalization testing
 */
export type TaskTier =
    | 'TIER_1_STATIC'      // Static pages, link navigation
    | 'TIER_2_FORMS'       // Forms + validation
    | 'TIER_3_MODALS'      // Modals, popups, toasts
    | 'TIER_4_AUTH'        // Multi-page auth flows
    | 'TIER_5_CAPTCHA_OTP' // CAPTCHA/OTP gates
    | 'TIER_6_FILE_OPS';   // File uploads/downloads

export interface TieredTask extends BenchmarkTask {
    tier: TaskTier;
    expectedHITL: boolean;
    domainType: string;
    challenges: string[];
}

// ============ Tier 1: Static Navigation ============

export const TIER_1_TASKS: TieredTask[] = [
    {
        id: 'rti-home',
        name: 'RTI Homepage Navigation',
        description: 'Navigate to RTI Online homepage',
        goal: 'Go to the RTI Online website (rtionline.gov.in)',
        startUrl: 'about:blank',
        successCriteria: [
            { type: 'url_pattern', pattern: 'rtionline.gov.in' },
        ],
        maxSteps: 3,
        category: 'navigation',
        difficulty: 'easy',
        tier: 'TIER_1_STATIC',
        expectedHITL: false,
        domainType: 'government',
        challenges: [],
    },
    {
        id: 'nsp-home',
        name: 'Scholarship Portal Navigation',
        description: 'Navigate to National Scholarship Portal',
        goal: 'Open the National Scholarship Portal (scholarships.gov.in)',
        startUrl: 'about:blank',
        successCriteria: [
            { type: 'url_pattern', pattern: 'scholarships.gov.in' },
        ],
        maxSteps: 3,
        category: 'navigation',
        difficulty: 'easy',
        tier: 'TIER_1_STATIC',
        expectedHITL: false,
        domainType: 'government',
        challenges: [],
    },
    {
        id: 'passport-home',
        name: 'Passport Portal Navigation',
        description: 'Navigate to Passport Seva portal',
        goal: 'Go to the Passport Seva website (passportindia.gov.in)',
        startUrl: 'about:blank',
        successCriteria: [
            { type: 'url_pattern', pattern: 'passportindia.gov.in' },
        ],
        maxSteps: 3,
        category: 'navigation',
        difficulty: 'easy',
        tier: 'TIER_1_STATIC',
        expectedHITL: false,
        domainType: 'government',
        challenges: [],
    },
    {
        id: 'google-nav',
        name: 'Google Navigation',
        description: 'Navigate to Google search',
        goal: 'Go to google.com',
        startUrl: 'about:blank',
        successCriteria: [
            { type: 'url_pattern', pattern: 'google.com' },
        ],
        maxSteps: 2,
        category: 'navigation',
        difficulty: 'easy',
        tier: 'TIER_1_STATIC',
        expectedHITL: false,
        domainType: 'search',
        challenges: [],
    },
];

// ============ Tier 2: Forms & Search ============

export const TIER_2_TASKS: TieredTask[] = [
    {
        id: 'google-search',
        name: 'Google Web Search',
        description: 'Perform a Google search',
        goal: 'Search for "passport office near me" on Google',
        startUrl: 'https://google.com',
        successCriteria: [
            { type: 'url_pattern', pattern: 'search.*passport' },
            { type: 'text_match', text: 'passport' },
        ],
        maxSteps: 5,
        category: 'search',
        difficulty: 'easy',
        tier: 'TIER_2_FORMS',
        expectedHITL: false,
        domainType: 'search',
        challenges: ['dynamic_suggestions', 'autocomplete'],
    },
    {
        id: 'rti-guidelines',
        name: 'RTI Guidelines Page',
        description: 'Navigate to RTI submission guidelines',
        goal: 'Find and navigate to the RTI submission guidelines page on rtionline.gov.in',
        startUrl: 'https://rtionline.gov.in',
        successCriteria: [
            { type: 'url_pattern', pattern: 'guidelines' },
            { type: 'text_match', text: 'submit' },
        ],
        maxSteps: 5,
        category: 'navigation',
        difficulty: 'medium',
        tier: 'TIER_2_FORMS',
        expectedHITL: false,
        domainType: 'government',
        challenges: ['multi_hop_navigation'],
    },
    {
        id: 'rti-status-page',
        name: 'RTI Status Check Page',
        description: 'Navigate to RTI status check page',
        goal: 'Go to the RTI application status check page',
        startUrl: 'https://rtionline.gov.in',
        successCriteria: [
            { type: 'url_pattern', pattern: 'status' },
        ],
        maxSteps: 5,
        category: 'navigation',
        difficulty: 'medium',
        tier: 'TIER_2_FORMS',
        expectedHITL: false,
        domainType: 'government',
        challenges: ['link_discovery'],
    },
];

// ============ Tier 3: Modals & Dynamic Content ============

export const TIER_3_TASKS: TieredTask[] = [
    {
        id: 'cookie-consent',
        name: 'Handle Cookie Consent',
        description: 'Navigate and handle cookie consent modal',
        goal: 'Go to any major news site and accept/dismiss any cookie consent popup',
        startUrl: 'about:blank',
        successCriteria: [
            { type: 'element_absent', selector: '[role="dialog"]' },
        ],
        maxSteps: 5,
        category: 'navigation',
        difficulty: 'medium',
        tier: 'TIER_3_MODALS',
        expectedHITL: false,
        domainType: 'general',
        challenges: ['modal_handling', 'dynamic_content'],
    },
    {
        id: 'dropdown-select',
        name: 'Dropdown Selection',
        description: 'Select option from dropdown menu',
        goal: 'On the RTI status page, select "Ministry of Home Affairs" from the ministry dropdown if available',
        startUrl: 'https://rtionline.gov.in/request/status.php',
        successCriteria: [
            { type: 'text_match', text: 'Ministry' },
        ],
        maxSteps: 5,
        category: 'form',
        difficulty: 'medium',
        tier: 'TIER_3_MODALS',
        expectedHITL: false,
        domainType: 'government',
        challenges: ['dropdown_interaction', 'dynamic_options'],
    },
];

// ============ Tier 4: Authentication Flows ============

export const TIER_4_TASKS: TieredTask[] = [
    {
        id: 'rti-login-page',
        name: 'RTI Login Page Navigation',
        description: 'Navigate to RTI login page',
        goal: 'Navigate to the login page on RTI Online',
        startUrl: 'https://rtionline.gov.in',
        successCriteria: [
            { type: 'url_pattern', pattern: 'login' },
        ],
        maxSteps: 5,
        category: 'navigation',
        difficulty: 'medium',
        tier: 'TIER_4_AUTH',
        expectedHITL: false,
        domainType: 'government',
        challenges: ['auth_flow'],
    },
    {
        id: 'gmail-login-page',
        name: 'Gmail Login Page',
        description: 'Navigate to Gmail login',
        goal: 'Go to Gmail and reach the login form',
        startUrl: 'about:blank',
        successCriteria: [
            { type: 'url_pattern', pattern: 'accounts.google.com' },
        ],
        maxSteps: 5,
        category: 'navigation',
        difficulty: 'medium',
        tier: 'TIER_4_AUTH',
        expectedHITL: true, // Will need credentials
        domainType: 'communication',
        challenges: ['sso_redirect', 'credential_input'],
    },
];

// ============ Tier 5: CAPTCHA/OTP ============

export const TIER_5_TASKS: TieredTask[] = [
    {
        id: 'rti-captcha-form',
        name: 'RTI Form with CAPTCHA',
        description: 'Fill RTI form that has CAPTCHA',
        goal: 'Start filling the RTI submission form (CAPTCHA will require human help)',
        startUrl: 'https://rtionline.gov.in/guidelines.php?request',
        successCriteria: [
            { type: 'text_match', text: 'captcha' },
        ],
        maxSteps: 10,
        category: 'form',
        difficulty: 'hard',
        tier: 'TIER_5_CAPTCHA_OTP',
        expectedHITL: true,
        domainType: 'government',
        challenges: ['captcha', 'multi_step_form'],
    },
];

// ============ Tier 6: File Operations ============

export const TIER_6_TASKS: TieredTask[] = [
    {
        id: 'file-upload-form',
        name: 'File Upload Form',
        description: 'Navigate to a form with file upload capability',
        goal: 'Find a page with file upload functionality (human will provide file)',
        startUrl: 'https://rtionline.gov.in',
        successCriteria: [
            { type: 'element_present', selector: 'input[type="file"]' },
        ],
        maxSteps: 10,
        category: 'form',
        difficulty: 'hard',
        tier: 'TIER_6_FILE_OPS',
        expectedHITL: true,
        domainType: 'government',
        challenges: ['file_upload', 'form_validation'],
    },
];

// ============ Aggregated Task Lists ============

export const ALL_TIERED_TASKS: TieredTask[] = [
    ...TIER_1_TASKS,
    ...TIER_2_TASKS,
    ...TIER_3_TASKS,
    ...TIER_4_TASKS,
    ...TIER_5_TASKS,
    ...TIER_6_TASKS,
];

export const TIER_TASK_MAP: Record<TaskTier, TieredTask[]> = {
    TIER_1_STATIC: TIER_1_TASKS,
    TIER_2_FORMS: TIER_2_TASKS,
    TIER_3_MODALS: TIER_3_TASKS,
    TIER_4_AUTH: TIER_4_TASKS,
    TIER_5_CAPTCHA_OTP: TIER_5_TASKS,
    TIER_6_FILE_OPS: TIER_6_TASKS,
};

/**
 * Expected success rates per tier (Phase 13 validation targets)
 */
export const EXPECTED_SUCCESS_RATES: Record<TaskTier, { min: number; max: number }> = {
    TIER_1_STATIC: { min: 70, max: 90 },
    TIER_2_FORMS: { min: 50, max: 70 },
    TIER_3_MODALS: { min: 30, max: 50 },
    TIER_4_AUTH: { min: 20, max: 40 }, // HITL expected
    TIER_5_CAPTCHA_OTP: { min: 10, max: 30 }, // HITL heavy
    TIER_6_FILE_OPS: { min: 10, max: 30 }, // HITL heavy
};

/**
 * Get tasks for a specific domain
 */
export function getTasksByDomain(domain: string): TieredTask[] {
    return ALL_TIERED_TASKS.filter(t => t.domainType === domain);
}

/**
 * Get tasks that don't require HITL
 */
export function getAutonomousTasks(): TieredTask[] {
    return ALL_TIERED_TASKS.filter(t => !t.expectedHITL);
}

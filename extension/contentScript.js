// Content Script - DOM Access, Event Capture, and Execution
// Implements Layer 1 (DOM & Browser State) and Layer 2 (User Events)

console.log('[Opero] Content script loaded');

// ============ State Management ============

let userState = {
    cursor: { x: 0, y: 0 },
    focusedElement: null,
    focusedLabel: null,
    lastAction: {
        type: null,
        selector: null,
        value: null,
        timestamp: Date.now()
    },
    isTyping: false,
    scrollDirection: null
};

let lastScrollY = window.scrollY;
let typingTimeout = null;

// ============ Agent Presence Border ============

// Agent state - single source of truth
let currentAgentState = 'idle';
let agentBorder = null;
let spotlightedElement = null;

// Supported websites - Opero can fully automate these
const SUPPORTED_SITES = [
    'rtionline.gov.in',
    'rti.gov.in',
    'rtimis.gov.in',
    'cic.gov.in'
];

// Check if current site is supported
function isSupportedSite() {
    const hostname = window.location.hostname.toLowerCase();
    return SUPPORTED_SITES.some(site => hostname.includes(site));
}

// Create persistent agent border overlay (only on supported sites)
function createAgentBorder() {
    // Only show border on supported sites
    if (!isSupportedSite()) {
        console.log('[Opero] Non-supported site - border not shown');
        return;
    }

    if (document.getElementById('opero-agent-border')) {
        agentBorder = document.getElementById('opero-agent-border');
        return;
    }

    agentBorder = document.createElement('div');
    agentBorder.id = 'opero-agent-border';
    agentBorder.className = 'opero-supported';
    currentAgentState = 'supported';

    document.body.appendChild(agentBorder);
    console.log('[Opero] Supported site detected! Agent presence border created.');
    showSupportedNotification();
}

// Show notification for supported sites
function showSupportedNotification() {
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'opero-supported-notification';
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #a855f7, #ec4899);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 8px 32px rgba(168, 85, 247, 0.4);
            z-index: 2147483647;
            display: flex;
            align-items: center;
            gap: 12px;
            animation: operoSlideIn 0.5s ease-out;
            pointer-events: auto;
            cursor: pointer;
        ">
            <span style="font-size: 24px;">✨</span>
            <div>
                <div style="font-weight: 600; margin-bottom: 2px;">Opero Ready!</div>
                <div style="opacity: 0.9; font-size: 12px;">This site is fully supported. Click the Opero button to get started.</div>
            </div>
        </div>
    `;

    // Add slide-in animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes operoSlideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes operoSlideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(notification);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const notif = document.getElementById('opero-supported-notification');
        if (notif) {
            notif.firstElementChild.style.animation = 'operoSlideOut 0.3s ease-in forwards';
            setTimeout(() => notif.remove(), 300);
        }
    }, 5000);

    // Click to dismiss
    notification.addEventListener('click', () => {
        notification.firstElementChild.style.animation = 'operoSlideOut 0.3s ease-in forwards';
        setTimeout(() => notification.remove(), 300);
    });
}

// Set agent visual state
function setAgentState(state) {
    if (!agentBorder) {
        createAgentBorder();
    }

    const validStates = ['idle', 'active', 'paused', 'error', 'supported'];
    if (!validStates.includes(state)) {
        console.warn('[Opero] Invalid agent state:', state);
        return;
    }

    currentAgentState = state;
    agentBorder.className = `opero-${state}`;
    console.log('[Opero] Agent state changed to:', state);

    // Error state: flash red then return to paused
    if (state === 'error') {
        setTimeout(() => {
            if (currentAgentState === 'error') {
                setAgentState('paused');
            }
        }, 500);
    }
}

// Get current agent state
function getAgentState() {
    return currentAgentState;
}

// Show spotlight on element being acted upon
function showElementSpotlight(element) {
    if (!element) return;

    // Remove existing spotlight
    removeElementSpotlight();

    // Add spotlight class
    element.classList.add('opero-spotlight');
    spotlightedElement = element;
}

// Remove element spotlight
function removeElementSpotlight() {
    if (spotlightedElement) {
        spotlightedElement.classList.remove('opero-spotlight');
        spotlightedElement = null;
    }
}

// ============ Floating Button ============

function createFloatingButton() {
    // Only show floating button on supported sites
    if (!isSupportedSite()) {
        console.log('[Opero] Non-supported site - floating button not shown');
        return;
    }

    if (document.getElementById('opero-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'opero-fab';
    fab.innerHTML = '✨';
    fab.title = 'Open Opero Assistant';

    const tooltip = document.createElement('div');
    tooltip.id = 'opero-fab-tooltip';
    tooltip.textContent = 'Opero Assistant';

    document.body.appendChild(fab);
    document.body.appendChild(tooltip);

    fab.addEventListener('click', () => {
        try {
            chrome.runtime.sendMessage({ type: 'OPEN_PANEL' }, () => {
                if (chrome.runtime.lastError) {
                    console.log('[Opero] Panel message:', chrome.runtime.lastError.message);
                }
            });
        } catch (e) {
            console.log('[Opero] Extension context invalidated, please refresh the page');
            fab.remove();
            tooltip.remove();
        }
    });
}

// Wait for DOM ready before injecting UI elements
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        createFloatingButton();
        createAgentBorder();
    });
} else {
    createFloatingButton();
    createAgentBorder();
}

// Notify background script of connection
chrome.runtime.sendMessage({ type: 'CONNECT' }, (response) => {
    console.log('[Opero] Connection response:', response);
});

// ============ Layer 1: DOM Scanner ============

function scanBrowserContext() {
    return {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollY: window.scrollY,
            scrollHeight: document.documentElement.scrollHeight
        },
        visibleInputs: scanInputs(),
        buttons: scanButtons(),
        links: scanLinks(),
        formsPresent: document.querySelectorAll('form').length > 0,
        formCount: document.querySelectorAll('form').length,
        timestamp: Date.now()
    };
}

function scanInputs() {
    const elements = document.querySelectorAll('input, textarea, select');

    return Array.from(elements)
        .map(el => {
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 &&
                rect.top < window.innerHeight && rect.bottom > 0;

            if (!isVisible) return null;

            return {
                tag: el.tagName.toLowerCase(),
                type: el.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
                name: el.getAttribute('name') || '',
                id: el.id || '',
                label: findLabel(el),
                selector: generateSelector(el),
                value: el.value || '',
                placeholder: el.getAttribute('placeholder') || '',
                disabled: el.disabled || false,
                required: el.required || el.hasAttribute('required'),
                position: { x: Math.round(rect.x), y: Math.round(rect.y) }
            };
        })
        .filter(Boolean);
}

function scanButtons() {
    const elements = document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]');

    return Array.from(elements)
        .map(el => {
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 &&
                rect.top < window.innerHeight && rect.bottom > 0;

            if (!isVisible) return null;

            return {
                text: el.textContent?.trim() || el.value || el.getAttribute('aria-label') || '',
                selector: generateSelector(el),
                type: el.getAttribute('type') || 'button',
                disabled: el.disabled || false,
                position: { x: Math.round(rect.x), y: Math.round(rect.y) }
            };
        })
        .filter(Boolean);
}

function scanLinks() {
    const elements = document.querySelectorAll('a[href]');

    return Array.from(elements)
        .slice(0, 50) // Limit to 50 links
        .map(el => {
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 &&
                rect.top < window.innerHeight && rect.bottom > 0;

            if (!isVisible) return null;

            return {
                text: el.textContent?.trim().slice(0, 100) || '',
                href: el.href || '',
                selector: generateSelector(el),
                position: { x: Math.round(rect.x), y: Math.round(rect.y) }
            };
        })
        .filter(Boolean);
}

function findLabel(element) {
    // Check for associated label via for attribute
    if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) return label.textContent.trim();
    }

    // Check parent label
    const parentLabel = element.closest('label');
    if (parentLabel) {
        // Get text content excluding the input element's text
        const clone = parentLabel.cloneNode(true);
        const inputs = clone.querySelectorAll('input, textarea, select');
        inputs.forEach(i => i.remove());
        const text = clone.textContent.trim();
        if (text) return text;
    }

    // Check aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // Check aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent.trim();
    }

    // Check placeholder
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return placeholder;

    // Check name attribute (format it nicely)
    const name = element.getAttribute('name');
    if (name) return name.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

    // Check preceding text/label
    const prev = element.previousElementSibling;
    if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN')) {
        return prev.textContent.trim();
    }

    return '';
}

function generateSelector(element) {
    // Try ID first (most reliable)
    if (element.id) {
        return `#${CSS.escape(element.id)}`;
    }

    // Try name attribute
    if (element.name) {
        const selector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
        if (document.querySelectorAll(selector).length === 1) {
            return selector;
        }
    }

    // Try data attributes
    const dataTestId = element.getAttribute('data-testid') || element.getAttribute('data-test-id');
    if (dataTestId) {
        return `[data-testid="${CSS.escape(dataTestId)}"]`;
    }

    // Build path from ancestors
    let path = [];
    let current = element;

    while (current && current !== document.body && path.length < 5) {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
            path.unshift(`#${CSS.escape(current.id)}`);
            break;
        }

        if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\s+/).slice(0, 2);
            if (classes.length > 0 && classes[0]) {
                selector += '.' + classes.map(c => CSS.escape(c)).join('.');
            }
        }

        // Add nth-child for uniqueness if needed
        const parent = current.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-of-type(${index})`;
            }
        }

        path.unshift(selector);
        current = current.parentElement;
    }

    return path.join(' > ');
}

// ============ Layer 2: User Event Tracking ============

// Throttle helper
function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Mouse move tracking (throttled)
document.addEventListener('mousemove', throttle((e) => {
    userState.cursor = { x: e.clientX, y: e.clientY };
}, 100));

// Click tracking
document.addEventListener('click', (e) => {
    const target = e.target;
    userState.lastAction = {
        type: 'CLICK',
        selector: generateSelector(target),
        timestamp: Date.now()
    };
    console.log('[Opero] Event: CLICK', userState.lastAction.selector);
});

// Focus tracking
document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        userState.focusedElement = generateSelector(target);
        userState.focusedLabel = findLabel(target);
        userState.lastAction = {
            type: 'FOCUS',
            selector: userState.focusedElement,
            timestamp: Date.now()
        };
        console.log('[Opero] Event: FOCUS', userState.focusedLabel || userState.focusedElement);
    }
});

// Focus out tracking
document.addEventListener('focusout', (e) => {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        userState.focusedElement = null;
        userState.focusedLabel = null;
        userState.isTyping = false;
    }
});

// Input tracking (with debounced typing detection)
document.addEventListener('input', (e) => {
    const target = e.target;
    userState.isTyping = true;
    userState.lastAction = {
        type: 'INPUT',
        selector: generateSelector(target),
        value: target.value?.slice(-20), // Last 20 chars only
        timestamp: Date.now()
    };

    // Clear typing flag after inactivity
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        userState.isTyping = false;
    }, 1000);
});

// Scroll tracking (throttled)
document.addEventListener('scroll', throttle(() => {
    const currentScrollY = window.scrollY;
    userState.scrollDirection = currentScrollY > lastScrollY ? 'down' : 'up';
    lastScrollY = currentScrollY;

    userState.lastAction = {
        type: 'SCROLL',
        selector: null,
        timestamp: Date.now()
    };
}, 150));

// Get current user state
function getUserState() {
    return { ...userState };
}

// Get full context (DOM + User)
function getFullContext() {
    return {
        browser: scanBrowserContext(),
        user: getUserState(),
        timestamp: Date.now()
    };
}

// ============ Message Handler ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Opero] Content script received:', message.type);

    switch (message.type) {
        case 'PING':
            sendResponse({ success: true, pong: true });
            break;

        case 'EXECUTE_STEP':
            executeStep(message.step).then(sendResponse);
            break;

        case 'SCAN_DOM':
            const elements = scanInputs();
            sendResponse({ success: true, elements });
            break;

        case 'GET_BROWSER_CONTEXT':
            const browserContext = scanBrowserContext();
            sendResponse({ success: true, context: browserContext });
            break;

        case 'GET_USER_STATE':
            sendResponse({ success: true, state: getUserState() });
            break;

        case 'GET_FULL_CONTEXT':
            const fullContext = getFullContext();
            sendResponse({ success: true, ...fullContext });
            break;

        case 'SET_AGENT_STATE':
            setAgentState(message.state);
            sendResponse({ success: true, state: currentAgentState });
            break;

        case 'GET_AGENT_STATE':
            sendResponse({ success: true, state: currentAgentState });
            break;

        default:
            sendResponse({ success: false, error: 'Unknown message type' });
    }

    return true; // Keep channel open
});

// ============ DOM Executor ============

async function executeStep(step) {
    console.log('[Opero] Executing step:', step);

    // Set active state when starting execution
    setAgentState('active');

    try {
        let result;

        switch (step.action) {
            case 'navigate':
                result = await executeNavigate(step);
                break;

            case 'type':
                result = await executeType(step);
                break;

            case 'click':
                result = await executeClick(step);
                break;

            case 'select':
                result = await executeSelect(step);
                break;

            case 'scroll':
                result = await executeScroll(step);
                break;

            case 'wait':
                result = await executeWait(step);
                break;

            case 'pause':
                setAgentState('paused');
                result = { success: true, paused: true, message: step.description };
                break;

            default:
                result = { success: false, error: `Unknown action: ${step.action}` };
        }

        // Remove spotlight after action
        removeElementSpotlight();

        // Set state based on result (unless paused)
        if (step.action !== 'pause') {
            if (result.success) {
                // Return to 'supported' state on supported sites, 'idle' otherwise
                setAgentState(isSupportedSite() ? 'supported' : 'idle');
            } else {
                setAgentState('error');
            }
        }

        return result;
    } catch (error) {
        console.error('[Opero] Step execution error:', error);
        removeElementSpotlight();
        setAgentState('error');
        return { success: false, error: error.message };
    }
}

async function executeNavigate(step) {
    if (step.url) {
        window.location.href = step.url;
        return { success: true };
    }
    return { success: false, error: 'No URL provided' };
}

async function executeType(step) {
    const element = findElement(step.selector, step.label);

    if (!element) {
        return { success: false, error: `Element not found: ${step.selector || step.label}` };
    }

    // Scroll into view and spotlight
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showElementSpotlight(element);
    await delay(300);

    // Focus
    element.focus();
    await delay(100);

    // Clear existing value
    element.value = '';

    // Type character by character for visual effect
    const value = step.value || '';
    for (let i = 0; i < value.length; i++) {
        element.value += value[i];
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(30 + Math.random() * 20); // Natural typing speed
    }

    // Dispatch change event
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // Visual feedback
    highlightElement(element);

    return { success: true };
}

async function executeClick(step) {
    const element = findElement(step.selector, step.label);

    if (!element) {
        return { success: false, error: `Element not found: ${step.selector || step.label}` };
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showElementSpotlight(element);
    await delay(300);

    highlightElement(element);
    element.click();

    return { success: true };
}

async function executeSelect(step) {
    const element = findElement(step.selector, step.label);

    if (!element || element.tagName.toLowerCase() !== 'select') {
        return { success: false, error: `Select element not found: ${step.selector || step.label}` };
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showElementSpotlight(element);
    await delay(300);

    // Find option by value or text
    const options = Array.from(element.options);
    const option = options.find(opt =>
        opt.value.toLowerCase() === step.value?.toLowerCase() ||
        opt.text.toLowerCase().includes(step.value?.toLowerCase() || '')
    );

    if (option) {
        element.value = option.value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        highlightElement(element);
        return { success: true };
    }

    return { success: false, error: `Option not found: ${step.value}` };
}

async function executeScroll(step) {
    const pixels = parseInt(step.value) || 300;
    window.scrollBy({ top: pixels, behavior: 'smooth' });
    await delay(500);
    return { success: true };
}

async function executeWait(step) {
    const ms = parseInt(step.value) || 1000;
    await delay(ms);
    return { success: true };
}

// ============ Helpers ============

function findElement(selector, label) {
    // Try selector first
    if (selector) {
        try {
            const el = document.querySelector(selector);
            if (el) return el;
        } catch (e) {
            // Invalid selector, continue
        }

        // Try variations
        const selectors = selector.split(', ');
        for (const sel of selectors) {
            try {
                const found = document.querySelector(sel.trim());
                if (found) return found;
            } catch (e) {
                // Invalid selector, continue
            }
        }
    }

    // Try to find by label
    if (label) {
        const labelLower = label.toLowerCase();

        // Find by label text
        const labels = document.querySelectorAll('label');
        for (const lbl of labels) {
            if (lbl.textContent.toLowerCase().includes(labelLower)) {
                if (lbl.htmlFor) {
                    const el = document.getElementById(lbl.htmlFor);
                    if (el) return el;
                }
                const input = lbl.querySelector('input, textarea, select');
                if (input) return input;
            }
        }

        // Find by placeholder
        const byPlaceholder = document.querySelector(
            `input[placeholder*="${label}" i], textarea[placeholder*="${label}" i]`
        );
        if (byPlaceholder) return byPlaceholder;

        // Find by name
        const byName = document.querySelector(
            `input[name*="${label}" i], textarea[name*="${label}" i], select[name*="${label}" i]`
        );
        if (byName) return byName;

        // Find by aria-label
        const byAria = document.querySelector(
            `[aria-label*="${label}" i]`
        );
        if (byAria) return byAria;
    }

    return null;
}

function highlightElement(element) {
    const originalStyle = element.style.cssText;
    element.style.cssText += '; outline: 3px solid #a855f7 !important; outline-offset: 2px; transition: outline 0.2s ease;';

    setTimeout(() => {
        element.style.cssText = originalStyle;
    }, 1500);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ CAPTCHA Handling ============

// Common CAPTCHA-related keywords and patterns
const CAPTCHA_KEYWORDS = ['captcha', 'verification', 'verify', 'security code', 'security-code'];
const CAPTCHA_IMAGE_SELECTORS = [
    'img[src*="captcha"]',
    'img[id*="captcha"]',
    'img[class*="captcha"]',
    'img[alt*="captcha"]',
    'img[alt*="verification"]',
    '#captchaImage',
    '.captcha-image',
    'img[src*="securimage"]',
    'img[src*="verify"]'
];

// Detect CAPTCHA elements on the page
function detectCaptchaOnPage() {
    const result = {
        found: false,
        captchaImage: null,
        captchaInput: null,
        type: 'unknown'
    };

    // Look for CAPTCHA images
    for (const selector of CAPTCHA_IMAGE_SELECTORS) {
        const img = document.querySelector(selector);
        if (img && img.offsetWidth > 0 && img.offsetHeight > 0) {
            result.found = true;
            result.captchaImage = img;
            result.type = 'text';
            break;
        }
    }

    // Look for CAPTCHA input fields
    const allInputs = document.querySelectorAll('input[type="text"]');
    for (const input of allInputs) {
        const inputId = (input.id || '').toLowerCase();
        const inputName = (input.name || '').toLowerCase();
        const inputPlaceholder = (input.placeholder || '').toLowerCase();
        const labelText = findLabel(input).toLowerCase();

        if (CAPTCHA_KEYWORDS.some(kw =>
            inputId.includes(kw) ||
            inputName.includes(kw) ||
            inputPlaceholder.includes(kw) ||
            labelText.includes(kw)
        )) {
            result.captchaInput = input;
            if (!result.found) {
                result.found = true;
                result.type = 'text';
            }
            break;
        }
    }

    // Check for reCAPTCHA
    if (document.querySelector('.g-recaptcha, [data-sitekey], iframe[src*="recaptcha"]')) {
        result.found = true;
        result.type = 'recaptcha';
    }

    // Check for hCaptcha
    if (document.querySelector('.h-captcha, [data-hcaptcha-sitekey], iframe[src*="hcaptcha"]')) {
        result.found = true;
        result.type = 'hcaptcha';
    }

    return result;
}

// Capture CAPTCHA image as base64
async function captureCaptchaImage(captchaElement) {
    if (!captchaElement) return null;

    try {
        // If it's an image element, we can capture it directly
        if (captchaElement.tagName === 'IMG') {
            // Create canvas and draw image
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Wait for image to load if needed
            if (!captchaElement.complete) {
                await new Promise((resolve, reject) => {
                    captchaElement.onload = resolve;
                    captchaElement.onerror = reject;
                    setTimeout(reject, 5000);
                });
            }

            canvas.width = captchaElement.naturalWidth || captchaElement.width;
            canvas.height = captchaElement.naturalHeight || captchaElement.height;

            // Handle CORS - try to draw, if fails use fetch
            try {
                ctx.drawImage(captchaElement, 0, 0);
                return canvas.toDataURL('image/png');
            } catch (corsError) {
                // CORS issue - request screenshot from background
                console.log('[Opero] CORS issue with CAPTCHA image, requesting screenshot');
                return await requestCaptchaScreenshot(captchaElement);
            }
        }

        // For other elements, request screenshot from background
        return await requestCaptchaScreenshot(captchaElement);
    } catch (error) {
        console.error('[Opero] Failed to capture CAPTCHA image:', error);
        return null;
    }
}

// Request background to capture screenshot of CAPTCHA area
async function requestCaptchaScreenshot(element) {
    return new Promise((resolve) => {
        const rect = element.getBoundingClientRect();

        chrome.runtime.sendMessage({
            type: 'CAPTURE_SCREENSHOT',
            bounds: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            }
        }, (response) => {
            if (response?.success && response.screenshot) {
                resolve(response.screenshot);
            } else {
                resolve(null);
            }
        });
    });
}

// Solve CAPTCHA using vision API
async function solveCaptchaWithVision(captchaImageBase64) {
    const API_URL = 'http://localhost:3000/api/ai';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'solve_captcha',
                data: { captchaScreenshot: captchaImageBase64 }
            })
        });

        const result = await response.json();
        console.log('[Opero] CAPTCHA solve response:', result);
        return result;
    } catch (error) {
        console.error('[Opero] CAPTCHA solve API error:', error);
        return { solved: false, reason: 'API request failed' };
    }
}

// Fill CAPTCHA solution into input field
async function fillCaptchaSolution(captchaInput, solution) {
    if (!captchaInput || !solution) return false;

    try {
        // Scroll into view
        captchaInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(300);

        // Focus and clear
        captchaInput.focus();
        captchaInput.value = '';

        // Type solution
        for (let i = 0; i < solution.length; i++) {
            captchaInput.value += solution[i];
            captchaInput.dispatchEvent(new Event('input', { bubbles: true }));
            await delay(50);
        }

        captchaInput.dispatchEvent(new Event('change', { bubbles: true }));
        highlightElement(captchaInput);

        console.log('[Opero] CAPTCHA solution filled:', solution);
        return true;
    } catch (error) {
        console.error('[Opero] Failed to fill CAPTCHA:', error);
        return false;
    }
}

// Main CAPTCHA handling function
async function handleCaptcha() {
    console.log('[Opero] Checking for CAPTCHA...');

    const detection = detectCaptchaOnPage();

    if (!detection.found) {
        return { success: true, message: 'No CAPTCHA detected' };
    }

    console.log('[Opero] CAPTCHA detected:', detection.type);

    // Can't solve reCAPTCHA or hCaptcha
    if (detection.type === 'recaptcha' || detection.type === 'hcaptcha') {
        setAgentState('paused');
        return {
            success: false,
            paused: true,
            message: `${detection.type} detected - requires manual completion`
        };
    }

    // Try to solve text-based CAPTCHA
    if (detection.captchaImage && detection.captchaInput) {
        setAgentState('active');
        showElementSpotlight(detection.captchaImage);

        // Capture CAPTCHA image
        const imageData = await captureCaptchaImage(detection.captchaImage);

        if (!imageData) {
            removeElementSpotlight();
            setAgentState('paused');
            return {
                success: false,
                paused: true,
                message: 'Could not capture CAPTCHA image'
            };
        }

        // Solve using vision
        const solveResult = await solveCaptchaWithVision(imageData);
        removeElementSpotlight();

        if (solveResult.solved && solveResult.solution) {
            // Fill the solution
            showElementSpotlight(detection.captchaInput);
            const filled = await fillCaptchaSolution(detection.captchaInput, solveResult.solution);
            removeElementSpotlight();

            if (filled) {
                setAgentState(isSupportedSite() ? 'supported' : 'idle');
                return {
                    success: true,
                    message: `CAPTCHA solved: ${solveResult.solution}`,
                    solution: solveResult.solution
                };
            }
        }

        // Solving failed
        setAgentState('paused');
        return {
            success: false,
            paused: true,
            message: solveResult.reason || 'Could not solve CAPTCHA automatically'
        };
    }

    // CAPTCHA found but can't handle it
    setAgentState('paused');
    return {
        success: false,
        paused: true,
        message: 'CAPTCHA detected but cannot be handled automatically'
    };
}

// Add CAPTCHA message handlers to the existing message listener
// This extends the message handler defined earlier
const originalOnMessage = chrome.runtime.onMessage.hasListener;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'HANDLE_CAPTCHA') {
        handleCaptcha().then(sendResponse);
        return true;
    }
    if (message.type === 'DETECT_CAPTCHA') {
        const result = detectCaptchaOnPage();
        sendResponse({ success: true, ...result });
        return true;
    }
});

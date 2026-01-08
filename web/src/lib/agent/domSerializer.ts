/**
 * DOM Serializer - Serializes DOM state for LLM consumption
 * Adapted from browser-use/browser_use/dom/serializer/serializer.py
 */

import type {
    InteractiveElement,
    DOMSelectorMap,
    EnhancedDOMTreeNode,
    DOMRect,
} from './domViews';
import { NodeType, inferAriaRole, capTextLength } from './domViews';
import type { BrowserState, TabInfo, ViewportInfo } from './agentViews';

// Disabled elements that should be skipped
const DISABLED_ELEMENTS = new Set(['style', 'script', 'head', 'meta', 'link', 'title', 'noscript']);

// SVG child elements to skip
const SVG_ELEMENTS = new Set([
    'path', 'rect', 'g', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'use', 'defs', 'clipPath', 'mask', 'pattern', 'image', 'text', 'tspan',
]);

// Interactive element selectors
const INTERACTIVE_SELECTORS = [
    'a[href]', 'button', 'input', 'textarea', 'select',
    '[role="button"]', '[role="link"]', '[role="checkbox"]',
    '[role="textbox"]', '[role="combobox"]', '[role="menuitem"]',
    '[role="tab"]', '[role="switch"]', '[role="slider"]',
    '[tabindex]:not([tabindex="-1"])', '[onclick]', '[contenteditable="true"]',
];

/**
 * Serialize browser state for LLM consumption
 * Matches the format used in browser-use system prompts
 */
export function serializeBrowserStateForLLM(state: BrowserState): string {
    const lines: string[] = [];

    // Current URL
    lines.push(`Current URL: ${state.url}`);

    // Open tabs
    if (state.tabs.length > 0) {
        const tabsStr = state.tabs.map(t =>
            `[${t.id}]${t.active ? '*' : ''} ${capTextLength(t.title, 30)}`
        ).join(' | ');
        lines.push(`Open Tabs: ${tabsStr}`);
    }

    lines.push('');
    lines.push('Interactive Elements:');

    // Format elements in browser-use style: [index]<type attribute='value'>text</type>
    for (const el of state.interactiveElements) {
        const line = formatElementForLLM(el);
        lines.push(line);
    }

    // Scroll info
    if (state.viewport) {
        const { scrollY, scrollHeight, height } = state.viewport;
        const scrollableHeight = scrollHeight - height;

        if (scrollableHeight > 0) {
            const pagesAbove = (scrollY / height).toFixed(1);
            const pagesBelow = ((scrollableHeight - scrollY) / height).toFixed(1);
            const scrollPercent = Math.round((scrollY / scrollableHeight) * 100);

            if (parseFloat(pagesBelow) > 0 || parseFloat(pagesAbove) > 0) {
                lines.push('');
                lines.push(`[Scroll: ${pagesAbove} pages above, ${pagesBelow} pages below (${scrollPercent}%)]`);
            }
        }
    }

    return lines.join('\n');
}

/**
 * Format a single element for LLM display
 * Matches browser-use format: [index]<type attr='value'>text</type>
 */
export function formatElementForLLM(el: InteractiveElement): string {
    const prefix = el.isNew ? '*' : '';
    const indent = '';  // Could add indentation for hierarchy

    // Build attribute string
    const attrParts: string[] = [];

    // Include key attributes
    const relevantAttrs = ['aria-label', 'placeholder', 'value', 'name', 'type', 'href'];
    for (const attr of relevantAttrs) {
        const value = el.attributes[attr];
        if (value && value.length > 0 && value.length < 50) {
            attrParts.push(`${attr}='${capTextLength(value, 30)}'`);
        }
    }

    const attrStr = attrParts.length > 0 ? ' ' + attrParts.join(' ') : '';
    const text = capTextLength(el.text, 50);

    // Format: *[1]<button aria-label='Submit'>Submit</button>
    return `${indent}${prefix}[${el.index}]<${el.tagName}${attrStr}>${text}</${el.tagName}>`;
}

/**
 * Build interactive elements from raw DOM data
 * This is the main entry point for the extension's DOM scan
 */
export function buildInteractiveElements(
    elements: RawElementData[],
    previousElements?: InteractiveElement[]
): { elements: InteractiveElement[]; selectorMap: DOMSelectorMap } {
    const interactiveElements: InteractiveElement[] = [];
    const selectorMap: DOMSelectorMap = {};

    // Track previous backend IDs to mark new elements
    const previousBackendIds = new Set(
        previousElements?.map(e => e.attributes['data-backend-id']) || []
    );

    let index = 1;

    for (const rawEl of elements) {
        // Skip non-visible elements
        if (!isElementVisible(rawEl)) continue;

        // Skip disabled elements
        if (DISABLED_ELEMENTS.has(rawEl.tagName.toLowerCase())) continue;

        // Skip SVG internals
        if (SVG_ELEMENTS.has(rawEl.tagName.toLowerCase())) continue;

        const role = inferAriaRole(
            rawEl.tagName,
            rawEl.attributes.type,
            rawEl.attributes.role
        );

        const interactionType = inferInteractionType(rawEl.tagName, rawEl.attributes.type, role);

        const el: InteractiveElement = {
            index,
            tagName: rawEl.tagName.toLowerCase(),
            role,
            text: capTextLength(rawEl.textContent, 100),
            value: rawEl.attributes.value,
            placeholder: rawEl.attributes.placeholder,
            attributes: rawEl.attributes,
            rect: rawEl.rect,
            isNew: rawEl.backendNodeId === undefined || !previousBackendIds.has(rawEl.backendNodeId.toString()),
            interactionType,
        };

        interactiveElements.push(el);

        // Add to selector map with the element info needed for action execution
        selectorMap[index] = createEnhancedNode(rawEl, index);

        index++;
    }

    return { elements: interactiveElements, selectorMap };
}

/**
 * Raw element data from DOM scan
 */
export interface RawElementData {
    tagName: string;
    textContent: string;
    attributes: Record<string, string>;
    rect: DOMRect;
    selector: string;
    backendNodeId?: number;
    xpath?: string;
    parentId?: number;
    isVisible: boolean;
}

/**
 * Check if element is visible
 */
function isElementVisible(el: RawElementData): boolean {
    if (!el.isVisible) return false;
    if (!el.rect) return false;
    return el.rect.width > 0 && el.rect.height > 0;
}

/**
 * Infer interaction type from element properties
 */
function inferInteractionType(
    tagName: string,
    type?: string,
    role?: string
): InteractiveElement['interactionType'] {
    const tag = tagName.toLowerCase();
    const inputType = type?.toLowerCase();

    // Scroll containers
    if (role === 'scrollbar' || role === 'slider') return 'scroll';

    // Input elements
    if (tag === 'input') {
        if (inputType === 'checkbox' || inputType === 'radio') return 'toggle';
        if (inputType === 'button' || inputType === 'submit' || inputType === 'reset') return 'click';
        return 'input';
    }

    if (tag === 'textarea') return 'input';
    if (tag === 'select') return 'select';

    // Links
    if (tag === 'a') return 'navigate';

    // Default to click for buttons and other interactive elements
    return 'click';
}

/**
 * Create an enhanced node from raw element data
 */
function createEnhancedNode(raw: RawElementData, index: number): EnhancedDOMTreeNode {
    return {
        nodeId: index,
        backendNodeId: raw.backendNodeId || index,
        nodeType: NodeType.ELEMENT_NODE,
        nodeName: raw.tagName.toUpperCase(),
        nodeValue: '',
        attributes: {
            ...raw.attributes,
            'data-opero-index': index.toString(),
        },
        isScrollable: null,
        isVisible: raw.isVisible,
        absolutePosition: raw.rect,
        targetId: '',
        frameId: null,
        sessionId: null,
        contentDocument: null,
        shadowRootType: null,
        shadowRoots: null,
        parentNode: null,
        childrenNodes: null,
        axNode: null,
        snapshotNode: {
            isClickable: true,
            cursorStyle: null,
            bounds: raw.rect,
            clientRects: raw.rect,
            scrollRects: null,
            computedStyles: null,
            paintOrder: null,
        },
        compoundChildren: [],
        uuid: crypto.randomUUID(),
    };
}

/**
 * Generate a 4-character tab ID
 */
export function generateTabId(): string {
    return Math.random().toString(36).substring(2, 6);
}

/**
 * Create browser state from extension message data
 */
export function createBrowserState(data: {
    url: string;
    title: string;
    viewport: ViewportInfo;
    elements: RawElementData[];
    tabs?: TabInfo[];
    screenshot?: string;
    previousState?: BrowserState;
}): BrowserState {
    const { elements, selectorMap } = buildInteractiveElements(
        data.elements,
        data.previousState?.interactiveElements
    );

    return {
        url: data.url,
        title: data.title,
        timestamp: Date.now(),
        interactiveElements: elements,
        selectorMap,
        viewport: data.viewport,
        tabs: data.tabs || [{ id: generateTabId(), title: data.title, url: data.url, active: true }],
        metadata: {
            formCount: elements.filter(e => e.tagName === 'form').length,
            iframeCount: 0, // Would need to be passed from extension
            hasScrollableContent: data.viewport.scrollHeight > data.viewport.height,
            isLoading: false,
        },
        screenshot: data.screenshot,
    };
}

/**
 * Format agent history for LLM context
 * Matches browser-use's history format in system prompt
 */
export function formatHistoryForLLM(
    history: Array<{
        stepNumber: number;
        evaluation: string;
        memory: string;
        nextGoal: string;
        actionResults: Array<{ action: string; success: boolean; error?: string }>;
    }>,
    maxSteps: number = 10
): string {
    const recent = history.slice(-maxSteps);

    return recent.map(step => `
<step_${step.stepNumber}>
Evaluation of Previous Step: ${step.evaluation}
Memory: ${step.memory}
Next Goal: ${step.nextGoal}
Action Results: ${step.actionResults.map(r =>
        `${r.action} -> ${r.success ? 'success' : `failed: ${r.error || 'unknown'}`}`
    ).join(', ')}
</step_${step.stepNumber}>
    `.trim()).join('\n\n');
}

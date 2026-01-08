/**
 * DOM Views - Types for DOM observation
 * Adapted from browser-use/browser_use/dom/views.py
 */

// Node types based on DOM specification (matching browser-use)
export enum NodeType {
    ELEMENT_NODE = 1,
    ATTRIBUTE_NODE = 2,
    TEXT_NODE = 3,
    CDATA_SECTION_NODE = 4,
    ENTITY_REFERENCE_NODE = 5,
    ENTITY_NODE = 6,
    PROCESSING_INSTRUCTION_NODE = 7,
    COMMENT_NODE = 8,
    DOCUMENT_NODE = 9,
    DOCUMENT_TYPE_NODE = 10,
    DOCUMENT_FRAGMENT_NODE = 11,
    NOTATION_NODE = 12,
}

// DOMRect for element positioning
export interface DOMRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Attributes to include in serialization (matching browser-use DEFAULT_INCLUDE_ATTRIBUTES)
export const DEFAULT_INCLUDE_ATTRIBUTES = [
    'title',
    'type',
    'checked',
    'id',
    'name',
    'role',
    'value',
    'placeholder',
    'data-date-format',
    'alt',
    'aria-label',
    'aria-expanded',
    'data-state',
    'aria-checked',
    'aria-valuemin',
    'aria-valuemax',
    'aria-valuenow',
    'aria-placeholder',
    'pattern',
    'min',
    'max',
    'minlength',
    'maxlength',
    'step',
    'accept',
    'multiple',
    'inputmode',
    'autocomplete',
    'contenteditable',
    'disabled',
    'invalid',
    'required',
    'href',
] as const;

// Enhanced accessibility node (matching browser-use EnhancedAXNode)
export interface AXNode {
    axNodeId: string;
    ignored: boolean;
    role: string | null;
    name: string | null;
    description: string | null;
    properties: AXProperty[] | null;
    childIds: string[] | null;
}

export interface AXProperty {
    name: string;
    value: string | boolean | null;
}

// Snapshot node data for visibility and layout (matching browser-use EnhancedSnapshotNode)
export interface SnapshotNode {
    isClickable: boolean | null;
    cursorStyle: string | null;
    bounds: DOMRect | null;
    clientRects: DOMRect | null;
    scrollRects: DOMRect | null;
    computedStyles: Record<string, string> | null;
    paintOrder: number | null;
}

// Enhanced DOM tree node (matching browser-use EnhancedDOMTreeNode)
export interface EnhancedDOMTreeNode {
    // DOM Node data
    nodeId: number;
    backendNodeId: number;
    nodeType: NodeType;
    nodeName: string;
    nodeValue: string;
    attributes: Record<string, string>;
    isScrollable: boolean | null;
    isVisible: boolean | null;
    absolutePosition: DOMRect | null;

    // Frame data
    targetId: string;
    frameId: string | null;
    sessionId: string | null;
    contentDocument: EnhancedDOMTreeNode | null;

    // Shadow DOM
    shadowRootType: 'open' | 'closed' | null;
    shadowRoots: EnhancedDOMTreeNode[] | null;

    // Navigation
    parentNode: EnhancedDOMTreeNode | null;
    childrenNodes: EnhancedDOMTreeNode[] | null;

    // AX Node data
    axNode: AXNode | null;

    // Snapshot Node data
    snapshotNode: SnapshotNode | null;

    // Compound control child components
    compoundChildren: Record<string, any>[];

    // Unique identifier
    uuid: string;
}

// Simplified node for serialization (matching browser-use SimplifiedNode)
export interface SimplifiedNode {
    originalNode: EnhancedDOMTreeNode;
    children: SimplifiedNode[];
    shouldDisplay: boolean;
    isInteractive: boolean;
    isNew: boolean;
    ignoredByPaintOrder: boolean;
    excludedByParent: boolean;
    isShadowHost: boolean;
    isCompoundComponent: boolean;
}

// Selector map: index -> element details
export type DOMSelectorMap = Record<number, EnhancedDOMTreeNode>;

// Serialized DOM state (matching browser-use SerializedDOMState)
export interface SerializedDOMState {
    root: SimplifiedNode | null;
    selectorMap: DOMSelectorMap;
}

// Interactive element info for LLM (simplified format)
export interface InteractiveElement {
    index: number;
    tagName: string;
    role: string;
    text: string;
    value?: string;
    placeholder?: string;
    attributes: Record<string, string>;
    rect: DOMRect;
    isNew: boolean;
    interactionType: 'click' | 'input' | 'select' | 'toggle' | 'navigate' | 'scroll';
}

// Interacted element for history tracking (matching browser-use DOMInteractedElement)
export interface DOMInteractedElement {
    index: number;
    tagName: string;
    role: string | null;
    text: string;
    attributes: Record<string, string>;
    xpath: string;
}

// Helper functions

/**
 * Infer ARIA role from element tag and type
 * Matches browser-use's role inference logic
 */
export function inferAriaRole(tagName: string, type?: string, explicitRole?: string): string {
    if (explicitRole) return explicitRole;

    const tag = tagName.toLowerCase();
    const inputType = type?.toLowerCase();

    const roleMap: Record<string, string> = {
        'button': 'button',
        'a': 'link',
        'input': inputType === 'checkbox' ? 'checkbox' :
            inputType === 'radio' ? 'radio' :
                inputType === 'submit' ? 'button' :
                    inputType === 'button' ? 'button' :
                        inputType === 'range' ? 'slider' :
                            inputType === 'search' ? 'searchbox' :
                                'textbox',
        'textarea': 'textbox',
        'select': 'combobox',
        'option': 'option',
        'optgroup': 'group',
        'h1': 'heading',
        'h2': 'heading',
        'h3': 'heading',
        'h4': 'heading',
        'h5': 'heading',
        'h6': 'heading',
        'nav': 'navigation',
        'main': 'main',
        'aside': 'complementary',
        'footer': 'contentinfo',
        'header': 'banner',
        'form': 'form',
        'article': 'article',
        'section': 'region',
        'img': 'image',
        'table': 'table',
        'tr': 'row',
        'td': 'cell',
        'th': 'columnheader',
        'ul': 'list',
        'ol': 'list',
        'li': 'listitem',
        'dialog': 'dialog',
        'menu': 'menu',
        'menuitem': 'menuitem',
    };

    return roleMap[tag] || 'generic';
}

/**
 * Get accessible name for an element
 * Priority: aria-label > aria-labelledby > label[for] > inner text
 */
export function getAccessibleName(element: {
    getAttribute: (name: string) => string | null;
    textContent?: string | null;
    id?: string;
}): string {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
        // Would need to look up the element - return empty for now
        return '';
    }

    return element.textContent?.trim().slice(0, 100) || '';
}

/**
 * Cap text length for LLM tokenization
 * Matches browser-use cap_text_length utility
 */
export function capTextLength(text: string | null | undefined, maxLength: number = 100): string {
    if (!text) return '';
    const trimmed = text.trim();
    if (trimmed.length <= maxLength) return trimmed;
    return trimmed.slice(0, maxLength - 3) + '...';
}

/**
 * Generate XPath for a DOM element
 */
export function generateXPath(element: EnhancedDOMTreeNode): string {
    const segments: string[] = [];
    let current: EnhancedDOMTreeNode | null = element;

    while (current && (current.nodeType === NodeType.ELEMENT_NODE || current.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE)) {
        // Skip shadow roots
        if (current.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE) {
            current = current.parentNode;
            continue;
        }

        // Stop at iframe
        if (current.parentNode && current.parentNode.nodeName.toLowerCase() === 'iframe') {
            break;
        }

        const tagName = current.nodeName.toLowerCase();
        const position = getElementPosition(current);
        const xpathIndex = position > 0 ? `[${position}]` : '';
        segments.unshift(`${tagName}${xpathIndex}`);

        current = current.parentNode;
    }

    return segments.join('/');
}

function getElementPosition(element: EnhancedDOMTreeNode): number {
    if (!element.parentNode || !element.parentNode.childrenNodes) {
        return 0;
    }

    const sameTagSiblings = element.parentNode.childrenNodes.filter(
        child => child.nodeType === NodeType.ELEMENT_NODE &&
            child.nodeName.toLowerCase() === element.nodeName.toLowerCase()
    );

    if (sameTagSiblings.length <= 1) {
        return 0; // No index needed if only one
    }

    const index = sameTagSiblings.findIndex(s => s.nodeId === element.nodeId);
    return index >= 0 ? index + 1 : 0; // XPath is 1-indexed
}

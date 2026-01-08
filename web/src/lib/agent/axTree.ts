/**
 * Accessibility Tree Module
 * Phase 2: AX Tree Integration
 * 
 * Since Chrome extensions can't directly access CDP from content scripts,
 * we extract accessibility information from the DOM using ARIA attributes
 * and semantic HTML, matching browser-use's AX tree structure.
 */

// ============ Types matching browser-use/browser_use/dom/views.py ============

export interface AXNode {
    nodeId: string;
    backendDOMNodeId: number;
    role: string;
    name: string;
    description?: string;
    value?: string;
    ignored: boolean;
    properties: AXProperty[];
    childIds?: string[];
}

export interface AXProperty {
    name: string;
    value: string | number | boolean | null;
}

export interface AXTree {
    nodes: AXNode[];
    rootNodeId: string;
}

export interface AXTreeOptions {
    includeIgnored?: boolean;
    filterVisible?: boolean;
    maxDepth?: number;
}

// ARIA role mappings for semantic HTML elements
const IMPLICIT_ROLES: Record<string, string> = {
    // Landmarks
    'HEADER': 'banner',
    'NAV': 'navigation',
    'MAIN': 'main',
    'FOOTER': 'contentinfo',
    'ASIDE': 'complementary',
    'SECTION': 'region',
    'ARTICLE': 'article',
    'FORM': 'form',

    // Interactive
    'A': 'link',
    'BUTTON': 'button',
    'INPUT': 'textbox', // varies by type
    'TEXTAREA': 'textbox',
    'SELECT': 'combobox',
    'OPTION': 'option',
    'OPTGROUP': 'group',

    // Structure
    'H1': 'heading',
    'H2': 'heading',
    'H3': 'heading',
    'H4': 'heading',
    'H5': 'heading',
    'H6': 'heading',
    'P': 'paragraph',
    'UL': 'list',
    'OL': 'list',
    'LI': 'listitem',
    'DL': 'term',
    'TABLE': 'table',
    'TR': 'row',
    'TH': 'columnheader',
    'TD': 'cell',
    'THEAD': 'rowgroup',
    'TBODY': 'rowgroup',

    // Media
    'IMG': 'img',
    'FIGURE': 'figure',
    'FIGCAPTION': 'caption',

    // Other
    'DIALOG': 'dialog',
    'MENU': 'menu',
    'MENUITEM': 'menuitem',
    'PROGRESS': 'progressbar',
    'METER': 'meter',
    'DETAILS': 'group',
    'SUMMARY': 'button',
};

// Input type to role mapping
const INPUT_TYPE_ROLES: Record<string, string> = {
    'button': 'button',
    'submit': 'button',
    'reset': 'button',
    'checkbox': 'checkbox',
    'radio': 'radio',
    'range': 'slider',
    'number': 'spinbutton',
    'search': 'searchbox',
    'email': 'textbox',
    'tel': 'textbox',
    'url': 'textbox',
    'password': 'textbox',
    'text': 'textbox',
    'file': 'button', // File input acts like a button
    'image': 'button',
    'hidden': 'none',
};

// Properties to extract from ARIA
const ARIA_PROPERTIES = [
    'aria-checked',
    'aria-disabled',
    'aria-expanded',
    'aria-haspopup',
    'aria-hidden',
    'aria-invalid',
    'aria-level',
    'aria-multiselectable',
    'aria-orientation',
    'aria-pressed',
    'aria-readonly',
    'aria-required',
    'aria-selected',
    'aria-sort',
    'aria-valuemax',
    'aria-valuemin',
    'aria-valuenow',
    'aria-valuetext',
];

// ============ Core Functions ============

/**
 * Get the accessible role for an element
 */
export function getAccessibleRole(element: Element): string {
    // Explicit role takes precedence
    const explicitRole = element.getAttribute('role');
    if (explicitRole) {
        return explicitRole;
    }

    const tagName = element.tagName.toUpperCase();

    // Special handling for input elements
    if (tagName === 'INPUT') {
        const inputType = (element as HTMLInputElement).type?.toLowerCase() || 'text';
        return INPUT_TYPE_ROLES[inputType] || 'textbox';
    }

    // Check for implicit role
    return IMPLICIT_ROLES[tagName] || 'generic';
}

/**
 * Get the accessible name for an element
 * Follows the accessible name computation algorithm (simplified)
 */
export function getAccessibleName(element: Element): string {
    // 1. aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
        const names = labelledBy.split(/\s+/).map(id => {
            const labelElement = document.getElementById(id);
            return labelElement?.textContent?.trim() || '';
        }).filter(Boolean);
        if (names.length) return names.join(' ');
    }

    // 2. aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // 3. For inputs, check associated label
    if (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement) {
        // Check for label with "for" attribute
        if (element.id) {
            const label = document.querySelector(`label[for="${element.id}"]`);
            if (label?.textContent) return label.textContent.trim();
        }
        // Check for parent label
        const parentLabel = element.closest('label');
        if (parentLabel) {
            const clone = parentLabel.cloneNode(true) as Element;
            clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
            const text = clone.textContent?.trim();
            if (text) return text;
        }
        // Use placeholder as fallback
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            if (element.placeholder) return element.placeholder;
        }
    }

    // 4. For buttons and links, use text content
    const role = getAccessibleRole(element);
    if (['button', 'link', 'menuitem', 'tab', 'option'].includes(role)) {
        return element.textContent?.trim() || '';
    }

    // 5. For images, use alt text
    if (element instanceof HTMLImageElement) {
        return element.alt || '';
    }

    // 6. Title attribute
    const title = element.getAttribute('title');
    if (title) return title;

    return '';
}

/**
 * Get the accessible description for an element
 */
export function getAccessibleDescription(element: Element): string | undefined {
    // aria-describedby
    const describedBy = element.getAttribute('aria-describedby');
    if (describedBy) {
        const descriptions = describedBy.split(/\s+/).map(id => {
            const descElement = document.getElementById(id);
            return descElement?.textContent?.trim() || '';
        }).filter(Boolean);
        if (descriptions.length) return descriptions.join(' ');
    }

    // title attribute (if not used as name)
    const title = element.getAttribute('title');
    const name = getAccessibleName(element);
    if (title && title !== name) {
        return title;
    }

    return undefined;
}

/**
 * Get the accessible value for form controls
 */
export function getAccessibleValue(element: Element): string | undefined {
    const role = getAccessibleRole(element);

    if (element instanceof HTMLInputElement) {
        if (element.type === 'checkbox' || element.type === 'radio') {
            return element.checked ? 'true' : 'false';
        }
        if (element.type === 'range' || element.type === 'number') {
            return element.value;
        }
        if (element.type !== 'password') {
            return element.value || undefined;
        }
        return undefined; // Don't expose password values
    }

    if (element instanceof HTMLTextAreaElement) {
        return element.value || undefined;
    }

    if (element instanceof HTMLSelectElement) {
        return element.options[element.selectedIndex]?.text || undefined;
    }

    if (element instanceof HTMLProgressElement) {
        return String(element.value);
    }

    if (element instanceof HTMLMeterElement) {
        return String(element.value);
    }

    // aria-valuenow for sliders, etc.
    const valueNow = element.getAttribute('aria-valuenow');
    if (valueNow) return valueNow;

    // aria-valuetext for human-readable value
    const valueText = element.getAttribute('aria-valuetext');
    if (valueText) return valueText;

    return undefined;
}

/**
 * Extract all accessibility properties from an element
 */
export function extractAXProperties(element: Element): AXProperty[] {
    const properties: AXProperty[] = [];

    // Extract ARIA properties
    for (const prop of ARIA_PROPERTIES) {
        const value = element.getAttribute(prop);
        if (value !== null) {
            let parsedValue: string | number | boolean | null = value;

            // Parse boolean values
            if (value === 'true') parsedValue = true;
            else if (value === 'false') parsedValue = false;
            // Parse numeric values for value-related properties
            else if (['aria-level', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow'].includes(prop)) {
                const num = parseFloat(value);
                if (!isNaN(num)) parsedValue = num;
            }

            properties.push({
                name: prop.replace('aria-', ''),
                value: parsedValue,
            });
        }
    }

    // Add native properties
    if (element instanceof HTMLInputElement || element instanceof HTMLButtonElement) {
        if (element.disabled) {
            properties.push({ name: 'disabled', value: true });
        }
    }

    if (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement) {
        if (element.required) {
            properties.push({ name: 'required', value: true });
        }
        if ((element as HTMLInputElement).readOnly) {
            properties.push({ name: 'readonly', value: true });
        }
    }

    // Add focusable property
    if (element instanceof HTMLElement && element.tabIndex >= 0) {
        properties.push({ name: 'focusable', value: true });
    }

    // Heading level
    const tagName = element.tagName.toUpperCase();
    if (/^H[1-6]$/.test(tagName)) {
        properties.push({ name: 'level', value: parseInt(tagName[1]) });
    }

    return properties;
}

/**
 * Check if element should be ignored in AX tree
 */
export function isIgnored(element: Element): boolean {
    // aria-hidden
    if (element.getAttribute('aria-hidden') === 'true') {
        return true;
    }

    // Presentation/none role
    const role = element.getAttribute('role');
    if (role === 'presentation' || role === 'none') {
        return true;
    }

    // Hidden input
    if (element instanceof HTMLInputElement && element.type === 'hidden') {
        return true;
    }

    // Style-based hiding (limited check)
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
        return true;
    }

    return false;
}

/**
 * Build an AX tree from the DOM
 */
export function buildAXTree(
    root: Element = document.body,
    options: AXTreeOptions = {}
): AXTree {
    const { includeIgnored = false, filterVisible = true, maxDepth = 50 } = options;
    const nodes: AXNode[] = [];
    let nodeIdCounter = 1;

    function processElement(element: Element, depth: number): string | null {
        if (depth > maxDepth) return null;

        const ignored = isIgnored(element);
        if (!includeIgnored && ignored) {
            // Still process children, they might not be ignored
            const childIds: string[] = [];
            for (const child of Array.from(element.children)) {
                const childId = processElement(child, depth + 1);
                if (childId) childIds.push(childId);
            }
            return null;
        }

        // Check visibility if required
        if (filterVisible) {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return null;
            }
        }

        const nodeId = `ax-${nodeIdCounter++}`;
        const role = getAccessibleRole(element);

        // Skip generic elements with no name (reduces noise)
        const name = getAccessibleName(element);
        if (role === 'generic' && !name) {
            // Still process children
            const childIds: string[] = [];
            for (const child of Array.from(element.children)) {
                const childId = processElement(child, depth + 1);
                if (childId) childIds.push(childId);
            }
            return null;
        }

        // Process children
        const childIds: string[] = [];
        for (const child of Array.from(element.children)) {
            const childId = processElement(child, depth + 1);
            if (childId) childIds.push(childId);
        }

        // Get backendDOMNodeId equivalent (use a hash of the selector)
        const backendNodeId = hashSelector(generateUniqueSelector(element));

        const axNode: AXNode = {
            nodeId,
            backendDOMNodeId: backendNodeId,
            role,
            name,
            description: getAccessibleDescription(element),
            value: getAccessibleValue(element),
            ignored,
            properties: extractAXProperties(element),
            childIds: childIds.length > 0 ? childIds : undefined,
        };

        nodes.push(axNode);
        return nodeId;
    }

    const rootNodeId = processElement(root, 0) || 'ax-root';

    return { nodes, rootNodeId };
}

/**
 * Generate a unique selector for an element
 */
function generateUniqueSelector(element: Element): string {
    if (element.id) {
        return `#${element.id}`;
    }

    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body && path.length < 5) {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
            path.unshift(`#${current.id}`);
            break;
        }

        // Add class names
        if (current.classList.length > 0) {
            const classes = Array.from(current.classList).slice(0, 2);
            selector += '.' + classes.join('.');
        }

        // Add nth-child for uniqueness
        if (current.parentElement) {
            const siblings = Array.from(current.parentElement.children);
            const sameTag = siblings.filter(s => s.tagName === current!.tagName);
            if (sameTag.length > 1) {
                const index = sameTag.indexOf(current) + 1;
                selector += `:nth-of-type(${index})`;
            }
        }

        path.unshift(selector);
        current = current.parentElement;
    }

    return path.join(' > ');
}

/**
 * Simple hash function for selector to number
 */
function hashSelector(selector: string): number {
    let hash = 0;
    for (let i = 0; i < selector.length; i++) {
        const char = selector.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// ============ Serialization ============

/**
 * Serialize AX tree for LLM consumption
 * Format matches browser-use's AXTree representation
 */
export function serializeAXTree(axTree: AXTree): string {
    const lines: string[] = [];

    // Build node lookup
    const nodeMap = new Map<string, AXNode>();
    for (const node of axTree.nodes) {
        nodeMap.set(node.nodeId, node);
    }

    function formatNode(node: AXNode, indent: number): void {
        const indentStr = '  '.repeat(indent);

        // Format: role="name" [value] (properties)
        let line = `${indentStr}[${node.role}]`;

        if (node.name) {
            line += ` "${node.name}"`;
        }

        if (node.value) {
            line += ` value="${node.value}"`;
        }

        // Add important properties
        const propStrs: string[] = [];
        for (const prop of node.properties) {
            if (prop.value === true) {
                propStrs.push(prop.name);
            } else if (prop.value !== false && prop.value !== null) {
                propStrs.push(`${prop.name}=${prop.value}`);
            }
        }
        if (propStrs.length > 0) {
            line += ` (${propStrs.join(', ')})`;
        }

        lines.push(line);

        // Process children
        if (node.childIds) {
            for (const childId of node.childIds) {
                const childNode = nodeMap.get(childId);
                if (childNode) {
                    formatNode(childNode, indent + 1);
                }
            }
        }
    }

    // Find and format root
    const rootNode = nodeMap.get(axTree.rootNodeId);
    if (rootNode) {
        formatNode(rootNode, 0);
    }

    return lines.join('\n');
}

/**
 * Create a simplified AX tree for agent observation
 */
export interface SimplifiedAXNode {
    index: number;
    role: string;
    name: string;
    value?: string;
    properties: Record<string, string | number | boolean>;
    selector: string;
}

export function buildSimplifiedAXTree(root: Element = document.body): SimplifiedAXNode[] {
    const nodes: SimplifiedAXNode[] = [];
    let indexCounter = 1;

    // Interactive roles that should be indexed
    const INTERACTIVE_ROLES = new Set([
        'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
        'listbox', 'menu', 'menuitem', 'option', 'searchbox', 'slider',
        'spinbutton', 'switch', 'tab', 'tabpanel', 'menuitemcheckbox',
        'menuitemradio', 'treeitem',
    ]);

    function processElement(element: Element): void {
        if (isIgnored(element)) {
            // Still check children
            Array.from(element.children).forEach(processElement);
            return;
        }

        const role = getAccessibleRole(element);

        // Only include interactive elements in simplified tree
        if (INTERACTIVE_ROLES.has(role)) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const name = getAccessibleName(element);
                const value = getAccessibleValue(element);
                const props = extractAXProperties(element);

                const propsObj: Record<string, string | number | boolean> = {};
                for (const p of props) {
                    if (p.value !== null && p.value !== false) {
                        propsObj[p.name] = p.value;
                    }
                }

                nodes.push({
                    index: indexCounter++,
                    role,
                    name: name || '',
                    value: value,
                    properties: propsObj,
                    selector: generateUniqueSelector(element),
                });
            }
        }

        // Process children
        Array.from(element.children).forEach(processElement);
    }

    processElement(root);
    return nodes;
}

/**
 * Format simplified AX tree for LLM (browser-use style)
 */
export function formatAXTreeForLLM(nodes: SimplifiedAXNode[]): string {
    return nodes.map(node => {
        let line = `[${node.index}] <${node.role}`;
        if (node.name) {
            line += ` name="${node.name}"`;
        }
        if (node.value) {
            line += ` value="${node.value}"`;
        }
        Object.entries(node.properties).forEach(([key, val]) => {
            if (val === true) {
                line += ` ${key}`;
            } else {
                line += ` ${key}="${val}"`;
            }
        });
        line += '>';
        return line;
    }).join('\n');
}

/**
 * Action Executor - Bridges agent actions to browser execution
 * Adapted from browser-use/browser_use/tools/service.py
 */

import type {
    AgentAction,
    ActionResult,
} from './agentViews';
import { createActionResult, getActionName, getActionIndex } from './agentViews';
import type { EnhancedDOMTreeNode, DOMSelectorMap } from './domViews';

// ============ Types ============

export interface ActionContext {
    selectorMap: DOMSelectorMap;
    sendToExtension: (action: ExtensionAction) => Promise<ExtensionResponse>;
    currentUrl: string;
}

export interface ExtensionAction {
    type: string;
    payload: Record<string, any>;
}

export interface ExtensionResponse {
    success: boolean;
    error?: string;
    data?: any;
}

// ============ Action Executor Class ============

/**
 * Executes agent actions by translating them to extension commands
 * Matching browser-use Tools class architecture
 */
export class ActionExecutor {
    private context: ActionContext;

    constructor(context: ActionContext) {
        this.context = context;
    }

    /**
     * Execute an agent action
     */
    async execute(action: AgentAction): Promise<ActionResult> {
        const actionName = getActionName(action);
        const actionData = (action as any)[actionName];

        console.log(`[ActionExecutor] Executing: ${actionName}`, actionData);

        try {
            switch (actionName) {
                case 'click':
                    return await this.executeClick(actionData);

                case 'input':
                    return await this.executeInput(actionData);

                case 'navigate':
                    return await this.executeNavigate(actionData);

                case 'search':
                    return await this.executeSearch(actionData);

                case 'scroll':
                    return await this.executeScroll(actionData);

                case 'sendKeys':
                    return await this.executeSendKeys(actionData);

                case 'switchTab':
                    return await this.executeSwitchTab(actionData);

                case 'closeTab':
                    return await this.executeCloseTab(actionData);

                case 'goBack':
                    return await this.executeGoBack();

                case 'wait':
                    return await this.executeWait(actionData);

                case 'screenshot':
                    return await this.executeScreenshot();

                case 'extract':
                    return await this.executeExtract(actionData);

                case 'selectDropdown':
                    return await this.executeSelectDropdown(actionData);

                case 'getDropdownOptions':
                    return await this.executeGetDropdownOptions(actionData);

                case 'uploadFile':
                    return await this.executeUploadFile(actionData);

                case 'done':
                    return this.executeDone(actionData);

                default:
                    return createActionResult({
                        error: `Unknown action: ${actionName}`,
                    });
            }
        } catch (error) {
            console.error(`[ActionExecutor] Action failed:`, error);
            return createActionResult({
                error: (error as Error).message,
            });
        }
    }

    // ============ Action Implementations ============

    /**
     * Click action
     */
    private async executeClick(data: {
        index?: number;
        coordinateX?: number;
        coordinateY?: number;
    }): Promise<ActionResult> {
        // Validate element exists if using index
        if (data.index !== undefined) {
            const element = this.context.selectorMap[data.index];
            if (!element) {
                return createActionResult({
                    error: `Element with index ${data.index} not found`,
                });
            }

            // Use element's backend node ID for clicking
            const response = await this.context.sendToExtension({
                type: 'EXECUTE_ACTION',
                payload: {
                    action: 'click',
                    selector: this.buildSelector(element),
                    coordinates: element.absolutePosition
                        ? {
                            x: element.absolutePosition.x + element.absolutePosition.width / 2,
                            y: element.absolutePosition.y + element.absolutePosition.height / 2,
                        }
                        : undefined,
                },
            });

            return createActionResult({
                error: response.success ? null : response.error,
                metadata: {
                    action: 'click',
                    index: data.index,
                    causedPageChange: response.data?.pageChanged,
                },
            });
        }

        // Coordinate-based click
        if (data.coordinateX !== undefined && data.coordinateY !== undefined) {
            const response = await this.context.sendToExtension({
                type: 'EXECUTE_ACTION',
                payload: {
                    action: 'click',
                    coordinates: { x: data.coordinateX, y: data.coordinateY },
                },
            });

            return createActionResult({
                error: response.success ? null : response.error,
                metadata: {
                    action: 'click',
                    coordinates: { x: data.coordinateX, y: data.coordinateY },
                    causedPageChange: response.data?.pageChanged,
                },
            });
        }

        return createActionResult({
            error: 'Click requires either index or coordinates',
        });
    }

    /**
     * Input text action
     */
    private async executeInput(data: {
        index: number;
        text: string;
        clear?: boolean;
    }): Promise<ActionResult> {
        const element = this.context.selectorMap[data.index];
        if (!element) {
            return createActionResult({
                error: `Element with index ${data.index} not found`,
            });
        }

        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'input',
                selector: this.buildSelector(element),
                text: data.text,
                clear: data.clear !== false,
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            metadata: {
                action: 'input',
                index: data.index,
                textLength: data.text.length,
            },
        });
    }

    /**
     * Navigate action
     */
    private async executeNavigate(data: {
        url: string;
        newTab?: boolean;
    }): Promise<ActionResult> {
        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'navigate',
                url: data.url,
                newTab: data.newTab || false,
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            metadata: {
                action: 'navigate',
                url: data.url,
                causedPageChange: true,
            },
        });
    }

    /**
     * Search action
     */
    private async executeSearch(data: {
        query: string;
        engine?: string;
    }): Promise<ActionResult> {
        const engines: Record<string, string> = {
            google: 'https://www.google.com/search?q=',
            duckduckgo: 'https://duckduckgo.com/?q=',
            bing: 'https://www.bing.com/search?q=',
        };

        const engine = data.engine || 'duckduckgo';
        const baseUrl = engines[engine] || engines.duckduckgo;
        const searchUrl = baseUrl + encodeURIComponent(data.query);

        return this.executeNavigate({ url: searchUrl });
    }

    /**
     * Scroll action
     */
    private async executeScroll(data: {
        down?: boolean;
        pages?: number;
        index?: number;
    }): Promise<ActionResult> {
        const direction = data.down !== false ? 'down' : 'up';
        const pages = data.pages || 1;

        // Calculate scroll amount (rough estimate)
        const scrollAmount = Math.round(window?.innerHeight || 800) * pages;

        const payload: any = {
            action: 'scroll',
            direction,
            amount: scrollAmount,
        };

        // If scrolling within a specific element
        if (data.index !== undefined) {
            const element = this.context.selectorMap[data.index];
            if (element) {
                payload.selector = this.buildSelector(element);
            }
        }

        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload,
        });

        return createActionResult({
            error: response.success ? null : response.error,
            metadata: { action: 'scroll', direction, pages },
        });
    }

    /**
     * Send keys action
     */
    private async executeSendKeys(data: {
        keys: string;
    }): Promise<ActionResult> {
        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'sendKeys',
                keys: data.keys,
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            metadata: { action: 'sendKeys', keys: data.keys },
        });
    }

    /**
     * Switch tab action
     */
    private async executeSwitchTab(data: {
        tabId: string;
    }): Promise<ActionResult> {
        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'switchTab',
                tabId: data.tabId,
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            metadata: { action: 'switchTab', tabId: data.tabId },
        });
    }

    /**
     * Close tab action
     */
    private async executeCloseTab(data: {
        tabId: string;
    }): Promise<ActionResult> {
        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'closeTab',
                tabId: data.tabId,
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            metadata: { action: 'closeTab', tabId: data.tabId },
        });
    }

    /**
     * Go back action
     */
    private async executeGoBack(): Promise<ActionResult> {
        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'goBack',
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            metadata: { action: 'goBack', causedPageChange: true },
        });
    }

    /**
     * Wait action
     */
    private async executeWait(data: {
        seconds?: number;
    }): Promise<ActionResult> {
        const seconds = data.seconds || 3;

        await new Promise(resolve => setTimeout(resolve, seconds * 1000));

        return createActionResult({
            metadata: { action: 'wait', seconds },
        });
    }

    /**
     * Screenshot action
     */
    private async executeScreenshot(): Promise<ActionResult> {
        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'screenshot',
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            extractedContent: response.success ? 'Screenshot captured' : undefined,
            metadata: { action: 'screenshot' },
        });
    }

    /**
     * Extract action
     */
    private async executeExtract(data: {
        query: string;
        extractLinks?: boolean;
    }): Promise<ActionResult> {
        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'extract',
                query: data.query,
                extractLinks: data.extractLinks || false,
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            extractedContent: response.data?.content,
            metadata: { action: 'extract', query: data.query },
        });
    }

    /**
     * Select dropdown option action
     */
    private async executeSelectDropdown(data: {
        index: number;
        text: string;
    }): Promise<ActionResult> {
        const element = this.context.selectorMap[data.index];
        if (!element) {
            return createActionResult({
                error: `Element with index ${data.index} not found`,
            });
        }

        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'selectDropdown',
                selector: this.buildSelector(element),
                text: data.text,
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            metadata: { action: 'selectDropdown', index: data.index, text: data.text },
        });
    }

    /**
     * Get dropdown options action
     */
    private async executeGetDropdownOptions(data: {
        index: number;
    }): Promise<ActionResult> {
        const element = this.context.selectorMap[data.index];
        if (!element) {
            return createActionResult({
                error: `Element with index ${data.index} not found`,
            });
        }

        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'getDropdownOptions',
                selector: this.buildSelector(element),
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            extractedContent: response.data?.options
                ? `Options: ${response.data.options.join(', ')}`
                : undefined,
            metadata: { action: 'getDropdownOptions', index: data.index },
        });
    }

    /**
     * Upload file action
     */
    private async executeUploadFile(data: {
        index: number;
        path: string;
    }): Promise<ActionResult> {
        const element = this.context.selectorMap[data.index];
        if (!element) {
            return createActionResult({
                error: `Element with index ${data.index} not found`,
            });
        }

        const response = await this.context.sendToExtension({
            type: 'EXECUTE_ACTION',
            payload: {
                action: 'uploadFile',
                selector: this.buildSelector(element),
                path: data.path,
            },
        });

        return createActionResult({
            error: response.success ? null : response.error,
            metadata: { action: 'uploadFile', index: data.index, path: data.path },
        });
    }

    /**
     * Done action
     */
    private executeDone(data: {
        text: string;
        success?: boolean;
        filesToDisplay?: string[];
    }): ActionResult {
        return createActionResult({
            isDone: true,
            success: data.success !== false,
            extractedContent: data.text,
            attachments: data.filesToDisplay,
            metadata: { action: 'done' },
        });
    }

    // ============ Helpers ============

    /**
     * Build a CSS selector for an element
     */
    private buildSelector(element: EnhancedDOMTreeNode): string {
        // Prefer using data attribute
        if (element.attributes['data-opero-index']) {
            return `[data-opero-index="${element.attributes['data-opero-index']}"]`;
        }

        // Use ID if available
        if (element.attributes.id) {
            return `#${element.attributes.id}`;
        }

        // Use name attribute
        if (element.attributes.name) {
            return `[name="${element.attributes.name}"]`;
        }

        // Fallback to backend node ID via data attribute
        return `[data-backend-node-id="${element.backendNodeId}"]`;
    }
}

// ============ Factory ============

/**
 * Create an action executor with the given context
 */
export function createActionExecutor(context: ActionContext): ActionExecutor {
    return new ActionExecutor(context);
}

/**
 * Agent Memory - Step history and working memory
 * Adapted from browser-use agent memory patterns
 */

import type {
    AgentHistory,
    AgentOutput,
    ActionResult,
    BrowserStateHistory,
} from './agentViews';
import { getActionName } from './agentViews';
import { capTextLength } from './domViews';

// ============ Types ============

export interface MemoryEntry {
    stepNumber: number;
    timestamp: number;

    // From agent output
    evaluation: string;
    memory: string;
    nextGoal: string;

    // Action summary
    actions: ActionSummary[];

    // Result summary
    errors: string[];
    extractedContent: string | null;
    isComplete: boolean;

    // Context
    url: string;
    pageTitle: string;
}

export interface ActionSummary {
    name: string;
    index?: number;
    target?: string;
    success: boolean;
    error?: string;
}

export interface WorkingMemory {
    // Current task
    task: string;

    // Progress tracking
    completedSubtasks: string[];
    pendingSubtasks: string[];

    // Important facts
    facts: string[];

    // Failed approaches (to avoid repeating)
    failedApproaches: string[];

    // Form data collected
    formData: Record<string, string>;

    // Extracted information
    extractedInfo: Record<string, string>;
}

export interface MemoryConfig {
    maxHistoryItems: number;
    maxMemoryLength: number;
    compressOldEntries: boolean;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
    maxHistoryItems: 20,
    maxMemoryLength: 500,
    compressOldEntries: true,
};

// ============ Agent Memory Class ============

/**
 * AgentMemory - Manages step history and working memory
 * Matches browser-use memory patterns
 */
export class AgentMemory {
    private config: MemoryConfig;
    private history: MemoryEntry[];
    private workingMemory: WorkingMemory;

    constructor(task: string, config: Partial<MemoryConfig> = {}) {
        this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
        this.history = [];
        this.workingMemory = {
            task,
            completedSubtasks: [],
            pendingSubtasks: [],
            facts: [],
            failedApproaches: [],
            formData: {},
            extractedInfo: {},
        };
    }

    // ============ History Management ============

    /**
     * Add a step to history
     */
    addStep(
        stepNumber: number,
        agentOutput: AgentOutput | null,
        results: ActionResult[],
        state: BrowserStateHistory
    ): void {
        const entry = this.createMemoryEntry(stepNumber, agentOutput, results, state);
        this.history.push(entry);

        // Update working memory from agent output
        if (agentOutput?.memory) {
            this.parseMemoryUpdate(agentOutput.memory);
        }

        // Check for extracted content
        for (const result of results) {
            if (result.extractedContent) {
                this.updateExtractedInfo(entry.actions, result.extractedContent);
            }
        }

        // Track failed approaches
        const failedActions = entry.actions.filter(a => !a.success);
        for (const action of failedActions) {
            const approach = `${action.name}${action.target ? ` on ${action.target}` : ''}`;
            if (!this.workingMemory.failedApproaches.includes(approach)) {
                this.workingMemory.failedApproaches.push(approach);
            }
        }

        // Prune old entries if needed
        this.pruneHistory();
    }

    /**
     * Get formatted history for LLM context
     */
    getHistoryContext(maxItems?: number): string {
        const items = maxItems
            ? this.history.slice(-maxItems)
            : this.history.slice(-this.config.maxHistoryItems);

        if (items.length === 0) return '';

        return items.map(entry => this.formatEntryForLLM(entry)).join('\n\n');
    }

    /**
     * Get memory summary for prompt
     */
    getMemorySummary(): string {
        const sections: string[] = [];

        // Progress
        if (this.workingMemory.completedSubtasks.length > 0) {
            sections.push(`Completed: ${this.workingMemory.completedSubtasks.join(', ')}`);
        }

        // Important facts
        if (this.workingMemory.facts.length > 0) {
            sections.push(`Facts: ${this.workingMemory.facts.slice(-5).join('; ')}`);
        }

        // Failed approaches (warn about these)
        if (this.workingMemory.failedApproaches.length > 0) {
            const recent = this.workingMemory.failedApproaches.slice(-3);
            sections.push(`Avoid: ${recent.join(', ')}`);
        }

        // Collected form data
        if (Object.keys(this.workingMemory.formData).length > 0) {
            const summary = Object.entries(this.workingMemory.formData)
                .map(([k, v]) => `${k}=${capTextLength(v, 20)}`)
                .join(', ');
            sections.push(`Form data: ${summary}`);
        }

        return sections.join('\n');
    }

    // ============ Working Memory Operations ============

    /**
     * Add a fact to working memory
     */
    addFact(fact: string): void {
        if (!this.workingMemory.facts.includes(fact)) {
            this.workingMemory.facts.push(fact);
        }
    }

    /**
     * Mark a subtask as completed
     */
    completeSubtask(subtask: string): void {
        if (!this.workingMemory.completedSubtasks.includes(subtask)) {
            this.workingMemory.completedSubtasks.push(subtask);
        }
        // Remove from pending if present
        const idx = this.workingMemory.pendingSubtasks.indexOf(subtask);
        if (idx >= 0) {
            this.workingMemory.pendingSubtasks.splice(idx, 1);
        }
    }

    /**
     * Add form data
     */
    setFormData(field: string, value: string): void {
        this.workingMemory.formData[field] = value;
    }

    /**
     * Store extracted information
     */
    addExtractedInfo(key: string, value: string): void {
        this.workingMemory.extractedInfo[key] = value;
    }

    /**
     * Get working memory
     */
    getWorkingMemory(): WorkingMemory {
        return { ...this.workingMemory };
    }

    /**
     * Clear working memory but keep history
     */
    clearWorkingMemory(): void {
        const task = this.workingMemory.task;
        this.workingMemory = {
            task,
            completedSubtasks: [],
            pendingSubtasks: [],
            facts: [],
            failedApproaches: [],
            formData: {},
            extractedInfo: {},
        };
    }

    // ============ Analysis ============

    /**
     * Check if agent is stuck (repeating actions without progress)
     */
    isStuck(): boolean {
        if (this.history.length < 3) return false;

        const recent = this.history.slice(-3);

        // Check for repeated errors
        const allErrors = recent.every(e => e.errors.length > 0);
        if (allErrors) return true;

        // Check for repeated actions on same URL
        const sameUrl = recent.every(e => e.url === recent[0].url);
        const sameActions = this.hasSameActions(recent);

        return sameUrl && sameActions;
    }

    /**
     * Get count of consecutive failures
     */
    getConsecutiveFailures(): number {
        let count = 0;
        for (let i = this.history.length - 1; i >= 0; i--) {
            if (this.history[i].errors.length > 0) {
                count++;
            } else {
                break;
            }
        }
        return count;
    }

    /**
     * Get recent error messages
     */
    getRecentErrors(count: number = 3): string[] {
        const errors: string[] = [];
        for (let i = this.history.length - 1; i >= 0 && errors.length < count; i--) {
            errors.push(...this.history[i].errors);
        }
        return errors.slice(0, count);
    }

    // ============ Private Helpers ============

    private createMemoryEntry(
        stepNumber: number,
        agentOutput: AgentOutput | null,
        results: ActionResult[],
        state: BrowserStateHistory
    ): MemoryEntry {
        const actions: ActionSummary[] = [];

        if (agentOutput?.action) {
            for (let i = 0; i < agentOutput.action.length; i++) {
                const action = agentOutput.action[i];
                const result = results[i];
                const actionName = getActionName(action);
                const actionData = (action as any)[actionName];

                actions.push({
                    name: actionName,
                    index: actionData?.index,
                    target: this.getActionTarget(actionName, actionData),
                    success: !result?.error,
                    error: result?.error || undefined,
                });
            }
        }

        return {
            stepNumber,
            timestamp: Date.now(),
            evaluation: agentOutput?.evaluationPreviousGoal || '',
            memory: agentOutput?.memory || '',
            nextGoal: agentOutput?.nextGoal || '',
            actions,
            errors: results.filter(r => r.error).map(r => r.error!),
            extractedContent: results.find(r => r.extractedContent)?.extractedContent || null,
            isComplete: results.some(r => r.isDone),
            url: state.url,
            pageTitle: state.title,
        };
    }

    private getActionTarget(actionName: string, data: any): string | undefined {
        switch (actionName) {
            case 'navigate':
                return data?.url;
            case 'input':
                return capTextLength(data?.text, 30);
            case 'search':
                return data?.query;
            case 'selectDropdown':
                return data?.text;
            default:
                return undefined;
        }
    }

    private formatEntryForLLM(entry: MemoryEntry): string {
        const actionResults = entry.actions.map(a => {
            const target = a.target ? ` "${capTextLength(a.target, 20)}"` : '';
            const status = a.success ? '✓' : `✗ ${a.error || 'failed'}`;
            return `${a.name}${a.index ? `[${a.index}]` : ''}${target} → ${status}`;
        }).join(', ');

        return `<step_${entry.stepNumber}>
Evaluation: ${capTextLength(entry.evaluation, 100)}
Memory: ${capTextLength(entry.memory, 150)}
Next Goal: ${capTextLength(entry.nextGoal, 100)}
Actions: ${actionResults}
</step_${entry.stepNumber}>`;
    }

    private parseMemoryUpdate(memory: string): void {
        // Look for patterns in memory text
        const completedMatch = memory.match(/completed?[:;]?\s*(.+)/i);
        if (completedMatch) {
            this.completeSubtask(completedMatch[1].trim());
        }

        // Look for facts
        const factPatterns = [
            /found[:;]?\s*(.+)/i,
            /discovered[:;]?\s*(.+)/i,
            /note[:;]?\s*(.+)/i,
            /important[:;]?\s*(.+)/i,
        ];

        for (const pattern of factPatterns) {
            const match = memory.match(pattern);
            if (match) {
                this.addFact(capTextLength(match[1], 100));
                break;
            }
        }
    }

    private updateExtractedInfo(actions: ActionSummary[], content: string): void {
        // Find extract action and use its query as key
        const extractAction = actions.find(a => a.name === 'extract');
        if (extractAction?.target) {
            this.addExtractedInfo(extractAction.target, content);
        }
    }

    private hasSameActions(entries: MemoryEntry[]): boolean {
        if (entries.length < 2) return false;

        const firstActions = entries[0].actions.map(a => `${a.name}-${a.index}`).sort().join(',');

        return entries.every(entry => {
            const actions = entry.actions.map(a => `${a.name}-${a.index}`).sort().join(',');
            return actions === firstActions;
        });
    }

    private pruneHistory(): void {
        if (this.history.length <= this.config.maxHistoryItems) return;

        const excess = this.history.length - this.config.maxHistoryItems;

        if (this.config.compressOldEntries) {
            // Compress old entries before removing
            for (let i = 0; i < excess; i++) {
                const entry = this.history[i];
                // Store compressed summary as a fact
                const summary = `Step ${entry.stepNumber}: ${entry.actions.map(a => a.name).join(',')}`;
                this.addFact(summary);
            }
        }

        // Remove oldest entries
        this.history = this.history.slice(excess);
    }
}

// ============ Factory ============

/**
 * Create an agent memory instance
 */
export function createAgentMemory(
    task: string,
    config?: Partial<MemoryConfig>
): AgentMemory {
    return new AgentMemory(task, config);
}

/**
 * Serialize memory for storage
 */
export function serializeMemory(memory: AgentMemory): string {
    return JSON.stringify({
        history: memory.getHistoryContext(),
        workingMemory: memory.getWorkingMemory(),
    });
}

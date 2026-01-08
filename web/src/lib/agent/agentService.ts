/**
 * Agent Service - Main agent execution loop
 * Adapted from browser-use/browser_use/agent/service.py
 */

import type {
    AgentState,
    AgentOutput,
    AgentAction,
    ActionResult,
    AgentSettings,
    BrowserState,
    AgentHistory,
    AgentStepInfo,
    StepMetadata,
} from './agentViews';
import {
    DEFAULT_AGENT_SETTINGS,
    createInitialAgentState,
    createActionResult,
    parseAgentOutput,
    getActionName,
    getActionIndex,
    AgentError,
} from './agentViews';
import { serializeBrowserStateForLLM, formatHistoryForLLM } from './domSerializer';
import { buildAgentPrompt } from './systemPrompt';
import {
    verifyAction,
    generateReflection,
    correctiveToAgentAction,
    shouldVerify,
    shouldReflect,
    type VerificationResult,
    type CorrectiveAction,
} from './verifyReflect';
import {
    queryMemory,
    storeMemory,
    formatMemoriesForPrompt,
    isPineconeConfigured,
    type StoredMemory,
} from '@/lib/pinecone';
import {
    TaskQueue,
    generateSubtasksFromResult,
} from '@/lib/taskQueue';

// ============ Types ============

export interface AgentConfig {
    task: string;
    settings?: Partial<AgentSettings>;

    // Callbacks
    onStep?: (step: AgentStepResult) => void | Promise<void>;
    onAction?: (action: AgentAction, result: ActionResult) => void | Promise<void>;
    onError?: (error: Error) => void | Promise<void>;
    onComplete?: (result: AgentRunResult) => void | Promise<void>;

    // Browser integration
    getBrowserState: () => Promise<BrowserState>;
    executeAction: (action: AgentAction) => Promise<ActionResult>;
    callLLM: (messages: any[]) => Promise<string>;

    // Optional: TaskQueue for subtask-driven execution
    taskQueue?: TaskQueue;
    enableSubtaskGeneration?: boolean;  // Auto-generate subtasks after each step
}

export interface AgentStepResult {
    stepNumber: number;
    observation: BrowserState;
    agentOutput: AgentOutput | null;
    actionResults: ActionResult[];
    success: boolean;
    duration: number;
}

export interface AgentRunResult {
    success: boolean;
    finalMessage: string;
    totalSteps: number;
    totalDuration: number;
    history: AgentHistory[];
    error?: string;
}

// ============ Agent Class ============

/**
 * Agent class that orchestrates the observe→plan→act→verify loop
 * Matching browser-use Agent class architecture
 */
export class Agent {
    private config: AgentConfig;
    private settings: AgentSettings;
    private state: AgentState;
    private history: AgentHistory[];
    private startTime: number;
    private running: boolean;

    constructor(config: AgentConfig) {
        this.config = config;
        this.settings = { ...DEFAULT_AGENT_SETTINGS, ...config.settings };
        this.state = createInitialAgentState();
        this.history = [];
        this.startTime = 0;
        this.running = false;
        this.reflectionCount = 0;
    }

    // Track reflection attempts to prevent infinite loops
    private reflectionCount: number = 0;
    private readonly maxReflections: number = 2;

    /**
     * Run the agent to completion
     */
    async run(): Promise<AgentRunResult> {
        this.startTime = Date.now();
        this.running = true;
        this.state.sessionInitialized = true;

        console.log(`[Agent] Starting task: ${this.config.task.slice(0, 100)}...`);

        try {
            while (this.running && this.state.nSteps <= this.settings.maxSteps) {
                // Check for pause/stop
                if (this.state.paused) {
                    await this.waitForResume();
                    continue;
                }

                if (this.state.stopped) {
                    break;
                }

                // Execute step
                const stepResult = await this.executeStep();

                // Check for completion
                if (this.isDone(stepResult)) {
                    console.log('[Agent] Task completed');
                    break;
                }

                // Check for too many failures
                if (this.state.consecutiveFailures >= this.settings.maxFailures) {
                    console.error('[Agent] Too many consecutive failures');

                    if (this.settings.finalResponseAfterFailure) {
                        // Try one final recovery attempt
                        const recoveryResult = await this.attemptRecovery();
                        if (recoveryResult) break;
                    }

                    break;
                }

                this.state.nSteps++;
            }

            return this.buildRunResult();

        } catch (error) {
            console.error('[Agent] Fatal error:', error);
            this.config.onError?.(error as Error);

            return {
                success: false,
                finalMessage: AgentError.formatError(error as Error),
                totalSteps: this.state.nSteps,
                totalDuration: Date.now() - this.startTime,
                history: this.history,
                error: (error as Error).message,
            };
        } finally {
            this.running = false;
        }
    }

    /**
     * Execute a single step of the agent loop
     * Enhanced with verification and reflection layers
     */
    private async executeStep(): Promise<AgentStepResult> {
        const stepStartTime = Date.now();
        const stepNumber = this.state.nSteps;

        console.log(`[Agent] Step ${stepNumber}/${this.settings.maxSteps}`);

        // 1. OBSERVE: Capture current browser state (before state)
        const beforeState = await this.observe();

        // 2. PLAN: Get agent's next actions from LLM
        const agentOutput = await this.plan(beforeState);

        // 3. ACT: Execute each action in sequence
        const actionResults = await this.act(agentOutput);

        // 4. OBSERVE: Capture state after actions
        const afterState = await this.observe();

        // 5. VERIFY: LLM-based verification of action success
        let success = true;
        let reflectionApplied = false;

        if (agentOutput && agentOutput.action.length > 0) {
            const lastAction = agentOutput.action[agentOutput.action.length - 1];
            const lastResult = actionResults[actionResults.length - 1];

            if (shouldVerify(lastAction)) {
                console.log('[Agent] Verifying action result...');
                const verification = await verifyAction(
                    lastAction,
                    lastResult,
                    beforeState,
                    afterState,
                    afterState.screenshot
                );

                console.log(`[Agent] Verification: ${verification.success ? 'SUCCESS' : 'FAILED'} (${verification.confidence}) - ${verification.reason}`);

                if (!verification.success) {
                    success = false;

                    // 6. REFLECT: Generate corrective action if verification failed
                    if (shouldReflect(this.reflectionCount, this.maxReflections)) {
                        console.log('[Agent] Reflecting on failure...');
                        const reflection = await generateReflection(
                            lastAction,
                            verification,
                            afterState,
                            lastResult.error || undefined,
                            afterState.screenshot
                        );

                        console.log(`[Agent] Reflection analysis: ${reflection.analysis}`);
                        console.log(`[Agent] Corrective action: ${reflection.correctiveAction.action} - ${reflection.correctiveAction.reason}`);

                        // Convert to executable action and execute
                        const correctiveAction = correctiveToAgentAction(reflection.correctiveAction, lastAction);
                        if (correctiveAction) {
                            console.log(`[Agent] Executing corrective action: ${getActionName(correctiveAction)}`);
                            const correctiveResult = await this.config.executeAction(correctiveAction);
                            actionResults.push(correctiveResult);
                            this.reflectionCount++;
                            reflectionApplied = true;

                            // If corrective action succeeded, mark step as recovered
                            if (!correctiveResult.error) {
                                console.log('[Agent] Recovery successful');
                                success = true;
                            }
                        }
                    } else {
                        console.log('[Agent] Max reflections reached, skipping recovery');
                    }
                } else {
                    // Reset reflection count on success
                    this.reflectionCount = 0;
                }
            }
        }

        // Fallback to basic verification if no LLM verification was done
        if (agentOutput && !success && !reflectionApplied) {
            success = this.verify(agentOutput, actionResults);
        }

        const stepEndTime = Date.now();
        const duration = stepEndTime - stepStartTime;

        // Create history entry
        const historyEntry = this.createHistoryEntry(
            afterState,
            agentOutput,
            actionResults,
            { stepNumber, stepStartTime, stepEndTime }
        );
        this.history.push(historyEntry);

        // Update state
        this.state.lastModelOutput = agentOutput;
        this.state.lastResult = actionResults;

        if (success) {
            this.state.consecutiveFailures = 0;
        } else {
            this.state.consecutiveFailures++;
        }

        const stepResult: AgentStepResult = {
            stepNumber,
            observation: afterState,
            agentOutput,
            actionResults,
            success,
            duration,
        };

        // Callback
        await this.config.onStep?.(stepResult);

        // MEMORY STORAGE: Store step in Pinecone for future retrieval
        if (isPineconeConfigured() && agentOutput) {
            try {
                const actionName = agentOutput.action.length > 0
                    ? getActionName(agentOutput.action[0])
                    : 'unknown';

                await storeMemory(
                    {
                        observation: `URL: ${afterState.url}, Elements: ${afterState.interactiveElements.length}`,
                        reasoning: agentOutput.memory || agentOutput.nextGoal || '',
                        action: actionName,
                        result: actionResults[0]?.error || (success ? 'success' : 'failed'),
                    },
                    {
                        url: afterState.url,
                        timestamp: Date.now(),
                        stepNumber: stepNumber,
                        taskType: 'browser_automation',
                    }
                );
                console.log('[Agent] Step stored in memory');
            } catch (memoryError) {
                console.warn('[Agent] Failed to store memory:', memoryError);
                // Non-critical, continue execution
            }
        }

        // SUBTASK GENERATION: Auto-generate next steps after each action
        if (this.config.enableSubtaskGeneration && this.config.taskQueue && agentOutput) {
            try {
                const resultSummary = success
                    ? `Success: ${agentOutput.nextGoal || 'Action completed'}`
                    : `Failed: ${actionResults[0]?.error || 'Unknown error'}`;

                const newSubtasks = await generateSubtasksFromResult(
                    this.config.task,
                    resultSummary,
                    afterState.url,
                    afterState.interactiveElements.slice(0, 10).map(e => e.text).join(', ')
                );

                if (newSubtasks.length > 0) {
                    const currentTask = this.config.taskQueue.getCurrentTask() || this.config.taskQueue.getRootTask();
                    if (currentTask) {
                        this.config.taskQueue.addSubtasks(currentTask.id, newSubtasks);
                        console.log(`[Agent] Generated ${newSubtasks.length} new subtasks`);
                    }
                }
            } catch (subtaskError) {
                console.warn('[Agent] Subtask generation failed:', subtaskError);
                // Non-critical, continue execution
            }
        }

        return stepResult;
    }

    /**
     * OBSERVE: Capture current browser state
     */
    private async observe(): Promise<BrowserState> {
        console.log('[Agent] Observing browser state...');

        try {
            const state = await this.config.getBrowserState();
            console.log(`[Agent] Observed ${state.interactiveElements.length} interactive elements`);
            return state;
        } catch (error) {
            console.error('[Agent] Failed to observe:', error);
            throw error;
        }
    }

    /**
     * PLAN: Get next actions from LLM
     * Enhanced with memory retrieval from Pinecone
     */
    private async plan(observation: BrowserState): Promise<AgentOutput | null> {
        console.log('[Agent] Planning next actions...');

        try {
            // Build context
            const browserStateText = serializeBrowserStateForLLM(observation);
            const historyContext = this.buildHistoryContext();

            // MEMORY RETRIEVAL: Fetch relevant past context from Pinecone
            let memoryContext: string | undefined;
            if (isPineconeConfigured()) {
                try {
                    console.log('[Agent] Retrieving relevant memories...');
                    const memories = await queryMemory(this.config.task, { topK: 3 });
                    if (memories.length > 0) {
                        memoryContext = formatMemoriesForPrompt(memories);
                        console.log(`[Agent] Retrieved ${memories.length} relevant memories`);
                    }
                } catch (memoryError) {
                    console.warn('[Agent] Memory retrieval failed:', memoryError);
                    // Continue without memory context
                }
            }

            // Build prompt with memory context
            const messages = buildAgentPrompt({
                task: this.config.task,
                browserState: browserStateText,
                historyContext,
                stepInfo: {
                    stepNumber: this.state.nSteps,
                    maxSteps: this.settings.maxSteps,
                },
                screenshot: this.settings.useVision ? observation.screenshot : undefined,
                memoryContext,
            });

            // Call LLM
            const response = await this.config.callLLM(messages);

            // Parse response
            const parsed = this.parseResponse(response);

            if (!parsed) {
                console.error('[Agent] Failed to parse LLM response');
                return null;
            }

            console.log(`[Agent] Planned ${parsed.action.length} actions`);
            return parsed;

        } catch (error) {
            console.error('[Agent] Planning failed:', error);
            return null;
        }
    }

    /**
     * ACT: Execute planned actions
     */
    private async act(agentOutput: AgentOutput | null): Promise<ActionResult[]> {
        if (!agentOutput || !agentOutput.action.length) {
            return [createActionResult({ error: 'No actions to execute' })];
        }

        const results: ActionResult[] = [];
        const maxActions = Math.min(
            agentOutput.action.length,
            this.settings.maxActionsPerStep
        );

        for (let i = 0; i < maxActions; i++) {
            const action = agentOutput.action[i];
            const actionName = getActionName(action);

            console.log(`[Agent] Executing action ${i + 1}/${maxActions}: ${actionName}`);

            try {
                const result = await this.executeWithRetry(action);
                results.push(result);

                // Callback
                await this.config.onAction?.(action, result);

                // Check if action caused page change
                if (result.metadata?.causedPageChange) {
                    console.log('[Agent] Page changed, stopping action sequence');
                    break;
                }

                // Check for done action
                if (actionName === 'done') {
                    break;
                }

            } catch (error) {
                results.push(createActionResult({
                    error: (error as Error).message,
                }));
                break;
            }
        }

        return results;
    }

    /**
     * Execute action with retry logic
     */
    private async executeWithRetry(
        action: AgentAction,
        maxRetries: number = 2
    ): Promise<ActionResult> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.config.executeAction(action);
            } catch (error) {
                lastError = error as Error;
                console.warn(`[Agent] Action attempt ${attempt} failed:`, lastError.message);

                if (attempt < maxRetries) {
                    // Wait before retry with exponential backoff
                    await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
                }
            }
        }

        return createActionResult({
            error: lastError?.message || 'Action failed after retries',
        });
    }

    /**
     * VERIFY: Check if step was successful
     */
    private verify(agentOutput: AgentOutput | null, results: ActionResult[]): boolean {
        if (!agentOutput) return false;

        // Check if any action had an error
        const hasError = results.some(r => r.error !== null);
        if (hasError) return false;

        // Step succeeded
        return true;
    }

    /**
     * Check if agent is done
     */
    private isDone(stepResult: AgentStepResult): boolean {
        // Check for done action
        if (stepResult.agentOutput) {
            const hasDone = stepResult.agentOutput.action.some(a => 'done' in a);
            if (hasDone) return true;
        }

        // Check action results
        return stepResult.actionResults.some(r => r.isDone === true);
    }

    /**
     * Build history context for LLM
     */
    private buildHistoryContext(): string {
        if (this.history.length === 0) return '';

        const formatted = this.history.slice(-5).map((h, i) => ({
            stepNumber: i + 1,
            evaluation: h.modelOutput?.evaluationPreviousGoal || 'N/A',
            memory: h.modelOutput?.memory || '',
            nextGoal: h.modelOutput?.nextGoal || '',
            actionResults: h.result.map(r => ({
                action: h.modelOutput?.action?.[0] ? getActionName(h.modelOutput.action[0]) : 'unknown',
                success: r.error === null,
                error: r.error || undefined,
            })),
        }));

        return formatHistoryForLLM(formatted);
    }

    /**
     * Parse LLM response to AgentOutput
     */
    private parseResponse(response: string): AgentOutput | null {
        try {
            // Clean response
            let cleaned = response
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            // Try to extract JSON
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cleaned = jsonMatch[0];
            }

            const parsed = JSON.parse(cleaned);
            return parseAgentOutput(parsed);

        } catch (error) {
            console.error('[Agent] Failed to parse response:', error);
            console.debug('[Agent] Raw response:', response.slice(0, 500));
            return null;
        }
    }

    /**
     * Create history entry
     */
    private createHistoryEntry(
        observation: BrowserState,
        agentOutput: AgentOutput | null,
        results: ActionResult[],
        timing: { stepNumber: number; stepStartTime: number; stepEndTime: number }
    ): AgentHistory {
        return {
            modelOutput: agentOutput,
            result: results,
            state: {
                url: observation.url,
                title: observation.title,
                tabs: observation.tabs,
                interactedElement: agentOutput?.action.map(a => {
                    const index = getActionIndex(a);
                    if (index !== null && observation.selectorMap[index]) {
                        const el = observation.selectorMap[index];
                        return {
                            index,
                            tagName: el.nodeName.toLowerCase(),
                            role: el.axNode?.role || null,
                            text: el.nodeValue || '',
                            attributes: el.attributes,
                            xpath: '', // Would need XPath generation
                        };
                    }
                    return null;
                }).filter(Boolean) as any || null,
                screenshot: observation.screenshot,
            },
            metadata: {
                stepNumber: timing.stepNumber,
                stepStartTime: timing.stepStartTime,
                stepEndTime: timing.stepEndTime,
                stepInterval: null,
            },
            stateMessage: null,
        };
    }

    /**
     * Build final run result
     */
    private buildRunResult(): AgentRunResult {
        const lastHistory = this.history[this.history.length - 1];
        const lastResult = lastHistory?.result[lastHistory.result.length - 1];

        const success = lastResult?.success === true || (lastResult?.isDone === true && !lastResult.error);
        const finalMessage = lastResult?.extractedContent ||
            lastResult?.longTermMemory ||
            lastHistory?.modelOutput?.nextGoal ||
            'Task ended';

        return {
            success,
            finalMessage,
            totalSteps: this.state.nSteps,
            totalDuration: Date.now() - this.startTime,
            history: this.history,
        };
    }

    /**
     * Wait for resume from pause
     */
    private async waitForResume(): Promise<void> {
        while (this.state.paused && !this.state.stopped) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    /**
     * Attempt recovery after max failures
     */
    private async attemptRecovery(): Promise<boolean> {
        console.log('[Agent] Attempting recovery...');

        try {
            // Get current state
            const observation = await this.observe();

            // Create a recovery-focused prompt
            const messages = buildAgentPrompt({
                task: `RECOVERY MODE: The previous attempts have failed. 
                       Original task: ${this.config.task}
                       
                       Please either:
                       1. Try an alternative approach to complete the task
                       2. Call done with success=false and explain what went wrong`,
                browserState: serializeBrowserStateForLLM(observation),
                historyContext: this.buildHistoryContext(),
                stepInfo: {
                    stepNumber: this.state.nSteps,
                    maxSteps: this.settings.maxSteps,
                },
            });

            const response = await this.config.callLLM(messages);
            const parsed = this.parseResponse(response);

            if (parsed) {
                const results = await this.act(parsed);
                return results.some(r => r.isDone === true);
            }

        } catch (error) {
            console.error('[Agent] Recovery failed:', error);
        }

        return false;
    }

    // ============ Public Control Methods ============

    /**
     * Pause the agent
     */
    pause(): void {
        console.log('[Agent] Pausing...');
        this.state.paused = true;
    }

    /**
     * Resume the agent
     */
    resume(): void {
        console.log('[Agent] Resuming...');
        this.state.paused = false;
    }

    /**
     * Stop the agent
     */
    stop(): void {
        console.log('[Agent] Stopping...');
        this.state.stopped = true;
        this.running = false;
    }

    /**
     * Get current state
     */
    getState(): AgentState {
        return { ...this.state };
    }

    /**
     * Get history
     */
    getHistory(): AgentHistory[] {
        return [...this.history];
    }

    /**
     * Check if running
     */
    isRunning(): boolean {
        return this.running;
    }
}

// ============ Factory Function ============

/**
 * Create and run an agent
 */
export async function runAgent(config: AgentConfig): Promise<AgentRunResult> {
    const agent = new Agent(config);
    return agent.run();
}

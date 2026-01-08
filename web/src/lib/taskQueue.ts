/**
 * Task Queue Module - AutoGPT/BabyAGI Style Task Management
 * Handles subtask decomposition, prioritization, and execution tracking
 */

// ============ Types ============

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked'

export interface Task {
    id: string
    description: string
    status: TaskStatus
    priority: number // Higher = more important
    dependencies: string[] // IDs of tasks that must complete first
    parentTaskId?: string
    subtasks: string[] // IDs of subtasks
    result?: string
    error?: string
    createdAt: number
    updatedAt: number
    metadata?: Record<string, any>
}

export interface TaskQueueState {
    tasks: Map<string, Task>
    rootTaskId: string | null
    currentTaskId: string | null
    completedTaskIds: string[]
}

export interface SubtaskGenerationResult {
    subtasks: Array<{
        description: string
        priority?: number
    }>
    reasoning: string
}

// ============ Task Queue Class ============

export class TaskQueue {
    private state: TaskQueueState

    constructor() {
        this.state = {
            tasks: new Map(),
            rootTaskId: null,
            currentTaskId: null,
            completedTaskIds: []
        }
    }

    // ============ Task Creation ============

    /**
     * Create the root task (main goal)
     */
    createRootTask(description: string, metadata?: Record<string, any>): Task {
        const task = this.createTask(description, 100, [], metadata)
        this.state.rootTaskId = task.id
        return task
    }

    /**
     * Create a new task
     */
    createTask(
        description: string,
        priority: number = 50,
        dependencies: string[] = [],
        metadata?: Record<string, any>
    ): Task {
        const task: Task = {
            id: this.generateId(),
            description,
            status: 'pending',
            priority,
            dependencies,
            subtasks: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata
        }

        this.state.tasks.set(task.id, task)
        return task
    }

    /**
     * Add subtasks to a parent task
     */
    addSubtasks(parentTaskId: string, subtaskDescriptions: string[]): Task[] {
        const parent = this.state.tasks.get(parentTaskId)
        if (!parent) {
            throw new Error(`Parent task ${parentTaskId} not found`)
        }

        const subtasks = subtaskDescriptions.map((desc, index) => {
            const subtask = this.createTask(
                desc,
                parent.priority - (index + 1), // Decreasing priority
                index === 0 ? [] : [], // First subtask has no deps
                { parentTaskId }
            )
            subtask.parentTaskId = parentTaskId
            return subtask
        })

        // Link subtasks sequentially (each depends on the previous)
        for (let i = 1; i < subtasks.length; i++) {
            subtasks[i].dependencies = [subtasks[i - 1].id]
        }

        parent.subtasks = subtasks.map(s => s.id)
        parent.updatedAt = Date.now()

        return subtasks
    }

    // ============ Task Retrieval ============

    /**
     * Get the next task to execute
     */
    getNextTask(): Task | null {
        // Find pending tasks with all dependencies complete
        const ready: Task[] = []

        for (const task of this.state.tasks.values()) {
            if (task.status !== 'pending') continue

            // Check if all dependencies are complete
            const depsComplete = task.dependencies.every(depId => {
                const dep = this.state.tasks.get(depId)
                return dep && dep.status === 'completed'
            })

            if (depsComplete) {
                ready.push(task)
            }
        }

        if (ready.length === 0) return null

        // Sort by priority (highest first)
        ready.sort((a, b) => b.priority - a.priority)

        return ready[0]
    }

    /**
     * Get current task
     */
    getCurrentTask(): Task | null {
        if (!this.state.currentTaskId) return null
        return this.state.tasks.get(this.state.currentTaskId) || null
    }

    /**
     * Get root task
     */
    getRootTask(): Task | null {
        if (!this.state.rootTaskId) return null
        return this.state.tasks.get(this.state.rootTaskId) || null
    }

    /**
     * Get all tasks
     */
    getAllTasks(): Task[] {
        return Array.from(this.state.tasks.values())
    }

    /**
     * Get pending tasks
     */
    getPendingTasks(): Task[] {
        return this.getAllTasks().filter(t => t.status === 'pending')
    }

    // ============ Task Updates ============

    /**
     * Start executing a task
     */
    startTask(taskId: string): void {
        const task = this.state.tasks.get(taskId)
        if (!task) return

        task.status = 'in_progress'
        task.updatedAt = Date.now()
        this.state.currentTaskId = taskId
    }

    /**
     * Complete a task
     */
    completeTask(taskId: string, result?: string): void {
        const task = this.state.tasks.get(taskId)
        if (!task) return

        task.status = 'completed'
        task.result = result
        task.updatedAt = Date.now()

        this.state.completedTaskIds.push(taskId)

        if (this.state.currentTaskId === taskId) {
            this.state.currentTaskId = null
        }

        // Check if parent task should be completed
        if (task.parentTaskId) {
            this.checkParentCompletion(task.parentTaskId)
        }
    }

    /**
     * Mark a task as failed
     */
    failTask(taskId: string, error: string): void {
        const task = this.state.tasks.get(taskId)
        if (!task) return

        task.status = 'failed'
        task.error = error
        task.updatedAt = Date.now()

        if (this.state.currentTaskId === taskId) {
            this.state.currentTaskId = null
        }
    }

    /**
     * Block a task (waiting for user input)
     */
    blockTask(taskId: string, reason: string): void {
        const task = this.state.tasks.get(taskId)
        if (!task) return

        task.status = 'blocked'
        task.error = reason
        task.updatedAt = Date.now()
    }

    /**
     * Check if parent task should be marked complete
     */
    private checkParentCompletion(parentTaskId: string): void {
        const parent = this.state.tasks.get(parentTaskId)
        if (!parent) return

        // Check if all subtasks are complete
        const allComplete = parent.subtasks.every(id => {
            const subtask = this.state.tasks.get(id)
            return subtask && subtask.status === 'completed'
        })

        if (allComplete && parent.subtasks.length > 0) {
            parent.status = 'completed'
            parent.updatedAt = Date.now()
            this.state.completedTaskIds.push(parentTaskId)
        }
    }

    // ============ Progress Tracking ============

    /**
     * Get completion progress
     */
    getProgress(): { completed: number; total: number; percentage: number } {
        const all = this.getAllTasks()
        const completed = all.filter(t => t.status === 'completed').length

        return {
            completed,
            total: all.length,
            percentage: all.length > 0 ? Math.round((completed / all.length) * 100) : 0
        }
    }

    /**
     * Check if all tasks are complete
     */
    isComplete(): boolean {
        const root = this.getRootTask()
        return root?.status === 'completed' || false
    }

    /**
     * Check if any task has failed
     */
    hasFailed(): boolean {
        return this.getAllTasks().some(t => t.status === 'failed')
    }

    // ============ Serialization ============

    /**
     * Export state as JSON
     */
    toJSON(): Record<string, any> {
        return {
            tasks: Object.fromEntries(this.state.tasks),
            rootTaskId: this.state.rootTaskId,
            currentTaskId: this.state.currentTaskId,
            completedTaskIds: this.state.completedTaskIds
        }
    }

    /**
     * Import state from JSON
     */
    fromJSON(json: Record<string, any>): void {
        this.state = {
            tasks: new Map(Object.entries(json.tasks || {})),
            rootTaskId: json.rootTaskId || null,
            currentTaskId: json.currentTaskId || null,
            completedTaskIds: json.completedTaskIds || []
        }
    }

    /**
     * Format tasks for LLM prompt
     */
    formatForPrompt(): string {
        const sections: string[] = []

        const root = this.getRootTask()
        if (root) {
            sections.push(`Main Goal: ${root.description}`)
        }

        const completed = this.state.completedTaskIds.slice(-5)
        if (completed.length > 0) {
            const items = completed.map(id => {
                const task = this.state.tasks.get(id)
                return task ? `✓ ${task.description}` : null
            }).filter(Boolean)
            if (items.length > 0) {
                sections.push(`Recently Completed:\n${items.join('\n')}`)
            }
        }

        const pending = this.getPendingTasks().slice(0, 5)
        if (pending.length > 0) {
            sections.push(`Pending Tasks:\n${pending.map(t => `- ${t.description}`).join('\n')}`)
        }

        const current = this.getCurrentTask()
        if (current) {
            sections.push(`Current Task: ${current.description}`)
        }

        return sections.join('\n\n')
    }

    // ============ Utilities ============

    private generateId(): string {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * Clear all tasks
     */
    clear(): void {
        this.state = {
            tasks: new Map(),
            rootTaskId: null,
            currentTaskId: null,
            completedTaskIds: []
        }
    }
}

// ============ Factory Functions ============

/**
 * Create a new task queue
 */
export function createTaskQueue(): TaskQueue {
    return new TaskQueue()
}

/**
 * Parse LLM response into subtasks
 */
export function parseSubtaskGeneration(response: string): SubtaskGenerationResult {
    try {
        // Clean and parse JSON
        const cleaned = response
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim()

        const match = cleaned.match(/\{[\s\S]*\}/)
        if (match) {
            const parsed = JSON.parse(match[0])
            return {
                subtasks: parsed.subtasks || [],
                reasoning: parsed.reasoning || ''
            }
        }
    } catch (error) {
        console.error('[TaskQueue] Failed to parse subtask response:', error)
    }

    return { subtasks: [], reasoning: 'Failed to parse response' }
}

export function buildSubtaskPrompt(
    task: string,
    context: string,
    currentProgress?: string
): string {
    return `You are a task planner. Break down this task into subtasks.

Task: ${task}

Current Context:
${context}

${currentProgress ? `Progress So Far:\n${currentProgress}` : ''}

Generate 2-5 specific, actionable subtasks. Return JSON:
{
    "subtasks": [
        {"description": "...", "priority": number 1-10}
    ],
    "reasoning": "Brief explanation of the breakdown"
}

Important:
- Each subtask should be a single browser action or small set of actions
- Order subtasks logically
- Don't include sensitive data collection (passwords, payment)
- Mark form submissions as final steps

Return ONLY valid JSON.`
}

// ============ Subtask Generation from Action Result ============

import { callLLM, MODELS } from './llm'

/**
 * Generate 0-3 subtasks based on the action result
 * This is called after each action to dynamically create new tasks
 */
export async function generateSubtasksFromResult(
    originalGoal: string,
    lastActionResult: string,
    currentUrl: string,
    domContext?: string
): Promise<string[]> {
    const prompt = `Given the goal and current action result, generate 0-3 subtasks that logically move toward the goal.

ORIGINAL GOAL:
${originalGoal}

LAST ACTION RESULT:
${lastActionResult}

CURRENT PAGE:
URL: ${currentUrl}
${domContext ? `DOM Summary: ${domContext.slice(0, 500)}` : ''}

Rules:
- Only generate subtasks if more steps are needed
- Return empty array if goal is complete or no clear next steps
- Each subtask should be a single, specific action
- Don't repeat already completed actions

Respond with JSON:
{
    "subtasks": ["task1", "task2"],
    "reasoning": "Why these tasks are needed"
}

Return ONLY valid JSON.`

    try {
        const response = await callLLM(
            [
                { role: 'system', content: 'You are a task decomposition agent. Generate minimal, necessary subtasks.' },
                { role: 'user', content: prompt }
            ],
            MODELS.CONVERSATION
        )

        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = JSON.parse(cleaned)

        const subtasks = parsed.subtasks || []
        console.log(`[TaskQueue] Generated ${subtasks.length} subtasks:`, subtasks)
        return subtasks

    } catch (error) {
        console.error('[TaskQueue] Subtask generation failed:', error)
        return []
    }
}


/**
 * Metrics Collector - Agent Performance Tracking
 * Phase 10: Track task completion rate, steps, HITL frequency, etc.
 */

// ============ Types ============

export interface TaskMetrics {
    taskId: string;
    goal: string;
    startTime: number;
    endTime?: number;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    steps: StepMetric[];
    hitlEvents: HITLEvent[];
    errorRecoveries: number;
    success?: boolean;
}

export interface StepMetric {
    stepNumber: number;
    action: string;
    timestamp: number;
    success: boolean;
    duration: number;
    error?: string;
    confidence?: 'high' | 'medium' | 'low';
    fallbackUsed?: string;
}

export interface HITLEvent {
    timestamp: number;
    type: 'confirmation' | 'otp' | 'captcha' | 'credentials' | 'ambiguity' | 'error';
    reason: string;
    resolved: boolean;
    resolutionTime?: number;
}

export interface AggregateMetrics {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    taskCompletionRate: number;
    averageStepsPerTask: number;
    averageTaskDuration: number;
    hitlFrequency: number;
    errorRecoveryRate: number;
    successfulRecoveries: number;
    totalErrors: number;
}

// ============ Metrics Collector Class ============

export class MetricsCollector {
    private tasks: Map<string, TaskMetrics> = new Map();
    private currentTaskId: string | null = null;

    /**
     * Start tracking a new task
     */
    recordTaskStart(taskId: string, goal: string): void {
        const metrics: TaskMetrics = {
            taskId,
            goal,
            startTime: Date.now(),
            status: 'running',
            steps: [],
            hitlEvents: [],
            errorRecoveries: 0,
        };
        this.tasks.set(taskId, metrics);
        this.currentTaskId = taskId;
        console.log(`[Metrics] Task started: ${taskId}`);
    }

    /**
     * Record a step execution
     */
    recordStep(
        taskId: string,
        stepNumber: number,
        action: string,
        success: boolean,
        duration: number,
        options?: {
            error?: string;
            confidence?: 'high' | 'medium' | 'low';
            fallbackUsed?: string;
        }
    ): void {
        const task = this.tasks.get(taskId);
        if (!task) {
            console.warn(`[Metrics] Task not found: ${taskId}`);
            return;
        }

        task.steps.push({
            stepNumber,
            action,
            timestamp: Date.now(),
            success,
            duration,
            error: options?.error,
            confidence: options?.confidence,
            fallbackUsed: options?.fallbackUsed,
        });

        // Track error recovery
        if (!success && task.steps.length >= 2) {
            const prevStep = task.steps[task.steps.length - 2];
            if (!prevStep.success && success) {
                task.errorRecoveries++;
            }
        }
    }

    /**
     * Record a HITL event
     */
    recordHITL(
        taskId: string,
        type: HITLEvent['type'],
        reason: string
    ): void {
        const task = this.tasks.get(taskId);
        if (!task) return;

        task.hitlEvents.push({
            timestamp: Date.now(),
            type,
            reason,
            resolved: false,
        });
        console.log(`[Metrics] HITL event: ${type} - ${reason}`);
    }

    /**
     * Mark HITL event as resolved
     */
    resolveHITL(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task) return;

        const lastEvent = task.hitlEvents[task.hitlEvents.length - 1];
        if (lastEvent && !lastEvent.resolved) {
            lastEvent.resolved = true;
            lastEvent.resolutionTime = Date.now() - lastEvent.timestamp;
        }
    }

    /**
     * Record task completion
     */
    recordTaskEnd(taskId: string, success: boolean): void {
        const task = this.tasks.get(taskId);
        if (!task) return;

        task.endTime = Date.now();
        task.status = success ? 'completed' : 'failed';
        task.success = success;

        console.log(`[Metrics] Task ${success ? 'completed' : 'failed'}: ${taskId}`);
        console.log(`  Steps: ${task.steps.length}`);
        console.log(`  Duration: ${task.endTime - task.startTime}ms`);
        console.log(`  HITL events: ${task.hitlEvents.length}`);
    }

    /**
     * Cancel a task
     */
    recordTaskCancel(taskId: string): void {
        const task = this.tasks.get(taskId);
        if (!task) return;

        task.endTime = Date.now();
        task.status = 'cancelled';
    }

    /**
     * Get metrics for a specific task
     */
    getTaskMetrics(taskId: string): TaskMetrics | null {
        return this.tasks.get(taskId) || null;
    }

    /**
     * Get aggregate metrics across all tasks
     */
    getAggregateMetrics(): AggregateMetrics {
        const allTasks = Array.from(this.tasks.values());
        const completedTasks = allTasks.filter(t => t.status === 'completed');
        const failedTasks = allTasks.filter(t => t.status === 'failed');
        const finishedTasks = [...completedTasks, ...failedTasks];

        // Calculate averages
        const totalSteps = finishedTasks.reduce((sum, t) => sum + t.steps.length, 0);
        const totalDuration = finishedTasks.reduce((sum, t) =>
            sum + ((t.endTime || 0) - t.startTime), 0
        );
        const totalHITL = allTasks.reduce((sum, t) => sum + t.hitlEvents.length, 0);
        const totalRecoveries = allTasks.reduce((sum, t) => sum + t.errorRecoveries, 0);
        const totalErrors = allTasks.reduce((sum, t) =>
            sum + t.steps.filter(s => !s.success).length, 0
        );

        return {
            totalTasks: allTasks.length,
            completedTasks: completedTasks.length,
            failedTasks: failedTasks.length,
            taskCompletionRate: allTasks.length > 0
                ? Math.round((completedTasks.length / finishedTasks.length) * 100)
                : 0,
            averageStepsPerTask: finishedTasks.length > 0
                ? Math.round(totalSteps / finishedTasks.length)
                : 0,
            averageTaskDuration: finishedTasks.length > 0
                ? Math.round(totalDuration / finishedTasks.length)
                : 0,
            hitlFrequency: finishedTasks.length > 0
                ? Math.round((totalHITL / finishedTasks.length) * 100) / 100
                : 0,
            errorRecoveryRate: totalErrors > 0
                ? Math.round((totalRecoveries / totalErrors) * 100)
                : 100,
            successfulRecoveries: totalRecoveries,
            totalErrors,
        };
    }

    /**
     * Get current task metrics
     */
    getCurrentTaskMetrics(): TaskMetrics | null {
        if (!this.currentTaskId) return null;
        return this.tasks.get(this.currentTaskId) || null;
    }

    /**
     * Export all metrics as JSON
     */
    exportMetrics(): string {
        return JSON.stringify({
            aggregate: this.getAggregateMetrics(),
            tasks: Array.from(this.tasks.values()),
        }, null, 2);
    }

    /**
     * Format metrics for display
     */
    formatMetricsSummary(): string {
        const metrics = this.getAggregateMetrics();
        return `
=== Agent Metrics ===
Tasks: ${metrics.completedTasks}/${metrics.totalTasks} completed (${metrics.taskCompletionRate}%)
Avg Steps/Task: ${metrics.averageStepsPerTask}
Avg Duration: ${Math.round(metrics.averageTaskDuration / 1000)}s
HITL Frequency: ${metrics.hitlFrequency} per task
Error Recovery: ${metrics.errorRecoveryRate}% (${metrics.successfulRecoveries}/${metrics.totalErrors})
        `.trim();
    }

    /**
     * Reset all metrics
     */
    reset(): void {
        this.tasks.clear();
        this.currentTaskId = null;
        console.log('[Metrics] All metrics cleared');
    }

    /**
     * Get step-level analytics
     */
    getActionAnalytics(): Record<string, { total: number; success: number; avgDuration: number }> {
        const analytics: Record<string, { total: number; success: number; totalDuration: number }> = {};

        for (const task of this.tasks.values()) {
            for (const step of task.steps) {
                if (!analytics[step.action]) {
                    analytics[step.action] = { total: 0, success: 0, totalDuration: 0 };
                }
                analytics[step.action].total++;
                if (step.success) analytics[step.action].success++;
                analytics[step.action].totalDuration += step.duration;
            }
        }

        return Object.fromEntries(
            Object.entries(analytics).map(([action, data]) => [
                action,
                {
                    total: data.total,
                    success: data.success,
                    avgDuration: Math.round(data.totalDuration / data.total),
                },
            ])
        );
    }
}

// ============ Singleton Instance ============

let metricsInstance: MetricsCollector | null = null;

/**
 * Get or create the singleton metrics collector
 */
export function getMetricsCollector(): MetricsCollector {
    if (!metricsInstance) {
        metricsInstance = new MetricsCollector();
    }
    return metricsInstance;
}

/**
 * Reset the singleton instance
 */
export function resetMetrics(): void {
    metricsInstance?.reset();
    metricsInstance = null;
}

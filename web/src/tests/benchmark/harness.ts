/**
 * Benchmark Harness - Agent Evaluation Framework
 * Phase 9: Test harness for evaluating agent performance
 */

import type { CompletionCriterion } from '../../lib/agent/completionDetector';
import { getMetricsCollector, type AggregateMetrics } from '../../lib/agent/metrics';

// ============ Types ============

/**
 * Benchmark task definition
 */
export interface BenchmarkTask {
    id: string;
    name: string;
    description: string;
    goal: string;
    startUrl: string;
    successCriteria: CompletionCriterion[];
    maxSteps: number;
    timeout?: number;  // Max time in ms
    category?: 'navigation' | 'search' | 'form' | 'extraction' | 'multi-step';
    difficulty?: 'easy' | 'medium' | 'hard';
}

/**
 * Result of a single benchmark run
 */
export interface BenchmarkResult {
    taskId: string;
    taskName: string;
    success: boolean;
    steps: number;
    duration: number;
    hitlTriggered: boolean;
    hitlCount: number;
    errorRecoveries: number;
    completionConfidence: number;
    error?: string;
    timestamp: number;
}

/**
 * Summary of benchmark suite run
 */
export interface BenchmarkSummary {
    totalTasks: number;
    passedTasks: number;
    failedTasks: number;
    passRate: number;
    totalSteps: number;
    totalDuration: number;
    avgStepsPerTask: number;
    avgDuration: number;
    hitlTasks: number;
    results: BenchmarkResult[];
    aggregateMetrics: AggregateMetrics;
}

// ============ Sample Tasks ============

/**
 * Sample benchmark tasks for testing
 */
export const SAMPLE_TASKS: BenchmarkTask[] = [
    {
        id: 'nav-1',
        name: 'Simple Navigation',
        description: 'Navigate to RTI homepage',
        goal: 'Go to the RTI Online website',
        startUrl: 'about:blank',
        successCriteria: [
            { type: 'url_pattern', pattern: 'rtionline.gov.in' },
        ],
        maxSteps: 3,
        category: 'navigation',
        difficulty: 'easy',
    },
    {
        id: 'nav-2',
        name: 'Multi-hop Navigation',
        description: 'Navigate to RTI request page via guidelines',
        goal: 'Go to RTI Online and find the Submit RTI Request page',
        startUrl: 'about:blank',
        successCriteria: [
            { type: 'url_pattern', pattern: 'guidelines.php.*request' },
            { type: 'text_match', text: 'submit' },
        ],
        maxSteps: 5,
        category: 'navigation',
        difficulty: 'medium',
    },
    {
        id: 'search-1',
        name: 'Web Search',
        description: 'Search for a government scholarship',
        goal: 'Search for "National Scholarship Portal" on Google',
        startUrl: 'https://google.com',
        successCriteria: [
            { type: 'url_pattern', pattern: 'search.*National.*Scholarship' },
            { type: 'text_match', text: 'scholarship' },
        ],
        maxSteps: 3,
        category: 'search',
        difficulty: 'easy',
    },
];

// ============ Benchmark Runner ============

/**
 * Run a single benchmark task
 * Note: This is a framework - actual execution requires browser integration
 */
export async function runSingleBenchmark(
    task: BenchmarkTask,
    executeTask: (goal: string, startUrl: string, maxSteps: number) => Promise<{
        success: boolean;
        steps: number;
        hitlTriggered: boolean;
        hitlCount: number;
        errorRecoveries: number;
        completionConfidence: number;
        error?: string;
    }>
): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const metrics = getMetricsCollector();

    // Record task start in metrics
    metrics.recordTaskStart(task.id, task.goal);

    try {
        // Execute the task
        const result = await executeTask(task.goal, task.startUrl, task.maxSteps);

        const duration = Date.now() - startTime;

        // Record task end
        metrics.recordTaskEnd(task.id, result.success);

        return {
            taskId: task.id,
            taskName: task.name,
            success: result.success,
            steps: result.steps,
            duration,
            hitlTriggered: result.hitlTriggered,
            hitlCount: result.hitlCount,
            errorRecoveries: result.errorRecoveries,
            completionConfidence: result.completionConfidence,
            error: result.error,
            timestamp: startTime,
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        metrics.recordTaskEnd(task.id, false);

        return {
            taskId: task.id,
            taskName: task.name,
            success: false,
            steps: 0,
            duration,
            hitlTriggered: false,
            hitlCount: 0,
            errorRecoveries: 0,
            completionConfidence: 0,
            error: (error as Error).message,
            timestamp: startTime,
        };
    }
}

/**
 * Run a benchmark suite
 */
export async function runBenchmarkSuite(
    tasks: BenchmarkTask[],
    executeTask: (goal: string, startUrl: string, maxSteps: number) => Promise<{
        success: boolean;
        steps: number;
        hitlTriggered: boolean;
        hitlCount: number;
        errorRecoveries: number;
        completionConfidence: number;
        error?: string;
    }>
): Promise<BenchmarkSummary> {
    const results: BenchmarkResult[] = [];
    const metrics = getMetricsCollector();

    console.log(`[Benchmark] Starting suite with ${tasks.length} tasks`);

    for (const task of tasks) {
        console.log(`[Benchmark] Running: ${task.name}`);
        const result = await runSingleBenchmark(task, executeTask);
        results.push(result);
        console.log(`[Benchmark] ${result.success ? '✓' : '✗'} ${task.name} (${result.steps} steps, ${result.duration}ms)`);
    }

    // Calculate summary
    const passedTasks = results.filter(r => r.success).length;
    const totalSteps = results.reduce((sum, r) => sum + r.steps, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const hitlTasks = results.filter(r => r.hitlTriggered).length;

    return {
        totalTasks: tasks.length,
        passedTasks,
        failedTasks: tasks.length - passedTasks,
        passRate: Math.round((passedTasks / tasks.length) * 100),
        totalSteps,
        totalDuration,
        avgStepsPerTask: Math.round(totalSteps / tasks.length),
        avgDuration: Math.round(totalDuration / tasks.length),
        hitlTasks,
        results,
        aggregateMetrics: metrics.getAggregateMetrics(),
    };
}

/**
 * Format benchmark summary for display
 */
export function formatBenchmarkSummary(summary: BenchmarkSummary): string {
    const lines = [
        '═══════════════════════════════════════',
        '         BENCHMARK RESULTS             ',
        '═══════════════════════════════════════',
        '',
        `Tasks: ${summary.passedTasks}/${summary.totalTasks} passed (${summary.passRate}%)`,
        `Total Steps: ${summary.totalSteps}`,
        `Total Duration: ${Math.round(summary.totalDuration / 1000)}s`,
        `Avg Steps/Task: ${summary.avgStepsPerTask}`,
        `Avg Duration: ${Math.round(summary.avgDuration / 1000)}s`,
        `HITL Required: ${summary.hitlTasks} tasks`,
        '',
        '─── Individual Results ───',
        '',
    ];

    for (const result of summary.results) {
        const status = result.success ? '✓' : '✗';
        lines.push(`${status} ${result.taskName}`);
        lines.push(`   Steps: ${result.steps}, Duration: ${result.duration}ms, Confidence: ${result.completionConfidence}%`);
        if (result.error) {
            lines.push(`   Error: ${result.error}`);
        }
    }

    lines.push('');
    lines.push('═══════════════════════════════════════');

    return lines.join('\n');
}

/**
 * Create a custom benchmark task
 */
export function createTask(
    id: string,
    name: string,
    goal: string,
    startUrl: string,
    successCriteria: CompletionCriterion[],
    maxSteps: number = 10
): BenchmarkTask {
    return {
        id,
        name,
        description: goal,
        goal,
        startUrl,
        successCriteria,
        maxSteps,
    };
}

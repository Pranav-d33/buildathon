/**
 * Benchmark Runner - Phase 11 Model Comparison Framework
 * Runs tasks across different models and collects comparative metrics
 */

import {
    BenchmarkTask,
    BenchmarkResult,
    BenchmarkSummary,
    runSingleBenchmark,
    formatBenchmarkSummary,
    SAMPLE_TASKS
} from './harness';
import {
    MODELS,
    setActiveModel,
    resetModels,
    getModelInfo,
    type ModelAlternativeKey
} from '../../lib/llm';
import { getMetricsCollector, resetMetrics } from '../../lib/agent/metrics';

// ============ Types ============

/**
 * Model benchmark result with model metadata
 */
export interface ModelBenchmarkResult {
    model: string;
    modelKey: ModelAlternativeKey;
    visionEnabled: boolean;
    summary: BenchmarkSummary;
    timestamp: number;
}

/**
 * Comparative results across models
 */
export interface ModelComparisonMatrix {
    models: ModelBenchmarkResult[];
    bestModel: {
        bySuccessRate: ModelAlternativeKey;
        bySteps: ModelAlternativeKey;
        bySpeed: ModelAlternativeKey;
    };
    generatedAt: string;
}

// ============ Model Benchmark Runner ============

/**
 * Run benchmarks for a single model
 */
export async function runModelBenchmark(
    modelKey: ModelAlternativeKey,
    tasks: BenchmarkTask[],
    executeTask: (goal: string, startUrl: string, maxSteps: number) => Promise<{
        success: boolean;
        steps: number;
        hitlTriggered: boolean;
        hitlCount: number;
        errorRecoveries: number;
        completionConfidence: number;
        error?: string;
    }>,
    visionEnabled: boolean = false
): Promise<ModelBenchmarkResult> {
    console.log(`\n[Benchmark] Testing model: ${modelKey}`);

    // Set active model
    setActiveModel(modelKey);
    resetMetrics();

    const modelInfo = getModelInfo();
    console.log(`[Benchmark] Using: ${modelInfo.conversation}`);

    // Run the benchmark suite
    const results: BenchmarkResult[] = [];
    const metrics = getMetricsCollector();

    for (const task of tasks) {
        console.log(`  Running: ${task.name}`);
        const result = await runSingleBenchmark(task, executeTask);
        results.push(result);
        console.log(`  ${result.success ? '✓' : '✗'} ${task.name} (${result.steps} steps)`);
    }

    // Calculate summary
    const passedTasks = results.filter(r => r.success).length;
    const totalSteps = results.reduce((sum, r) => sum + r.steps, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const hitlTasks = results.filter(r => r.hitlTriggered).length;

    const summary: BenchmarkSummary = {
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

    return {
        model: MODELS.ALTERNATIVES[modelKey],
        modelKey,
        visionEnabled,
        summary,
        timestamp: Date.now(),
    };
}

/**
 * Run benchmarks across multiple models and compare
 */
export async function runModelComparison(
    modelKeys: ModelAlternativeKey[],
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
): Promise<ModelComparisonMatrix> {
    console.log('═══════════════════════════════════════');
    console.log('    MODEL COMPARISON BENCHMARK');
    console.log('═══════════════════════════════════════');
    console.log(`Testing ${modelKeys.length} models on ${tasks.length} tasks\n`);

    const results: ModelBenchmarkResult[] = [];

    for (const modelKey of modelKeys) {
        try {
            const result = await runModelBenchmark(modelKey, tasks, executeTask);
            results.push(result);
        } catch (error) {
            console.error(`[Benchmark] Error with model ${modelKey}:`, error);
        }
    }

    // Reset to default
    resetModels();

    // Find best performers
    const bySuccessRate = results.reduce((best, curr) =>
        curr.summary.passRate > best.summary.passRate ? curr : best
    );
    const bySteps = results.reduce((best, curr) =>
        curr.summary.avgStepsPerTask < best.summary.avgStepsPerTask ? curr : best
    );
    const bySpeed = results.reduce((best, curr) =>
        curr.summary.avgDuration < best.summary.avgDuration ? curr : best
    );

    return {
        models: results,
        bestModel: {
            bySuccessRate: bySuccessRate.modelKey,
            bySteps: bySteps.modelKey,
            bySpeed: bySpeed.modelKey,
        },
        generatedAt: new Date().toISOString(),
    };
}

// ============ Report Generation ============

/**
 * Generate markdown report from comparison matrix
 */
export function generateComparisonReport(matrix: ModelComparisonMatrix): string {
    const lines: string[] = [
        '# Model Performance Matrix',
        '',
        `**Generated**: ${matrix.generatedAt}`,
        '',
        '## Summary',
        '',
        '| Model | Success Rate | Avg Steps | Avg Duration | HITL Tasks |',
        '|-------|-------------|-----------|--------------|------------|',
    ];

    for (const result of matrix.models) {
        const s = result.summary;
        lines.push(
            `| ${result.modelKey} | ${s.passRate}% | ${s.avgStepsPerTask} | ${Math.round(s.avgDuration / 1000)}s | ${s.hitlTasks} |`
        );
    }

    lines.push('');
    lines.push('## Best Performers');
    lines.push('');
    lines.push(`- **Highest Success Rate**: ${matrix.bestModel.bySuccessRate}`);
    lines.push(`- **Fewest Steps**: ${matrix.bestModel.bySteps}`);
    lines.push(`- **Fastest**: ${matrix.bestModel.bySpeed}`);
    lines.push('');

    // Detailed results per model
    lines.push('## Detailed Results');
    lines.push('');

    for (const result of matrix.models) {
        lines.push(`### ${result.modelKey}`);
        lines.push('');
        lines.push(`Model: \`${result.model}\``);
        lines.push('');
        lines.push('| Task | Success | Steps | Duration |');
        lines.push('|------|---------|-------|----------|');

        for (const r of result.summary.results) {
            lines.push(`| ${r.taskName} | ${r.success ? '✓' : '✗'} | ${r.steps} | ${r.duration}ms |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ============ Free Tier Quick Test ============

/**
 * Quick benchmark using only free tier models
 */
export const FREE_TIER_MODELS: ModelAlternativeKey[] = [
    'MISTRAL_7B',
    'GEMINI_FLASH',
    'LLAMA_3_8B',
    'QWEN_7B',
];

/**
 * Export for CLI/script usage
 */
export { SAMPLE_TASKS, formatBenchmarkSummary };

import {
    getBenchmarkBudgetSettings,
    isDeadlineReached,
    keepBestMatch,
} from './benchmark_search_budget';

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

const defaultSettings = getBenchmarkBudgetSettings({});

assertEqual(defaultSettings.maxSeconds, 60, 'Default benchmark budget should be one minute');
assertEqual(defaultSettings.batchSize, 10000, 'Default benchmark batch size should be conservative');
assertEqual(defaultSettings.modes.join(','), 'stream,cache', 'Default benchmark should cover stream and cache');

const cappedSettings = getBenchmarkBudgetSettings({
    BENCH_MAX_SECONDS: '300',
    BENCH_BATCH_SIZE: '500',
    BENCH_MODES: 'cache,broken,old,stream',
});

assertEqual(cappedSettings.maxSeconds, 60, 'Benchmark budget should be capped to one minute');
assertEqual(cappedSettings.batchSize, 500, 'Benchmark batch size should be parsed from env');
assertEqual(cappedSettings.modes.join(','), 'cache,old,stream', 'Invalid benchmark modes should be ignored');

const fallbackSettings = getBenchmarkBudgetSettings({
    BENCH_MAX_SECONDS: '-1',
    BENCH_BATCH_SIZE: '0',
    BENCH_MODES: 'unknown',
});

assertEqual(fallbackSettings.maxSeconds, 60, 'Invalid benchmark budget should fall back to one minute');
assertEqual(fallbackSettings.batchSize, 10000, 'Invalid batch size should fall back to default');
assertEqual(fallbackSettings.modes.join(','), 'stream,cache', 'Empty parsed mode list should fall back to defaults');

assert(!isDeadlineReached(1000, 999), 'Deadline should not be reached before target time');
assert(isDeadlineReached(1000, 1000), 'Deadline should be reached at target time');

const firstMatch = keepBestMatch(undefined, {
    id: 1,
    text: 'низкая оценка',
    score: 0.5,
});
const bestMatch = keepBestMatch(firstMatch, {
    id: 2,
    text: 'лучшая оценка',
    score: 0.9,
});
const unchangedMatch = keepBestMatch(bestMatch, {
    id: 3,
    text: 'хуже текущей',
    score: 0.7,
});

assertEqual(firstMatch?.id, 1, 'First match should be accepted');
assertEqual(bestMatch?.id, 2, 'Higher score should replace previous match');
assertEqual(unchangedMatch?.id, 2, 'Lower score should not replace best match');

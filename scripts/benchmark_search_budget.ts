import { PrismaClient, Question } from '@prisma/client';
import { performance } from 'perf_hooks';
import { JaroWinklerDistance, SentenceTokenizer } from 'natural';
import { compareTwoStrings } from 'string-similarity';

export type BenchmarkMode = 'stream' | 'cache' | 'old';

export interface BenchmarkBudgetSettings {
    readonly maxSeconds: number;
    readonly batchSize: number;
    readonly modes: readonly BenchmarkMode[];
}

export interface BenchmarkMatch {
    readonly id: number;
    readonly text: string;
    readonly score: number;
}

interface QuestionRecord {
    readonly id: number;
    readonly text: string;
}

interface QueryBenchmarkResult {
    readonly query: string;
    readonly completed: boolean;
    readonly scannedRecords: number;
    readonly elapsedMs: number;
    readonly bestMatch?: BenchmarkMatch;
}

interface ModeBenchmarkResult {
    readonly mode: BenchmarkMode;
    readonly completed: boolean;
    readonly completedQueries: number;
    readonly scannedRecords: number;
    readonly loadedRecords?: number;
    readonly cacheLoaded?: boolean;
    readonly elapsedMs: number;
    readonly queries: readonly QueryBenchmarkResult[];
}

type BenchmarkEnv = Record<string, string | undefined>;

const maxAllowedSeconds = 60;
const defaultSettings: BenchmarkBudgetSettings = {
    maxSeconds: 60,
    batchSize: 10000,
    modes: ['stream', 'cache'],
};

const tokenizer = new SentenceTokenizer();

export function getBenchmarkBudgetSettings(env: BenchmarkEnv = process.env): BenchmarkBudgetSettings {
    return {
        maxSeconds: parseCappedPositiveInteger(env.BENCH_MAX_SECONDS, defaultSettings.maxSeconds, maxAllowedSeconds),
        batchSize: parsePositiveInteger(env.BENCH_BATCH_SIZE, defaultSettings.batchSize),
        modes: parseBenchmarkModes(env.BENCH_MODES),
    };
}

export function isDeadlineReached(deadlineMs: number, nowMs: number = performance.now()): boolean {
    return nowMs >= deadlineMs;
}

export function keepBestMatch(
    currentMatch: BenchmarkMatch | undefined,
    candidateMatch: BenchmarkMatch,
): BenchmarkMatch {
    if (currentMatch === undefined || candidateMatch.score > currentMatch.score) {
        return candidateMatch;
    }

    return currentMatch;
}

async function main(): Promise<void> {
    const settings = getBenchmarkBudgetSettings();
    const prisma = new PrismaClient();
    const startedAt = performance.now();
    const deadlineMs = startedAt + settings.maxSeconds * 1000;

    try {
        const queryCases = getBenchmarkQueries();
        const questionsCount = await prisma.question.count();

        console.log(`One-minute benchmark budget: ${settings.maxSeconds} sec`);
        console.log(`Questions in DB: ${questionsCount}`);
        console.log(`Batch size: ${settings.batchSize}`);
        console.log(`Modes: ${settings.modes.join(', ')}`);
        console.log(`Queries: ${queryCases.length}`);

        for (const mode of settings.modes) {
            if (isDeadlineReached(deadlineMs)) {
                break;
            }

            const result = await benchmarkMode(prisma, mode, queryCases, settings.batchSize, deadlineMs);

            printModeResult(result);
        }

        console.log(`Total elapsed: ${formatMs(performance.now() - startedAt)}`);
        console.log(`Deadline reached: ${isDeadlineReached(deadlineMs) ? 'yes' : 'no'}`);
    } finally {
        await prisma.$disconnect();
    }
}

async function benchmarkMode(
    prisma: PrismaClient,
    mode: BenchmarkMode,
    queries: readonly string[],
    batchSize: number,
    deadlineMs: number,
): Promise<ModeBenchmarkResult> {
    if (mode === 'old') {
        return benchmarkOldMode(prisma, queries, batchSize, deadlineMs);
    }

    if (mode === 'stream') {
        return benchmarkStreamMode(prisma, queries, batchSize, deadlineMs);
    }

    return benchmarkCacheMode(prisma, queries, batchSize, deadlineMs);
}

async function benchmarkOldMode(
    prisma: PrismaClient,
    queries: readonly string[],
    batchSize: number,
    deadlineMs: number,
): Promise<ModeBenchmarkResult> {
    const startedAt = performance.now();
    const results: QueryBenchmarkResult[] = [];

    for (const query of queries) {
        if (isDeadlineReached(deadlineMs)) {
            break;
        }

        const result = await scanDatabaseForQueryOldStyle(prisma, query, batchSize, deadlineMs);
        results.push(result);

        if (!result.completed) {
            break;
        }
    }

    return {
        mode: 'old',
        completed: results.length === queries.length && results.every(result => result.completed),
        completedQueries: results.filter(result => result.completed).length,
        scannedRecords: results.reduce((total, result) => total + result.scannedRecords, 0),
        elapsedMs: performance.now() - startedAt,
        queries: results,
    };
}

async function benchmarkStreamMode(
    prisma: PrismaClient,
    queries: readonly string[],
    batchSize: number,
    deadlineMs: number,
): Promise<ModeBenchmarkResult> {
    const startedAt = performance.now();
    const results: QueryBenchmarkResult[] = [];

    for (const query of queries) {
        if (isDeadlineReached(deadlineMs)) {
            break;
        }

        const result = await scanDatabaseForQuery(prisma, query, batchSize, deadlineMs);
        results.push(result);

        if (!result.completed) {
            break;
        }
    }

    return {
        mode: 'stream',
        completed: results.length === queries.length && results.every(result => result.completed),
        completedQueries: results.filter(result => result.completed).length,
        scannedRecords: results.reduce((total, result) => total + result.scannedRecords, 0),
        elapsedMs: performance.now() - startedAt,
        queries: results,
    };
}

async function benchmarkCacheMode(
    prisma: PrismaClient,
    queries: readonly string[],
    batchSize: number,
    deadlineMs: number,
): Promise<ModeBenchmarkResult> {
    const startedAt = performance.now();
    const cacheResult = await loadCacheWithinBudget(prisma, batchSize, deadlineMs);
    const results: QueryBenchmarkResult[] = [];

    if (cacheResult.completed) {
        for (const query of queries) {
            if (isDeadlineReached(deadlineMs)) {
                break;
            }

            const result = scanMemoryForQuery(cacheResult.records, query, deadlineMs);
            results.push(result);

            if (!result.completed) {
                break;
            }
        }
    }

    return {
        mode: 'cache',
        completed: cacheResult.completed && results.length === queries.length && results.every(result => result.completed),
        completedQueries: results.filter(result => result.completed).length,
        scannedRecords: results.reduce((total, result) => total + result.scannedRecords, 0),
        loadedRecords: cacheResult.records.length,
        cacheLoaded: cacheResult.completed,
        elapsedMs: performance.now() - startedAt,
        queries: results,
    };
}

async function scanDatabaseForQuery(
    prisma: PrismaClient,
    query: string,
    batchSize: number,
    deadlineMs: number,
): Promise<QueryBenchmarkResult> {
    const startedAt = performance.now();
    const querySentences = tokenizeText(query);
    let cursorId: number | undefined = undefined;
    let scannedRecords = 0;
    let bestMatch: BenchmarkMatch | undefined = undefined;

    while (!isDeadlineReached(deadlineMs)) {
        const records = await loadQuestionBatch(prisma, cursorId, batchSize);

        if (records.length === 0) {
            return {
                query,
                completed: true,
                scannedRecords,
                elapsedMs: performance.now() - startedAt,
                bestMatch,
            };
        }

        const scanResult = scanRecords(records, querySentences, deadlineMs, bestMatch);
        scannedRecords += scanResult.scannedRecords;
        bestMatch = scanResult.bestMatch;
        cursorId = records[records.length - 1].id;

        if (!scanResult.completed) {
            break;
        }
    }

    return {
        query,
        completed: false,
        scannedRecords,
        elapsedMs: performance.now() - startedAt,
        bestMatch,
    };
}

async function scanDatabaseForQueryOldStyle(
    prisma: PrismaClient,
    query: string,
    batchSize: number,
    deadlineMs: number,
): Promise<QueryBenchmarkResult> {
    const startedAt = performance.now();
    const querySentences = tokenizeText(query);
    const acceptedMatches: BenchmarkMatch[] = [];
    let cursorId: number | undefined = undefined;
    let scannedRecords = 0;
    let bestMatch: BenchmarkMatch | undefined = undefined;

    while (!isDeadlineReached(deadlineMs)) {
        const records = await loadQuestionBatch(prisma, cursorId, batchSize);

        if (records.length === 0) {
            return {
                query,
                completed: true,
                scannedRecords,
                elapsedMs: performance.now() - startedAt,
                bestMatch: sortAndPickBestMatch(acceptedMatches),
            };
        }

        for (const record of records) {
            scannedRecords++;

            if (scannedRecords % 1000 === 0 && isDeadlineReached(deadlineMs)) {
                return {
                    query,
                    completed: false,
                    scannedRecords,
                    elapsedMs: performance.now() - startedAt,
                    bestMatch,
                };
            }

            for (const querySentence of querySentences) {
                const score = calculateQuestionScore(querySentence, record);

                if (score >= 0.4) {
                    const match = { id: record.id, text: record.text, score };
                    acceptedMatches.push(match);
                    bestMatch = keepBestMatch(bestMatch, match);
                }
            }
        }

        cursorId = records[records.length - 1].id;
    }

    return {
        query,
        completed: false,
        scannedRecords,
        elapsedMs: performance.now() - startedAt,
        bestMatch,
    };
}

function scanMemoryForQuery(
    records: readonly QuestionRecord[],
    query: string,
    deadlineMs: number,
): QueryBenchmarkResult {
    const startedAt = performance.now();
    const querySentences = tokenizeText(query);
    const scanResult = scanRecords(records, querySentences, deadlineMs, undefined);

    return {
        query,
        completed: scanResult.completed,
        scannedRecords: scanResult.scannedRecords,
        elapsedMs: performance.now() - startedAt,
        bestMatch: scanResult.bestMatch,
    };
}

function scanRecords(
    records: readonly QuestionRecord[],
    querySentences: readonly string[],
    deadlineMs: number,
    initialBestMatch: BenchmarkMatch | undefined,
): { completed: boolean; scannedRecords: number; bestMatch?: BenchmarkMatch } {
    let bestMatch = initialBestMatch;
    let scannedRecords = 0;

    for (const record of records) {
        scannedRecords++;

        if (scannedRecords % 1000 === 0 && isDeadlineReached(deadlineMs)) {
            return { completed: false, scannedRecords, bestMatch };
        }

        for (const querySentence of querySentences) {
            const score = calculateQuestionScore(querySentence, record);

            if (score >= 0.4) {
                bestMatch = keepBestMatch(bestMatch, {
                    id: record.id,
                    text: record.text,
                    score,
                });
            }
        }
    }

    return { completed: true, scannedRecords, bestMatch };
}

async function loadCacheWithinBudget(
    prisma: PrismaClient,
    batchSize: number,
    deadlineMs: number,
): Promise<{ completed: boolean; records: QuestionRecord[] }> {
    const records: QuestionRecord[] = [];
    let cursorId: number | undefined = undefined;

    while (!isDeadlineReached(deadlineMs)) {
        const batch = await loadQuestionBatch(prisma, cursorId, batchSize);

        if (batch.length === 0) {
            return { completed: true, records };
        }

        records.push(...batch);
        cursorId = batch[batch.length - 1].id;
    }

    return { completed: false, records };
}

async function loadQuestionBatch(
    prisma: PrismaClient,
    cursorId: number | undefined,
    batchSize: number,
): Promise<QuestionRecord[]> {
    return prisma.question.findMany({
        select: { id: true, text: true },
        where: cursorId === undefined ? {} : { id: { gt: cursorId } },
        orderBy: { id: 'asc' },
        take: batchSize,
    });
}

function calculateQuestionScore(queryQuestion: string, question: Pick<Question, 'text'>): number {
    const jaroWinklerScore = JaroWinklerDistance(queryQuestion, question.text, {});
    const cosineScore = compareTwoStrings(queryQuestion, question.text);

    return (cosineScore * 2 + jaroWinklerScore) / 3;
}

function sortAndPickBestMatch(matches: BenchmarkMatch[]): BenchmarkMatch | undefined {
    matches.sort((left, right) => right.score - left.score);
    return matches[0];
}

function tokenizeText(text: string): string[] {
    return tokenizer.tokenize(text.toLowerCase()) || [];
}

function getBenchmarkQueries(): string[] {
    return [
        'Ты человек?',
        'Ты бот или человек?',
        'Ты ии?',
        'Напиши простенький скрипт на рандомный бросок кубика',
        'окак',
        'Мозг — центральный отдел нервной системы животных, обычно расположенный в головном отделе тела.',
    ];
}

function printModeResult(result: ModeBenchmarkResult): void {
    console.log('');
    console.log(`${result.mode}:`);
    console.log(`  completed: ${result.completed ? 'yes' : 'no'}`);
    console.log(`  completed queries: ${result.completedQueries}/${result.queries.length}`);
    console.log(`  scanned records: ${result.scannedRecords}`);

    if (result.loadedRecords !== undefined) {
        console.log(`  loaded records: ${result.loadedRecords}`);
        console.log(`  cache loaded: ${result.cacheLoaded ? 'yes' : 'no'}`);
    }

    console.log(`  elapsed: ${formatMs(result.elapsedMs)}`);

    for (const queryResult of result.queries) {
        console.log(`  - ${shorten(queryResult.query)}`);
        console.log(`    completed: ${queryResult.completed ? 'yes' : 'no'}`);
        console.log(`    scanned: ${queryResult.scannedRecords}`);
        console.log(`    elapsed: ${formatMs(queryResult.elapsedMs)}`);
        console.log(`    best: ${formatMatch(queryResult.bestMatch)}`);
    }
}

function formatMatch(match: BenchmarkMatch | undefined): string {
    if (match === undefined) {
        return 'not found';
    }

    return `#${match.id} score=${match.score.toFixed(4)} "${shorten(match.text)}"`;
}

function shorten(text: string): string {
    const normalizedText = text.replace(/\s+/g, ' ').trim();

    if (normalizedText.length <= 100) {
        return normalizedText;
    }

    return `${normalizedText.slice(0, 97)}...`;
}

function formatMs(value: number): string {
    return `${value.toFixed(1)} ms`;
}

function parseBenchmarkModes(value: string | undefined): readonly BenchmarkMode[] {
    if (value === undefined) {
        return defaultSettings.modes;
    }

    const modes = value
        .split(',')
        .map(mode => mode.trim())
        .filter(isBenchmarkMode)
        .filter((mode, index, list) => list.indexOf(mode) === index);

    return modes.length > 0 ? modes : defaultSettings.modes;
}

function isBenchmarkMode(value: string): value is BenchmarkMode {
    return value === 'stream' || value === 'cache' || value === 'old';
}

function parseCappedPositiveInteger(value: string | undefined, fallback: number, maxValue: number): number {
    return Math.min(parsePositiveInteger(value, fallback), maxValue);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    if (value === undefined) {
        return fallback;
    }

    const parsedValue = Number(value);

    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

import { PrismaClient, Question } from '@prisma/client';
import { performance } from 'perf_hooks';
import { JaroWinklerDistance, SentenceTokenizer } from 'natural';
import { compareTwoStrings } from 'string-similarity';
import { clearTextSearchCache, findTextMatches, TextSearchRepository } from '../src/engine/reseacher/text_search';

interface QueryCase {
    readonly text: string;
}

interface BenchmarkResult {
    readonly name: string;
    readonly totalMs: number;
    readonly averageMs: number;
}

type QuestionWithAnswers = Question & { answers: { id: number }[] };

const prisma = new PrismaClient();
const tokenizer = new SentenceTokenizer();

const questionRepository: TextSearchRepository<Question> = {
    async loadAll(): Promise<readonly Question[]> {
        return prisma.question.findMany({
            orderBy: { id: 'asc' },
        });
    },

    async loadBatch(cursorId: number | undefined, batchSize: number): Promise<readonly Question[]> {
        return prisma.question.findMany({
            where: cursorId === undefined ? {} : { id: { gt: cursorId } },
            orderBy: { id: 'asc' },
            take: batchSize,
        });
    },
};

async function main(): Promise<void> {
    const questions = await prisma.question.findMany({
        orderBy: { id: 'asc' },
        include: { answers: { select: { id: true }, take: 1 } },
    });
    const queryCases = buildQueryCases(questions);

    await warmup(questions, queryCases.slice(0, 5));

    clearTextSearchCache();

    const oldMemoryResult = await benchmark('old memory', queryCases, async queryCase => {
        oldSearch(tokenizeText(queryCase.text), questions);
    });

    const oldRealResult = await benchmark('old real', queryCases, async queryCase => {
        await oldSearchFromDatabase(tokenizeText(queryCase.text));
    });

    clearTextSearchCache();

    const streamResult = await benchmark('stream', queryCases, async queryCase => {
        await findTextMatches({
            cacheKey: 'benchmark-stream',
            queries: tokenizeText(queryCase.text),
            repository: questionRepository,
            settings: { mode: 'stream', batchSize: 10000, topLimit: 1 },
            score: calculateQuestionScore,
            accept: score => score >= 0.4,
        });
    });

    clearTextSearchCache();

    const cacheColdResult = await benchmark('cache cold', queryCases.slice(0, 1), async queryCase => {
        await findTextMatches({
            cacheKey: 'benchmark-cache',
            queries: tokenizeText(queryCase.text),
            repository: questionRepository,
            settings: { mode: 'cache', batchSize: 10000, topLimit: 1 },
            score: calculateQuestionScore,
            accept: score => score >= 0.4,
        });
    });

    const cacheWarmResult = await benchmark('cache warm', queryCases, async queryCase => {
        await findTextMatches({
            cacheKey: 'benchmark-cache',
            queries: tokenizeText(queryCase.text),
            repository: questionRepository,
            settings: { mode: 'cache', batchSize: 10000, topLimit: 1 },
            score: calculateQuestionScore,
            accept: score => score >= 0.4,
        });
    });

    printResults(
        [oldMemoryResult, oldRealResult, streamResult, cacheColdResult, cacheWarmResult],
        questions.length,
        queryCases.length,
    );
}

function buildQueryCases(questions: readonly QuestionWithAnswers[]): QueryCase[] {
    const exactLimit = getPositiveIntegerEnv('BENCH_EXACT_LIMIT', 30);
    const noisyLimit = getPositiveIntegerEnv('BENCH_NOISY_LIMIT', 30);
    const liveLimit = getPositiveIntegerEnv('BENCH_LIVE_LIMIT', 6);
    const answeredQuestions = questions.filter(question => question.answers.length > 0);
    const exactQuestions = takeSpread(answeredQuestions, exactLimit);
    const noisyQuestions = takeSpread(answeredQuestions.filter(question => question.text.split(/\s+/).length >= 3), noisyLimit);

    return [
        ...exactQuestions.map(question => ({ text: question.text })),
        ...noisyQuestions.map(question => ({ text: makeNoisyQuestion(question.text) })),
        ...getLiveQueryCases().slice(0, liveLimit),
    ];
}

function getPositiveIntegerEnv(name: string, fallback: number): number {
    const value = process.env[name];

    if (value === undefined) {
        return fallback;
    }

    const parsedValue = Number(value);

    return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

function takeSpread<T>(items: readonly T[], limit: number): T[] {
    if (items.length <= limit) {
        return [...items];
    }

    const result: T[] = [];
    const step = (items.length - 1) / (limit - 1);

    for (let index = 0; index < limit; index++) {
        result.push(items[Math.round(index * step)]);
    }

    return result;
}

function makeNoisyQuestion(text: string): string {
    const words = text
        .replace(/[!?.,:;"'«»()[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ');

    if (words.length < 3) {
        return text.toLowerCase();
    }

    const middleIndex = Math.floor(words.length / 2);
    return words
        .filter((_, index) => index !== middleIndex)
        .join(' ')
        .toLowerCase();
}

function getLiveQueryCases(): QueryCase[] {
    return [
        { text: 'Ты человек?' },
        { text: 'Ты бот или человек?' },
        { text: 'Ты ии?' },
        { text: 'Напиши простенький скрипт на рандомный бросок кубика' },
        { text: 'окак' },
        {
            text: 'Мозг — центральный отдел нервной системы животных, обычно расположенный в головном отделе тела.',
        },
    ];
}

async function warmup(questions: readonly QuestionWithAnswers[], queryCases: readonly QueryCase[]): Promise<void> {
    for (const queryCase of queryCases) {
        oldSearch(tokenizeText(queryCase.text), questions);
    }
}

async function benchmark(
    name: string,
    queryCases: readonly QueryCase[],
    run: (queryCase: QueryCase) => Promise<void> | void,
): Promise<BenchmarkResult> {
    const startedAt = performance.now();

    for (const queryCase of queryCases) {
        await run(queryCase);
    }

    const totalMs = performance.now() - startedAt;

    return {
        name,
        totalMs,
        averageMs: totalMs / queryCases.length,
    };
}

function oldSearch(
    querySentences: readonly string[],
    questions: readonly QuestionWithAnswers[],
): void {
    querySentences.flatMap(querySentence => {
        return questions
            .map(question => toMatchedQuestion(querySentence, question))
            .filter((match): match is number => match !== undefined)
            .sort((left, right) => right - left)
            .slice(0, 1);
    });
}

async function oldSearchFromDatabase(querySentences: readonly string[]): Promise<void> {
    let cursorId: number | undefined = undefined;

    while (true) {
        const questionBatch: Question[] = await prisma.question.findMany({
            where: cursorId === undefined ? {} : { id: { gt: cursorId } },
            orderBy: { id: 'asc' },
            take: 100000,
        });

        if (questionBatch.length === 0) {
            break;
        }

        oldSearch(querySentences, questionBatch.map(question => ({ ...question, answers: [] })));
        cursorId = questionBatch[questionBatch.length - 1].id;
    }
}

function toMatchedQuestion(querySentence: string, question: Question): number | undefined {
    const score = calculateQuestionScore(querySentence, question);

    return score >= 0.4 ? score : undefined;
}

function calculateQuestionScore(queryQuestion: string, question: Question): number {
    const jaroWinklerScore = JaroWinklerDistance(queryQuestion, question.text, {});
    const cosineScore = compareTwoStrings(queryQuestion, question.text);

    return (cosineScore * 2 + jaroWinklerScore) / 3;
}

function tokenizeText(text: string): string[] {
    return tokenizer.tokenize(text.toLowerCase()) || [];
}

function printResults(results: readonly BenchmarkResult[], questionsCount: number, queryCount: number): void {
    console.log(`Questions in DB: ${questionsCount}`);
    console.log(`Benchmark queries: ${queryCount}`);

    for (const result of results) {
        console.log(`${result.name}: total ${result.totalMs.toFixed(1)} ms, avg ${result.averageMs.toFixed(1)} ms/query`);
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

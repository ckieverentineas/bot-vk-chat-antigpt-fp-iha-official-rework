import { PrismaClient, Question } from '@prisma/client';
import { JaroWinklerDistance, SentenceTokenizer } from 'natural';
import { compareTwoStrings } from 'string-similarity';

interface QueryCase {
    readonly group: string;
    readonly text: string;
    readonly expectedQuestionId?: number;
}

interface MatchedQuestion {
    readonly id: number;
    readonly text: string;
    readonly score: number;
    readonly hasAnswers: boolean;
}

interface ComparedQuery {
    readonly query: QueryCase;
    readonly oldMatches: MatchedQuestion[];
    readonly streamTop1Matches: MatchedQuestion[];
    readonly cacheTop1Matches: MatchedQuestion[];
    readonly streamTop5Matches: MatchedQuestion[];
}

interface Summary {
    readonly total: number;
    readonly sameOldStreamTop1: number;
    readonly sameOldCacheTop1: number;
    readonly sameStreamCacheTop1: number;
    readonly oldOnly: number;
    readonly streamOnly: number;
    readonly oldStreamDifferentTop1: number;
    readonly oldCacheDifferentTop1: number;
    readonly streamCacheDifferentTop1: number;
    readonly oldExpectedHits: number;
    readonly streamExpectedHits: number;
    readonly cacheExpectedHits: number;
    readonly streamTop5RecoveredAnswers: number;
}

const prisma = new PrismaClient();
const tokenizer = new SentenceTokenizer();

async function main(): Promise<void> {
    const questions = await prisma.question.findMany({
        orderBy: { id: 'asc' },
        include: { answers: { select: { id: true }, take: 1 } },
    });

    const queryCases = buildQueryCases(questions);
    const comparedQueries = queryCases.map(query => compareQuery(query, questions));
    const summary = summarize(comparedQueries);

    printSummary(summary, questions.length, queryCases.length);
    printDifferences(comparedQueries);
}

function buildQueryCases(questions: readonly (Question & { answers: { id: number }[] })[]): QueryCase[] {
    const exactLimit = getPositiveIntegerEnv('QUALITY_EXACT_LIMIT', 80);
    const noisyLimit = getPositiveIntegerEnv('QUALITY_NOISY_LIMIT', 80);
    const answeredQuestions = questions.filter(question => question.answers.length > 0);
    const exactQuestions = takeSpread(answeredQuestions, exactLimit);
    const noisyQuestions = takeSpread(answeredQuestions.filter(question => question.text.split(/\s+/).length >= 3), noisyLimit);

    return [
        ...exactQuestions.map(question => ({
            group: 'exact',
            text: question.text,
            expectedQuestionId: question.id,
        })),
        ...noisyQuestions.map(question => ({
            group: 'noisy',
            text: makeNoisyQuestion(question.text),
            expectedQuestionId: question.id,
        })),
        ...getLiveQueryCases(),
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
        { group: 'live', text: 'Ты человек?' },
        { group: 'live', text: 'Ты бот или человек?' },
        { group: 'live', text: 'Ты ии?' },
        { group: 'live', text: 'Напиши простенький скрипт на рандомный бросок кубика' },
        { group: 'live', text: 'окак' },
        {
            group: 'live',
            text: 'Мозг — центральный отдел нервной системы животных, обычно расположенный в головном отделе тела.',
        },
    ];
}

function compareQuery(
    query: QueryCase,
    questions: readonly (Question & { answers: { id: number }[] })[],
): ComparedQuery {
    const querySentences = tokenizeText(query.text);

    return {
        query,
        oldMatches: oldSearch(querySentences, questions),
        streamTop1Matches: streamSearch(querySentences, questions, 1),
        cacheTop1Matches: cacheSearch(querySentences, questions, 1),
        streamTop5Matches: streamSearch(querySentences, questions, 5),
    };
}

function oldSearch(
    querySentences: readonly string[],
    questions: readonly (Question & { answers: { id: number }[] })[],
): MatchedQuestion[] {
    return querySentences.flatMap(querySentence => {
        return questions
            .map(question => toMatchedQuestion(querySentence, question))
            .filter((match): match is MatchedQuestion => match !== undefined)
            .sort((left, right) => right.score - left.score)
            .slice(0, 1);
    });
}

function streamSearch(
    querySentences: readonly string[],
    questions: readonly (Question & { answers: { id: number }[] })[],
    topLimit: number,
): MatchedQuestion[] {
    return querySentences.flatMap(querySentence => {
        const matches: MatchedQuestion[] = [];

        for (const question of questions) {
            const match = toMatchedQuestion(querySentence, question);

            if (match === undefined) {
                continue;
            }

            matches.push(match);
            matches.sort((left, right) => right.score - left.score);

            if (matches.length > topLimit) {
                matches.length = topLimit;
            }
        }

        return matches;
    });
}

function cacheSearch(
    querySentences: readonly string[],
    questions: readonly (Question & { answers: { id: number }[] })[],
    topLimit: number,
): MatchedQuestion[] {
    return streamSearch(querySentences, questions, topLimit);
}

function toMatchedQuestion(
    querySentence: string,
    question: Question & { answers: { id: number }[] },
): MatchedQuestion | undefined {
    const score = calculateQuestionScore(querySentence, question.text);

    if (score < 0.4) {
        return undefined;
    }

    return {
        id: question.id,
        text: question.text,
        score,
        hasAnswers: question.answers.length > 0,
    };
}

function calculateQuestionScore(queryQuestion: string, questionText: string): number {
    const jaroWinklerScore = JaroWinklerDistance(queryQuestion, questionText, {});
    const cosineScore = compareTwoStrings(queryQuestion, questionText);

    return (cosineScore * 2 + jaroWinklerScore) / 3;
}

function tokenizeText(text: string): string[] {
    return tokenizer.tokenize(text.toLowerCase()) || [];
}

function summarize(comparedQueries: readonly ComparedQuery[]): Summary {
    let sameOldStreamTop1 = 0;
    let sameOldCacheTop1 = 0;
    let sameStreamCacheTop1 = 0;
    let oldOnly = 0;
    let streamOnly = 0;
    let oldStreamDifferentTop1 = 0;
    let oldCacheDifferentTop1 = 0;
    let streamCacheDifferentTop1 = 0;
    let oldExpectedHits = 0;
    let streamExpectedHits = 0;
    let cacheExpectedHits = 0;
    let streamTop5RecoveredAnswers = 0;

    for (const comparedQuery of comparedQueries) {
        const oldTop = comparedQuery.oldMatches[0];
        const streamTop = comparedQuery.streamTop1Matches[0];
        const cacheTop = comparedQuery.cacheTop1Matches[0];
        const expectedQuestionId = comparedQuery.query.expectedQuestionId;

        if (oldTop?.id === streamTop?.id) {
            sameOldStreamTop1++;
        } else if (oldTop !== undefined && streamTop === undefined) {
            oldOnly++;
        } else if (oldTop === undefined && streamTop !== undefined) {
            streamOnly++;
        } else {
            oldStreamDifferentTop1++;
        }

        if (oldTop?.id === cacheTop?.id) {
            sameOldCacheTop1++;
        } else {
            oldCacheDifferentTop1++;
        }

        if (streamTop?.id === cacheTop?.id) {
            sameStreamCacheTop1++;
        } else {
            streamCacheDifferentTop1++;
        }

        if (expectedQuestionId !== undefined && oldTop?.id === expectedQuestionId) {
            oldExpectedHits++;
        }

        if (expectedQuestionId !== undefined && streamTop?.id === expectedQuestionId) {
            streamExpectedHits++;
        }

        if (expectedQuestionId !== undefined && cacheTop?.id === expectedQuestionId) {
            cacheExpectedHits++;
        }

        if (streamTop !== undefined && !streamTop.hasAnswers && comparedQuery.streamTop5Matches.some(match => match.hasAnswers)) {
            streamTop5RecoveredAnswers++;
        }
    }

    return {
        total: comparedQueries.length,
        sameOldStreamTop1,
        sameOldCacheTop1,
        sameStreamCacheTop1,
        oldOnly,
        streamOnly,
        oldStreamDifferentTop1,
        oldCacheDifferentTop1,
        streamCacheDifferentTop1,
        oldExpectedHits,
        streamExpectedHits,
        cacheExpectedHits,
        streamTop5RecoveredAnswers,
    };
}

function printSummary(summary: Summary, questionsCount: number, queryCount: number): void {
    console.log(`Questions in DB: ${questionsCount}`);
    console.log(`Compared queries: ${queryCount}`);
    console.log(`Same old vs stream top-1: ${summary.sameOldStreamTop1}/${summary.total}`);
    console.log(`Same old vs cache top-1: ${summary.sameOldCacheTop1}/${summary.total}`);
    console.log(`Same stream vs cache top-1: ${summary.sameStreamCacheTop1}/${summary.total}`);
    console.log(`Different old vs stream top-1: ${summary.oldStreamDifferentTop1}/${summary.total}`);
    console.log(`Different old vs cache top-1: ${summary.oldCacheDifferentTop1}/${summary.total}`);
    console.log(`Different stream vs cache top-1: ${summary.streamCacheDifferentTop1}/${summary.total}`);
    console.log(`Old found, stream missed: ${summary.oldOnly}`);
    console.log(`Stream found, old missed: ${summary.streamOnly}`);
    console.log(`Expected hits old: ${summary.oldExpectedHits}`);
    console.log(`Expected hits stream top-1: ${summary.streamExpectedHits}`);
    console.log(`Expected hits cache top-1: ${summary.cacheExpectedHits}`);
    console.log(`Top-5 would recover answer candidates: ${summary.streamTop5RecoveredAnswers}`);
}

function printDifferences(comparedQueries: readonly ComparedQuery[]): void {
    const differences = comparedQueries.filter(comparedQuery => {
        return (
            comparedQuery.oldMatches[0]?.id !== comparedQuery.streamTop1Matches[0]?.id ||
            comparedQuery.oldMatches[0]?.id !== comparedQuery.cacheTop1Matches[0]?.id ||
            comparedQuery.streamTop1Matches[0]?.id !== comparedQuery.cacheTop1Matches[0]?.id
        );
    });

    if (differences.length === 0) {
        console.log('No top-1 differences found.');
        return;
    }

    console.log('\nTop differences:');

    for (const comparedQuery of differences.slice(0, 10)) {
        const oldTop = comparedQuery.oldMatches[0];
        const streamTop = comparedQuery.streamTop1Matches[0];
        const cacheTop = comparedQuery.cacheTop1Matches[0];

        console.log(`- [${comparedQuery.query.group}] ${shorten(comparedQuery.query.text)}`);
        console.log(`  old: ${formatMatch(oldTop)}`);
        console.log(`  stream: ${formatMatch(streamTop)}`);
        console.log(`  cache: ${formatMatch(cacheTop)}`);
    }
}

function formatMatch(match: MatchedQuestion | undefined): string {
    if (match === undefined) {
        return 'not found';
    }

    return `#${match.id} score=${match.score.toFixed(4)} answers=${match.hasAnswers ? 'yes' : 'no'} "${shorten(match.text)}"`;
}

function shorten(text: string): string {
    const normalizedText = text.replace(/\s+/g, ' ').trim();

    if (normalizedText.length <= 100) {
        return normalizedText;
    }

    return `${normalizedText.slice(0, 97)}...`;
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

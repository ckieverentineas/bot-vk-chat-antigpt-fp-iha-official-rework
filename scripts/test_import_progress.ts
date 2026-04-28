import {
    formatImportProgressMessage,
    ImportProgressReporter,
    shouldReportProgress,
} from '../src/engine/import_progress';

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

assert(!shouldReportProgress(1000, 10999, 10000), 'Progress should wait until interval is reached');
assert(shouldReportProgress(1000, 11000, 10000), 'Progress should be reported at interval boundary');

const message = formatImportProgressMessage({
    title: 'Загрузка базы продолжается',
    fileName: 'legacy.bin',
    formatLabel: 'старый IHA',
    processedQuestions: 250,
    totalQuestions: 1000,
    parsedAnswers: 250,
    createdQuestions: 200,
    existingQuestions: 50,
    createdAnswers: 180,
    existingAnswers: 70,
    skippedLines: 2,
});

assert(message.includes('Загрузка базы продолжается'), 'Progress message should include title');
assert(message.includes('legacy.bin'), 'Progress message should include file name');
assert(message.includes('старый IHA'), 'Progress message should include detected format');
assert(message.includes('25.0%'), 'Progress message should include percentage');
assert(message.includes('250/1000'), 'Progress message should include question counter');
assert(message.includes('Пропущено строк: 2'), 'Progress message should include skipped lines');

assertEqual(
    formatImportProgressMessage({
        title: 'Загрузка базы продолжается',
        fileName: 'empty.txt',
        formatLabel: 'новый',
        processedQuestions: 0,
        totalQuestions: 0,
        parsedAnswers: 0,
        createdQuestions: 0,
        existingQuestions: 0,
        createdAnswers: 0,
        existingAnswers: 0,
        skippedLines: 0,
    }).includes('0.0%'),
    true,
    'Progress message should handle empty files without NaN',
);

async function testProgressReporter(): Promise<void> {
    let currentTime = 0;
    const logs: string[] = [];
    const messages: string[] = [];
    const reporter = new ImportProgressReporter({
        logger: text => logs.push(text),
        sendMessage: async text => {
            messages.push(text);
        },
        logIntervalMs: 100,
        messageIntervalMs: 1000,
        now: () => currentTime,
    });

    await reporter.report({
        title: 'Старт',
        fileName: 'legacy.bin',
        formatLabel: 'старый IHA',
        processedQuestions: 0,
        totalQuestions: 10,
        parsedAnswers: 0,
        createdQuestions: 0,
        existingQuestions: 0,
        createdAnswers: 0,
        existingAnswers: 0,
        skippedLines: 0,
    }, { forceLog: true });

    assertEqual(logs.length, 1, 'forceLog should write terminal progress immediately');
    assertEqual(messages.length, 0, 'forceLog should not force VK progress message');

    currentTime = 1000;
    await reporter.report({
        title: 'Продолжаем',
        fileName: 'legacy.bin',
        formatLabel: 'старый IHA',
        processedQuestions: 5,
        totalQuestions: 10,
        parsedAnswers: 5,
        createdQuestions: 5,
        existingQuestions: 0,
        createdAnswers: 5,
        existingAnswers: 0,
        skippedLines: 0,
    });

    assertEqual(logs.length, 2, 'Reporter should write terminal progress after log interval');
    assertEqual(messages.length, 1, 'Reporter should send VK progress after message interval');
}

testProgressReporter().catch((error) => {
    console.error(error);
    process.exit(1);
});

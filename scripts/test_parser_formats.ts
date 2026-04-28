import {
    detectQuestionAnswerFormat,
    ModernBlockLineParser,
    parseLegacyQuestionAnswerLine,
    parseQuestionAnswerText,
} from '../src/engine/parser_formats';

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

const modernText = '\uFEFF<~привет\n~>Привет!\n~>Рад видеть\n\nкак дела\nНормально\n\n';
const modernResult = parseQuestionAnswerText(modernText);

assertEqual(modernResult.format, 'modern-block', 'Modern export should be detected by markers and blocks');
assertEqual(modernResult.entries.length, 2, 'Modern parser should read two question blocks');
assertEqual(modernResult.entries[0].question, 'привет', 'Modern parser should remove question marker');
assertEqual(modernResult.entries[0].answers.length, 2, 'Modern parser should keep all answers in block');
assertEqual(modernResult.entries[0].answers[0], 'Привет!', 'Modern parser should remove answer marker');
assertEqual(modernResult.skippedLines, 0, 'Modern parser should not skip valid block lines');

const legacyText = '\uFEFFпривет\\Привет, рад тебя видеть!\\3\nсложный\\ответ с \\ внутри\\0\nбитая строка\n';
const legacyResult = parseQuestionAnswerText(legacyText);

assertEqual(legacyResult.format, 'iha-legacy', 'Legacy IHA format should be detected automatically');
assertEqual(legacyResult.entries.length, 2, 'Legacy parser should read valid triplets');
assertEqual(legacyResult.entries[0].question, 'привет', 'Legacy parser should read question before first slash');
assertEqual(legacyResult.entries[0].answers[0], 'Привет, рад тебя видеть!', 'Legacy parser should read answer between slashes');
assertEqual(legacyResult.entries[0].priority, 3, 'Legacy parser should expose numeric priority');
assertEqual(legacyResult.entries[1].answers[0], 'ответ с \\ внутри', 'Legacy parser should keep slashes inside answer');
assertEqual(legacyResult.entries[1].priority, 0, 'Legacy parser should read zero priority');
assertEqual(legacyResult.skippedLines, 1, 'Legacy parser should count malformed non-empty lines');

const plainBlockText = 'вопрос без маркера\nответ один\nответ два\n\n';
const plainBlockResult = parseQuestionAnswerText(plainBlockText);

assertEqual(plainBlockResult.format, 'modern-block', 'Plain block format should stay supported');
assertEqual(plainBlockResult.entries[0].question, 'вопрос без маркера', 'Plain parser should read first line as question');
assertEqual(plainBlockResult.entries[0].answers.length, 2, 'Plain parser should read following lines as answers');

assertEqual(
    detectQuestionAnswerFormat(['привет\\Привет\\0', 'как дела\\Нормально\\2']),
    'iha-legacy',
    'Format detection should work from sampled legacy lines',
);

assertEqual(
    parseLegacyQuestionAnswerLine('привет\\Привет\\0')?.question,
    'привет',
    'Legacy single-line parser should parse question',
);

const modernLineParser = new ModernBlockLineParser();
assertEqual(modernLineParser.pushLine('<~первый').entry, undefined, 'First question line should only start block');
assertEqual(modernLineParser.pushLine('~>ответ').entry, undefined, 'Answer line should stay inside current block');
assertEqual(modernLineParser.pushLine('<~второй').entry?.question, 'первый', 'New question should flush previous block');
assertEqual(modernLineParser.flush()?.question, 'второй', 'Final flush should return last question');

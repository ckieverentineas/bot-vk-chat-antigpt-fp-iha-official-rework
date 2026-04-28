import * as fs from 'fs';
import prisma from '../module/prisma';
import * as path from 'path';
import * as readline from 'readline';
import { MessageContext } from 'vk-io';
import { createLogger, getContextLogger, Logger } from '../module/logger';
import { clearTextSearchCache } from './reseacher/text_search';
import {
  detectQuestionAnswerFormat,
  ModernBlockLineParser,
  parseLegacyQuestionAnswerLine,
  QuestionAnswerEntry,
  QuestionAnswerImportFormat,
} from './parser_formats';
import { Question } from '@prisma/client';
import { ImportProgressMessageParams, ImportProgressReporter } from './import_progress';
import { enterRuntimeForcedMode } from '../module/runtime_flags';

//крч эта функция делает дамп данных в Txt из бд
export async function exportQuestionsAndAnswers(logger: Logger = createLogger('vk-chat-bot')): Promise<void> {
  // Открываем файл для записи
  const fileStream = fs.createWriteStream('questions_and_answers.txt');

  let skip = 0;
  const take = 50000;

  let questionCount = 0;
  let answerCount = 0;

  while (true) {
    // Получаем порцию вопросов и связанных с ними ответов, отсортированных в алфавитном порядке
    const questions = await prisma.question.findMany({
      skip,
      take,
      include: { answers: { orderBy: { answer: 'asc' } } },
      orderBy: { text: 'asc' },
    });

    // Если нет больше данных, выходим из цикла
    if (!questions.length) {
      break;
    }

    // Записываем каждый вопрос и связанные с ним ответы в нужном формате
    for (const question of questions) {
      fileStream.write(`<~${question.text}\n`);
      questionCount++;

      // Вопросы уже отсортированы в базе данных, поэтому мы не сортируем ответы
      for (const answer of question.answers) {
        fileStream.write(`~>${answer.answer}\n`);
        answerCount++;
      }

      fileStream.write('\n');
    }

    // Сдвигаем указатель skip на следующую порцию данных
    skip += take;
  }

  // Закрываем файл
  fileStream.end();

  const total = questionCount + answerCount;
  logger(`Вопросов: ${questionCount}, ответов: ${answerCount}, общее количество записей: ${total}`);

  logger('Вопросы и ответы успешно экспортированы в файл!');
}




interface FileImportResult {
  fileName: string;
  format: QuestionAnswerImportFormat;
  parsedQuestions: number;
  parsedAnswers: number;
  createdQuestions: number;
  existingQuestions: number;
  createdAnswers: number;
  existingAnswers: number;
  skippedLines: number;
}

interface FileImportMetadata {
  readonly format: QuestionAnswerImportFormat;
  readonly parsedQuestions: number;
  readonly parsedAnswers: number;
  readonly skippedLines: number;
}

interface EntryImportResult {
  readonly createdQuestions: number;
  readonly existingQuestions: number;
  readonly createdAnswers: number;
  readonly existingAnswers: number;
}

interface SavedQuestion {
  readonly question: Question;
  readonly created: boolean;
}

async function parseFileWithProgress(
  filePath: string,
  logger: Logger,
  progressReporter: ImportProgressReporter,
): Promise<FileImportResult> {
  const format = await detectImportFileFormat(filePath);
  const metadata = await scanFileMetadata(filePath, format);
  const result = createEmptyFileImportResult(path.basename(filePath), metadata.format, metadata.skippedLines);

  await progressReporter.report(
    toProgressMessageParams('Начинаю загрузку файла базы', result, metadata.parsedQuestions),
    { forceLog: true },
  );

  for await (const entry of readQuestionAnswerEntries(filePath, metadata.format)) {
    const entryResult = await saveEntry(entry);
    result.parsedQuestions++;
    result.parsedAnswers += entry.answers.length;
    result.createdQuestions += entryResult.createdQuestions;
    result.existingQuestions += entryResult.existingQuestions;
    result.createdAnswers += entryResult.createdAnswers;
    result.existingAnswers += entryResult.existingAnswers;

    await progressReporter.report(toProgressMessageParams('Загрузка базы продолжается', result, metadata.parsedQuestions));
  }

  await progressReporter.report(
    toProgressMessageParams('Файл базы загружен', result, metadata.parsedQuestions),
    { forceLog: true },
  );

  return result;
}

async function detectImportFileFormat(filePath: string): Promise<QuestionAnswerImportFormat> {
  const sampleLines: string[] = [];
  const sampleLimit = 200;

  for await (const line of readImportLines(filePath)) {
    if (line.trim().length === 0) {
      continue;
    }

    sampleLines.push(line);

    if (sampleLines.length >= sampleLimit) {
      break;
    }
  }

  return detectQuestionAnswerFormat(sampleLines);
}

async function scanFileMetadata(
  filePath: string,
  format: QuestionAnswerImportFormat,
): Promise<FileImportMetadata> {
  let parsedQuestions = 0;
  let parsedAnswers = 0;
  let skippedLines = 0;

  for await (const entry of readQuestionAnswerEntries(filePath, format, () => {
    skippedLines++;
  })) {
    parsedQuestions++;
    parsedAnswers += entry.answers.length;
  }

  return {
    format,
    parsedQuestions,
    parsedAnswers,
    skippedLines,
  };
}

async function* readQuestionAnswerEntries(
  filePath: string,
  format: QuestionAnswerImportFormat,
  onSkippedLine?: () => void,
): AsyncGenerator<QuestionAnswerEntry> {
  if (format === 'iha-legacy') {
    yield* readLegacyQuestionAnswerEntries(filePath, onSkippedLine);
    return;
  }

  yield* readModernQuestionAnswerEntries(filePath, onSkippedLine);
}

async function* readLegacyQuestionAnswerEntries(
  filePath: string,
  onSkippedLine?: () => void,
): AsyncGenerator<QuestionAnswerEntry> {
  for await (const line of readImportLines(filePath)) {
    if (line.trim().length === 0) {
      continue;
    }

    const entry = parseLegacyQuestionAnswerLine(line);

    if (entry === undefined) {
      onSkippedLine?.();
      continue;
    }

    yield entry;
  }
}

async function* readModernQuestionAnswerEntries(
  filePath: string,
  onSkippedLine?: () => void,
): AsyncGenerator<QuestionAnswerEntry> {
  const parser = new ModernBlockLineParser();

  for await (const line of readImportLines(filePath)) {
    const result = parser.pushLine(line);

    if (result.entry !== undefined) {
      yield result.entry;
    }

    if (result.skippedLine) {
      onSkippedLine?.();
    }
  }

  const finalEntry = parser.flush();

  if (finalEntry !== undefined) {
    yield finalEntry;
  }
}

async function* readImportLines(filePath: string): AsyncGenerator<string> {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const reader = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of reader) {
      yield line;
    }
  } finally {
    reader.close();
    fileStream.destroy();
  }
}

function createEmptyFileImportResult(
  fileName: string,
  format: QuestionAnswerImportFormat,
  skippedLines: number,
): FileImportResult {
  return {
    fileName,
    format,
    parsedQuestions: 0,
    parsedAnswers: 0,
    createdQuestions: 0,
    existingQuestions: 0,
    createdAnswers: 0,
    existingAnswers: 0,
    skippedLines,
  };
}

async function saveEntry(entry: QuestionAnswerEntry): Promise<EntryImportResult> {
  const savedQuestion = await saveQuestion(entry.question);
  const answerResult = await saveAnswers(savedQuestion.question.id, entry.answers);

  return {
    createdQuestions: savedQuestion.created ? 1 : 0,
    existingQuestions: savedQuestion.created ? 0 : 1,
    createdAnswers: answerResult.createdAnswers,
    existingAnswers: answerResult.existingAnswers,
  };
}

async function saveQuestion(questionText: string): Promise<SavedQuestion> {
  let question = await prisma.question.findUnique({ where: { text: questionText } });

  if (!question) {
    question = await prisma.question.create({ data: { text: questionText } });
    return { question, created: true };
  }

  return { question, created: false };
}

async function saveAnswers(
  questionId: number,
  answers: readonly string[],
): Promise<Pick<EntryImportResult, 'createdAnswers' | 'existingAnswers'>> {
  let createdAnswers = 0;
  let existingAnswers = 0;

  for (const answer of answers) {
    const existingAnswer = await prisma.answer.findFirst({
      where: {
        id_question: questionId,
        answer,
      },
    });

    if (existingAnswer) {
      existingAnswers++;
      continue;
    }

    await prisma.answer.create({
      data: {
        answer,
        crdate: new Date(),
        id_question: questionId,
      },
    });
    createdAnswers++;
  }

  return { createdAnswers, existingAnswers };
}

async function parseDirectory(directoryPath: string, context: MessageContext): Promise<void> {
  const logger = getContextLogger(context);
  const results: FileImportResult[] = [];
  const progressReporter = new ImportProgressReporter({
    logger,
    sendMessage: async message => {
      await context.send(message);
    },
  });

  const directory = await fs.promises.opendir(directoryPath);
  for await (const dirent of directory) {
    if (!dirent.isFile() || !isSupportedImportFile(dirent.name)) {
      continue;
    }

    const filePath = path.join(directoryPath, dirent.name);
    results.push(await parseFileWithProgress(filePath, logger, progressReporter));
  }

  const summary = summarizeImportResults(results);

  clearTextSearchCache("questions");
  await context.send(summary);
  logger(summary);
}

function isSupportedImportFile(fileName: string): boolean {
  const extension = path.extname(fileName).toLowerCase();

  return extension === '.txt' || extension === '.bin';
}

// Главная функция, которая вызывает функцию для обработки директории
export async function Save_Answers_and_Question_In_DB(context: MessageContext): Promise<void> {
  const releaseImportMode = enterRuntimeForcedMode('database-import');

  try {
    await context.send('Включен режим загрузки базы: автоответы временно отключены.');
    await parseDirectory(path.join(__dirname, '..', '..', 'book'), context);
  } finally {
    releaseImportMode();
    await context.send('Режим загрузки базы снят: автоответы снова работают согласно тумблерам.');
  }
}

function summarizeImportResults(results: readonly FileImportResult[]): string {
  const total = results.reduce((accumulator, result) => ({
    parsedQuestions: accumulator.parsedQuestions + result.parsedQuestions,
    parsedAnswers: accumulator.parsedAnswers + result.parsedAnswers,
    createdQuestions: accumulator.createdQuestions + result.createdQuestions,
    existingQuestions: accumulator.existingQuestions + result.existingQuestions,
    createdAnswers: accumulator.createdAnswers + result.createdAnswers,
    existingAnswers: accumulator.existingAnswers + result.existingAnswers,
    skippedLines: accumulator.skippedLines + result.skippedLines,
  }), {
    parsedQuestions: 0,
    parsedAnswers: 0,
    createdQuestions: 0,
    existingQuestions: 0,
    createdAnswers: 0,
    existingAnswers: 0,
    skippedLines: 0,
  });
  const formatSummary = summarizeFormats(results);

  return [
    'Загрузка базы завершена.',
    `Файлов обработано: ${results.length}`,
    `Форматы: ${formatSummary}`,
    `Вопросов в файлах: ${total.parsedQuestions}`,
    `Ответов в файлах: ${total.parsedAnswers}`,
    `Добавлено вопросов: ${total.createdQuestions}`,
    `Уже было вопросов: ${total.existingQuestions}`,
    `Добавлено ответов: ${total.createdAnswers}`,
    `Уже было ответов: ${total.existingAnswers}`,
    `Пропущено строк: ${total.skippedLines}`,
  ].join('\n');
}

function summarizeFormats(results: readonly FileImportResult[]): string {
  const modernCount = results.filter(result => result.format === 'modern-block').length;
  const legacyCount = results.filter(result => result.format === 'iha-legacy').length;

  return [
    modernCount > 0 ? `новый формат: ${modernCount}` : undefined,
    legacyCount > 0 ? `старый IHA: ${legacyCount}` : undefined,
  ].filter((value): value is string => value !== undefined).join(', ') || 'нет файлов';
}

function formatFileImportResult(result: FileImportResult): string {
  return [
    `Файл: ${result.fileName}`,
    `Формат: ${formatImportFormat(result.format)}`,
    `Вопросов: ${result.parsedQuestions}`,
    `Ответов: ${result.parsedAnswers}`,
    `Добавлено вопросов: ${result.createdQuestions}`,
    `Добавлено ответов: ${result.createdAnswers}`,
    `Пропущено строк: ${result.skippedLines}`,
  ].join('\n');
}

function formatImportFormat(format: QuestionAnswerImportFormat): string {
  return format === 'iha-legacy' ? 'старый IHA' : 'новый';
}

function toProgressMessageParams(
  title: string,
  result: FileImportResult,
  totalQuestions: number,
): ImportProgressMessageParams {
  return {
    title,
    fileName: result.fileName,
    formatLabel: formatImportFormat(result.format),
    processedQuestions: result.parsedQuestions,
    totalQuestions,
    parsedAnswers: result.parsedAnswers,
    createdQuestions: result.createdQuestions,
    existingQuestions: result.existingQuestions,
    createdAnswers: result.createdAnswers,
    existingAnswers: result.existingAnswers,
    skippedLines: result.skippedLines,
  };
}

import * as fs from 'fs';
import prisma from '../module/prisma';
import * as path from 'path';
import * as readline from 'readline';
import { MessageContext } from 'vk-io';
import { createLogger, getContextLogger, Logger } from '../module/logger';
import { clearTextSearchCache } from './reseacher/text_search';

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




// код для парсинга файла с вопросами и ответами
// Интерфейс для хранения вопроса и связанных с ним ответов
interface QuestionAnswer {
  question: string;
  answers: string[];
}

// Функция для обработки одного файла
async function parseFile(filePath: string, logger: Logger): Promise<void> {
  // Создаем поток чтения из файла
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  // Создаем интерфейс для чтения файла построчно
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  // Переменные для хранения текущего вопроса и ответов
  let currentQuestion: string | null = null;
  let currentAnswers: string[] = [];

  // Обрабатываем каждую строку в файле
  for await (const line of rl) {
    if (currentQuestion === null) {
      // Если текущий вопрос еще не определен, то текущая строка - это вопрос
      currentQuestion = line;
    } else if (line === '') {
      // Если текущая строка пустая, то это конец ответов для текущего вопроса
      // Сохраняем вопрос и ответы в базу данных
      const question = await saveQuestion(currentQuestion);
      await saveAnswers(question.id, currentAnswers);
      // Логируем сохранение вопроса и ответов
      logger(`Saved question "${currentQuestion}" with ${currentAnswers.length} answers`);
      // Сбрасываем переменные для следующего вопроса
      currentQuestion = null;
      currentAnswers = [];
    } else {
      // Если текущая строка не пустая, то это ответ на текущий вопрос
      currentAnswers.push(line);
    }
  }

  // Если после цикла остался текущий вопрос без ответов, сохраняем его
  if (currentQuestion !== null) {
    const question = await saveQuestion(currentQuestion);
    await saveAnswers(question.id, currentAnswers);
    // Логируем сохранение вопроса и ответов
    logger(`Saved question "${currentQuestion}" with ${currentAnswers.length} answers`);
  }
}

// Функция для сохранения вопроса в базу данных
async function saveQuestion(questionText: string) {
  // Проверяем, есть ли вопрос уже в базе данных
  let question = await prisma.question.findUnique({ where: { text: questionText.replace('<~', '') } });
  if (!question) {
    // Если вопроса нет, создаем новый вопрос в базе данных
    question = await prisma.question.create({ data: { text: questionText.replace('<~', '') } });
  }
  return question;
}

// Функция для сохранения ответов на вопрос в базу данных
async function saveAnswers(questionId: number, answers: string[]) {
  for (const answer of answers) {
    // Проверяем, есть ли ответ уже в базе данных для данного вопроса
    const existingAnswer = await prisma.answer.findFirst({
      where: {
        id_question: questionId,
        answer: answer.replace('~>', '')
      }
    });

    if (!existingAnswer) {
      // Если ответа нет, создаем новый ответ в базе данных для данного вопроса
      await prisma.answer.create({
        data: {
          answer: answer.replace('~>', ''),
          crdate: new Date(),
          id_question: questionId
        }
      });
    }
  }
}

// Функция для обработки всех файлов в директории
async function parseDirectory(directoryPath: string, context: MessageContext): Promise<void> {
  let totalQuestions = 0;
  let totalAnswers = 0;
  const logger = getContextLogger(context);

  const directory = await fs.promises.opendir(directoryPath);
  for await (const dirent of directory) {
    if (dirent.isFile() && path.extname(dirent.name) === '.txt') {
      // Если файл имеет расширение .txt, обрабатываем его
      const filePath = path.join(directoryPath, dirent.name);
      await parseFile(filePath, logger);
      // Увеличиваем счетчики общего количества вопросов и ответов
      totalQuestions++;
      totalAnswers += await countAnswers(filePath);
    }
  }

  // Логируем общее количество вопросов и ответов
  clearTextSearchCache("questions");
  await context.send(`Parsed ${totalQuestions} files with ${totalAnswers} total answers`)
  logger(`Parsed ${totalQuestions} files with ${totalAnswers} total answers`);
}

// Функция для подсчета количества ответов в файле
async function countAnswers(filePath: string): Promise<number> {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;

  for await (const line of rl) {
    if (line === '') {
      count++;
    }
  }

  return count;
}
// Главная функция, которая вызывает функцию для обработки директории
export async function Save_Answers_and_Question_In_DB(context: MessageContext): Promise<void> {
  // Обрабатываем директорию с файлами
  await parseDirectory(path.join(__dirname, '..', '..', 'book'), context);
}

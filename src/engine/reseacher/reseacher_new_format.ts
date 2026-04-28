import { root, tokenizer_sentence } from "../..";
import { JaroWinklerDistance } from "natural";
import prisma from "../../module/prisma";
import { compareTwoStrings } from "string-similarity";
import { Answer, Question } from "@prisma/client";
import { Context, VK } from "vk-io";
import { Add_Unknown } from "../education/education_egine";
import { Input_Message_Cleaner } from "../clear_input";
import { formatLogSections, formatSearchTitle, LogField, logWithContext } from "../../module/logger";
import { findTextMatches, TextSearchRepository } from "./text_search";

interface ResearchResult {
    text: string;
    answer: string;
    info: string;
    status: boolean;
}

interface QuestionMatch {
    queryQuestion: string;
    sentenceQuestion: {
        question: Question;
        score: number;
    }[];
}

interface SelectedAnswer {
    id: number;
    input: string;
    question: string;
    answer: string;
    crdate: Date;
}

const questionRepository: TextSearchRepository<Question> = {
    async loadAll(): Promise<readonly Question[]> {
        return prisma.question.findMany({
            orderBy: { id: "asc" },
        });
    },

    async loadBatch(cursorId: number | undefined, batchSize: number): Promise<readonly Question[]> {
        return prisma.question.findMany({
            where: cursorId === undefined ? {} : { id: { gt: cursorId } },
            orderBy: { id: "asc" },
            take: batchSize,
        });
    },
};

async function tokenizeText(text: string): Promise<string[]> {
    return tokenizer_sentence.tokenize(text.toLowerCase()) || [];
}

async function findClosestMatches(queries: readonly string[]): Promise<QuestionMatch[]> {
    const results = await findTextMatches({
        cacheKey: "questions",
        queries,
        repository: questionRepository,
        score: calculateQuestionScore,
        accept: score => score >= 0.4,
    });

    return results.map(result => ({
        queryQuestion: result.queryText,
        sentenceQuestion: result.matches.map(match => ({
            question: match.record,
            score: match.score,
        })),
    }));
}

function calculateQuestionScore(queryQuestion: string, question: Question): number {
    const jaroWinklerScore = JaroWinklerDistance(queryQuestion, question.text, {});
    const cosineScore = compareTwoStrings(queryQuestion, question.text);

    return (cosineScore * 2 + jaroWinklerScore) / 3;
}

async function Reseacher_New_Format(
    res: ResearchResult,
    context: Context | any,
    data_old: number,
    vk: VK,
): Promise<ResearchResult> {
    const sentenceArray = await tokenizeText(context.text!);
    const output = await findClosestMatches(sentenceArray);

    return processInputData(res, output, context, data_old, vk);
}

async function processInputData(
    res: ResearchResult,
    data: QuestionMatch[],
    context: Context | any,
    data_old: number,
    vk: VK,
): Promise<ResearchResult> {
    const answers: SelectedAnswer[] = [];
    const educationQuestions: string[] = [];

    for (const match of data) {
        if (match.sentenceQuestion.length > 0) {
            const selectedAnswer = await findAnswerForMatch(match);

            if (selectedAnswer !== undefined) {
                answers.push(selectedAnswer);
            }

            continue;
        }

        await addEducationQuestion(match.queryQuestion, educationQuestions, context, vk);
    }

    if (answers.length > 0) {
        res.answer = formatAnswerText(answers);
        res.info = formatSuccessLog(context.text ?? res.text, answers, data_old);
        res.status = true;
        return res;
    }

    res.info = formatNotFoundLog(context.text ?? res.text, educationQuestions, data_old);
    return res;
}

async function findAnswerForMatch(match: QuestionMatch): Promise<SelectedAnswer | undefined> {
    for (const sentenceQuestion of match.sentenceQuestion) {
        const answers = await prisma.answer.findMany({
            where: { id_question: sentenceQuestion.question.id },
            take: 100,
        });
        const randomAnswer = pickRandomAnswer(answers);

        if (randomAnswer !== undefined) {
            return {
                id: randomAnswer.id,
                input: match.queryQuestion,
                question: sentenceQuestion.question.text,
                answer: randomAnswer.answer,
                crdate: new Date(randomAnswer.crdate),
            };
        }
    }

    return undefined;
}

function pickRandomAnswer(answers: readonly Answer[]): Answer | undefined {
    if (answers.length === 0) {
        return undefined;
    }

    return answers[Math.floor(Math.random() * answers.length)];
}

async function addEducationQuestion(
    queryQuestion: string,
    educationQuestions: string[],
    context: Context | any,
    vk: VK,
): Promise<void> {
    if (queryQuestion.length === 0) {
        return;
    }

    const unknownQuestion = await Add_Unknown(queryQuestion);

    if (!unknownQuestion) {
        return;
    }

    educationQuestions.push(unknownQuestion.text);

    try {
        await vk.api.messages.send({
            peer_id: Number(root),
            random_id: 0,
            message: `Я не знаю что ответить на эту фразу:\n\n${Input_Message_Cleaner(unknownQuestion.text)}`,
        });
    } catch (error) {
        logWithContext(context, `Ошибка уведомления о сохранении вопроса ${error}`);
    }
}

function formatAnswerText(answers: readonly SelectedAnswer[]): string {
    if (answers.length === 1) {
        return answers.map(answer => `${answer.answer}\n\n`).join("");
    }

    return answers
        .map(answer => `${Input_Message_Cleaner(answer.input)}: \n${answer.answer}\n\n`)
        .join("");
}

function formatSuccessLog(originalMessage: string, answers: readonly SelectedAnswer[], startedAt: number): string {
    return formatLogSections(formatSearchTitle("MultiBoost~", true), [
        [
            { label: "Исходное сообщение", value: originalMessage },
            { label: "Сгенерирован ответ", value: answers.map(answer => `${answer.id} <-- ${answer.answer}`).join("; ") },
            { label: "Исправление ошибок", value: answers.map(answer => `${answer.id} --> ${answer.question}`).join("; ") },
            { label: `Найдено вариантов: [${answers.length}], затрачено времени`, value: `${(Date.now() - startedAt) / 1000} сек.` },
        ],
    ], "FINISH");
}

function formatNotFoundLog(originalMessage: string, educationQuestions: readonly string[], startedAt: number): string {
    const fields: LogField[] = [
        { label: "Исходное сообщение", value: originalMessage },
        { label: "Новых вопросов", value: educationQuestions.length },
        { label: "Затрачено времени", value: `${(Date.now() - startedAt) / 1000} сек.` },
    ];

    if (educationQuestions.length > 0) {
        fields.push({ label: "Вопросы обучения", value: educationQuestions.join("; ") });
    }

    return formatLogSections(
        formatSearchTitle("MultiBoost~", false),
        [fields],
        educationQuestions.length > 0 ? "EDUCATION" : "NOT_FOUND",
    );
}

export default Reseacher_New_Format;

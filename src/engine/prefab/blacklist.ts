import { root, tokenizer, tokenizer_sentence } from "../..";
import { JaroWinklerDistance, DamerauLevenshteinDistance, LevenshteinDistance, DiceCoefficient } from "natural";
import prisma from "../../module/prisma";
import { findBestMatch } from "string-similarity";
import { distance as levenshteinDistance } from 'fastest-levenshtein';
import { compareTwoStrings } from 'string-similarity';
import { BlackList, Question } from "@prisma/client";
import { Context, MessageContext, VK } from "vk-io";
import { Add_Unknown } from "../education/education_egine";
import { formatLogFields, logWithContext } from "../../module/logger";

// Функция для токенизации текста
async function tokenizeText(text: string): Promise<string[]> {
    const ans = typeof text === "string" ? await tokenizer_sentence.tokenize(text.toLowerCase()) : [];
    return ans
}
// Асинхронный генератор для извлечения вопросов из базы данных порциями
async function* Generator_Sentence(): AsyncGenerator<BlackList[]> {
    const batchSize = 100000;
    let cursor: number | undefined = undefined;
    while (true) {
        // Извлекаем порцию вопросов из базы данных
        const questions: BlackList[] = await prisma.$queryRaw<Question[]>`
            SELECT * FROM BlackList
            WHERE id > ${cursor ?? 0}
            ORDER BY id ASC
            LIMIT ${batchSize}
        `;
        if (!questions.length) break;
        // Возвращаем порцию вопросов через yield
        yield questions;
        // Обновляем курсор для извлечения следующей порции вопросов
        cursor = questions[questions.length - 1].id;
    }
}
// Интерфейс для объекта с результатом сравнения
interface Match {
    query_question: string;
    sentence_question: { question: BlackList, score: number }[];
}
// Функция для поиска наилучшего совпадения для каждого предложения в query в массиве вопросов sentences
async function findClosestMatch(query: string[], sentences: BlackList[]): Promise<Match[]> {
    const matches: Match[] = [];
    await Promise.all(query.map(async (query_question) => {
        const sentence_question: { question: BlackList; score: number }[] = (await Promise.all(sentences.map(async (sentence) => {
            const jaroWinklerScore = JaroWinklerDistance(sentence.text, query_question, {});
            //const levenshteinScore = 1 / (levenshteinDistance(sentence.text, query_question) + 1);
            //const levenshteinScore2 = 1 / (LevenshteinDistance(sentence.text, query_question) + 1)
            //const damer = 1 / (DamerauLevenshteinDistance(sentence.text, query_question) + 1);
            const cosineScore = compareTwoStrings(sentence.text, query_question);
            const diceCoefficient = DiceCoefficient(sentence.text, query_question)
            const score = (cosineScore*2 + jaroWinklerScore/2 + diceCoefficient*2)/5;
            //console.log({ question: sentence, score: score, message: query_question, cosineScore, jaroWinklerScore, diceCoefficient })
            if (cosineScore >= 0.55 || diceCoefficient >= 0.55 || jaroWinklerScore >= 0.91 || score >= 0.55 || query_question.includes(sentence.text)) {
                //console.log(` Проверяем сообщение: [${query_question}] \n Найденно стоп-слово: [${sentence.text}] \n Очки: cosineScore [${cosineScore}] diceCoefficient [${diceCoefficient}] jaroWinklerScore [${jaroWinklerScore}] score [${score}] \nОстанавливаем ответ: [подтверждено] \n\n`)
                return { question: sentence, score: score };
            }
            return undefined;
        }))).filter((q): q is { question: BlackList; score: number } => q !== undefined);
            matches.push({ query_question, sentence_question });
    }));
    return matches;
}
  
async function Black_List_Engine(res: { text: string, answer: string, info: string, status: boolean }, context: Context) {
    const data_old = Number(new Date())
    const sentence_array = await tokenizeText(context.text!);
    const matchGenerator = Generator_Sentence();
    let result: Match[] = [];
    for await (const sentences of matchGenerator) {
        const matches = await findClosestMatch(sentence_array, sentences);
        result = result.concat(matches);
    }
    const output: Match[] = result.reduce((acc: Match[], item: Match) => {
        const existingItem = acc.find(obj => obj.query_question === item.query_question);
        if (existingItem) {
            existingItem.sentence_question.push(...item.sentence_question.filter((q: any) => !existingItem.sentence_question.some((eq: any) => eq.id === q.id)));
        } else {
            acc.push({ query_question: item.query_question, sentence_question: item.sentence_question });
        }
        return acc;
    }, []);
    output.map((match) => ({
        ...match,
        sentence_question: match.sentence_question.sort((a, b) => b.score - a.score),
    }));
    if (output[0]?.sentence_question?.length > 0) {
        res.status = true
        await context.send(`Обнаружено стоп-слово ${JSON.stringify(output[0]?.sentence_question[0]?.question)}, отвечать не буду`)
        logWithContext(context, formatLogFields([
            { label: "Проверяем сообщение", value: res.text },
            { label: "Найдено стоп-слово", value: output[0]?.sentence_question[0]?.question?.text },
            { label: "Очки", value: output[0]?.sentence_question[0]?.score },
            { label: "Останавливаем ответ", value: "подтверждено" },
        ]))
    }
    //console.log(JSON.stringify(output, null, 2));
    return res
}



export default Black_List_Engine;

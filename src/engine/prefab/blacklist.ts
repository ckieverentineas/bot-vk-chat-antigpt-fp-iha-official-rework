import { tokenizer_sentence } from "../..";
import { DiceCoefficient, JaroWinklerDistance } from "natural";
import prisma from "../../module/prisma";
import { compareTwoStrings } from "string-similarity";
import { BlackList } from "@prisma/client";
import { Context } from "vk-io";
import { formatLogFields, logWithContext } from "../../module/logger";
import { findTextMatches, TextSearchRepository } from "../reseacher/text_search";

interface BlackListResult {
    text: string;
    answer: string;
    info: string;
    status: boolean;
}

interface BlackListMatch {
    queryQuestion: string;
    sentenceQuestion: {
        question: BlackList;
        score: number;
    }[];
}

interface BlackListScore {
    readonly cosineScore: number;
    readonly diceCoefficient: number;
    readonly jaroWinklerScore: number;
    readonly score: number;
}

const blackListRepository: TextSearchRepository<BlackList> = {
    async loadAll(): Promise<readonly BlackList[]> {
        return prisma.blackList.findMany({
            orderBy: { id: "asc" },
        });
    },

    async loadBatch(cursorId: number | undefined, batchSize: number): Promise<readonly BlackList[]> {
        return prisma.blackList.findMany({
            where: cursorId === undefined ? {} : { id: { gt: cursorId } },
            orderBy: { id: "asc" },
            take: batchSize,
        });
    },
};

async function tokenizeText(text: string): Promise<string[]> {
    return typeof text === "string" ? tokenizer_sentence.tokenize(text.toLowerCase()) : [];
}

async function findClosestMatches(queries: readonly string[]): Promise<BlackListMatch[]> {
    const results = await findTextMatches({
        cacheKey: "black-list",
        queries,
        repository: blackListRepository,
        score: calculateAcceptedBlackListScore,
        accept: score => score > 0,
    });

    return results.map(result => ({
        queryQuestion: result.queryText,
        sentenceQuestion: result.matches.map(match => ({
            question: match.record,
            score: match.score,
        })),
    }));
}

function calculateAcceptedBlackListScore(queryQuestion: string, blackListItem: BlackList): number {
    const metrics = calculateBlackListScore(queryQuestion, blackListItem.text);
    const isAccepted =
        metrics.cosineScore >= 0.55 ||
        metrics.diceCoefficient >= 0.55 ||
        metrics.jaroWinklerScore >= 0.91 ||
        metrics.score >= 0.55 ||
        queryQuestion.includes(blackListItem.text);

    return isAccepted ? Math.max(metrics.score, Number.EPSILON) : 0;
}

function calculateBlackListScore(queryQuestion: string, blackListText: string): BlackListScore {
    const jaroWinklerScore = JaroWinklerDistance(blackListText, queryQuestion, {});
    const cosineScore = compareTwoStrings(blackListText, queryQuestion);
    const diceCoefficient = DiceCoefficient(blackListText, queryQuestion);
    const score = (cosineScore * 2 + jaroWinklerScore / 2 + diceCoefficient * 2) / 5;

    return {
        cosineScore,
        diceCoefficient,
        jaroWinklerScore,
        score,
    };
}

async function Black_List_Engine(res: BlackListResult, context: Context): Promise<BlackListResult> {
    const sentenceArray = await tokenizeText(context.text!);
    const output = await findClosestMatches(sentenceArray);
    const match = output[0]?.sentenceQuestion[0];

    if (match === undefined) {
        return res;
    }

    res.status = true;
    await context.send(`Обнаружено стоп-слово ${JSON.stringify(match.question)}, отвечать не буду`);
    logWithContext(context, formatLogFields([
        { label: "Проверяем сообщение", value: res.text },
        { label: "Найдено стоп-слово", value: match.question.text },
        { label: "Очки", value: match.score },
        { label: "Останавливаем ответ", value: "подтверждено" },
    ]));

    return res;
}

export default Black_List_Engine;

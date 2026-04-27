import prisma from "../../module/prisma";
import { formatLogSections, formatSearchTitle } from "../../module/logger";

export async function Direct_Search(res: { text: string, answer: string, info: string, status: boolean}, data_old: number) {
    const question = await prisma.question.findUnique({
      where: { text: res.text },
      include: { answers: true },
    });
    if (question) {
      const answer = question.answers[Math.floor(Math.random() * question.answers.length)];
      res.answer = answer.answer;
      res.info = formatLogSections(formatSearchTitle("DirectBoost", true), [
        [
          { label: "Сгенерирован ответ", value: answer.answer },
          { label: "Затрачено времени", value: `${(Date.now() - data_old) / 1000} сек.` },
        ],
      ], 'FINISH');
      res.status = true;
    }
    return res;
  }

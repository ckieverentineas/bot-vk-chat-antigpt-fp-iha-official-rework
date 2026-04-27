import { Unknown } from "@prisma/client";
import prisma from "../../module/prisma";
import { compareTwoStrings } from 'string-similarity';
import { Context, Keyboard } from "vk-io";
import { clearTextSearchCache } from "../reseacher/text_search";

export async function Add_Unknown(text: string): Promise<Unknown | false> {
    const batchSize = 100000;
    let cursor: number | undefined = undefined;

    while (true) {
        const unknownQuestions: Unknown[] = await prisma.$queryRaw<Unknown[]>`
            SELECT * FROM Unknown
            WHERE id > ${cursor ?? 0}
            ORDER BY id ASC
            LIMIT ${batchSize}
        `;

        if (!unknownQuestions.length) break;

        for (const unknownQuestion of unknownQuestions) {
            const cosineScore = compareTwoStrings(text, unknownQuestion.text,);
            if (cosineScore >= 0.8) {
                return false;
            }

            // Обновляем курсор для извлечения следующей порции вопросов
            cursor = unknownQuestion.id;
        }
    }

    // Если похожих записей не найдено, добавляем новую запись в таблицу Unknown
    const res = await prisma.unknown.create({ data: { text } });
    return res
}

interface Education_Structure {
    id: number,
    question: string,
    answer: Array<string>,
    working: boolean
}
export async function Education_Engine(context: Context): Promise<boolean> {
    const unknown = await prisma.unknown.findFirst({ where: { checked: false, } });
    if (!unknown) { await context.send('Нет непомеченных вопросов.'); return false; }
    const res: Education_Structure = { id: unknown.id, question: unknown.text, answer: [], working: true }
    while (res.working) {
        const input: any = await context.question(`Вопрос: ${res.question}\n\n Команды:\n!скорректировать - поправить вопрос;\n!добавить - добавить ответы;\n!пометить - считает неизвестный вопрос обработанным;\n!отмена - отменить обучение.`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!пометить', payload: { command: 'student' }, color: 'secondary' }).row()
                .textButton({ label: '!скорректировать', payload: { command: 'professor' }, color: 'secondary' }).row()
                .textButton({ label: '!добавить', payload: { command: 'citizen' }, color: 'secondary' }).row()
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' }).row()
                .oneTime().inline()
            }
        );
        const functions: any = {
            '!пометить': Education_Skipper,
            '!скорректировать': Education_Corrector,
            '!добавить': Education_Answer,
            '!отмена': Education_Cancel,
        };
        if (input?.text in functions) {
            const commandHandler = functions[input.text];
            await commandHandler(context, res);
            if (input.text == '!отмена') { return false }
        } else {
            await context.send(`Вы ввели несуществующую команду`)
        }
    }
    return true;
}

async function Education_Skipper(context: Context, res: Education_Structure): Promise<void> {
    const skip: Unknown = await prisma.unknown.update({ where: { id: res.id }, data: { checked: true } });
    if (skip) {await context.send(`Пропущен навсегда вопрос: ${skip.text}`)}
    res.working = false
}

async function Education_Corrector(context: Context, res: Education_Structure): Promise<void> {
    let ender = true
    let question_new = res.question
    while (ender) {
        const corrected = await context.question(`Есть вопрос: ${res.question}\n Исправленный вопрос: ${question_new}\n\nНапишите !сохранить если вас все устраивает.`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!сохранить', payload: { command: 'student' }, color: 'secondary' })
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' })
                .oneTime().inline()
            }
        )
        if (corrected.text == '!сохранить') {
            const correct: Unknown = await prisma.unknown.update({ where: { id: res.id }, data: { text: question_new } });
            if (correct) {
                await context.send(`Изменен неизвестный вопрос\nиз: ${res.question}\nна: ${correct.text}`)
                res.question = correct.text
                ender = false
            }
        } else {
            if (corrected.text == '!отмена') {
                ender = false
            } else {
                question_new = corrected.text
            }
        }
    }
}

async function Education_Answer(context: Context, res: Education_Structure): Promise<void> {
    let ender = true
    while (ender) {
        const corrected = await context.question(`Есть вопрос: ${res.question}\n\nЕсть ответы: \n${res.answer.map((answer, index) => `${index + 1} ${answer}`).join('\n')}\n\nНапишите !сохранить если вас все устраивает. иначе новый вариант ответа`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!сохранить', payload: { command: 'student' }, color: 'secondary' })
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' })
                .oneTime().inline()
            }
        )
        if (corrected.text == '!сохранить') {
            // Проверяем, есть ли вопрос уже в базе данных
            let question = await prisma.question.findFirst({ where: { text: res.question } });
            if (!question) {
                // Если вопроса нет, создаем новый вопрос в базе данных
                question = await prisma.question.create({ data: { text: res.question } });
            }
            for (const answer of res.answer) {
                // Проверяем, есть ли ответ уже в базе данных для данного вопроса
                const existingAnswer = await prisma.answer.findFirst({ where: { id_question: question.id, answer: answer } });
                if (!existingAnswer) {
                    // Если ответа нет, создаем новый ответ в базе данных для данного вопроса
                    await prisma.answer.create({ data: { answer: answer, crdate: new Date(), id_question: question.id } });
                }
            }
            clearTextSearchCache("questions");
            const skip: Unknown = await prisma.unknown.update({ where: { id: res.id }, data: { checked: true } });
            if (skip) {await context.send(`Ответы добавлены для неизвестного вопроса: ${skip.text}`)}
            res.working = false
            ender = false
        } else {
            if (corrected.text == '!отмена') {
                ender = false
            } else {
                res.answer.push(corrected.text)
            }
        }
    }
}
async function Education_Cancel(context: Context, res: Education_Structure): Promise<void> {
    await context.send(`Отменяем обучение`)
    res.working = false
}

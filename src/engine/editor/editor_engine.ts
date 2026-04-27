import { Answer, Unknown } from "@prisma/client";
import prisma from "../../module/prisma";
import { compareTwoStrings } from 'string-similarity';
import { Context, Keyboard } from "vk-io";
import { clearTextSearchCache } from "../reseacher/text_search";

async function Save_Answer(text: string, id_question: number): Promise<Answer | false> {
    const unknownQuestions: Answer[] = await prisma.answer.findMany({ where: { id_question: id_question } })
    for (const unknownQuestion of unknownQuestions) {
        const cosineScore = compareTwoStrings(text, unknownQuestion.answer,);
        if (cosineScore >= 0.8) {
            return unknownQuestion
        }
    }
    return false
}

export async function Editor_Engine(context: Context): Promise<boolean> {

    const res: { working: boolean } = { working: true }
    while (res.working) {
        const input: any = await context.question(`Добро пожаловать в режим редактирования баз данных\n\n Команды:\n!выбрать вопрос - для выбора вопроса по его ID для удаления или редактирования;\n!выбрать ответ - для выбора ответа по его ID для удаления или редактирования;\n!отмена - отменить обучение.`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!выбрать вопрос', payload: { command: 'student' }, color: 'secondary' }).row()
                .textButton({ label: '!выбрать ответ', payload: { command: 'professor' }, color: 'secondary' }).row()
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' }).row()
                .oneTime().inline()
            }
        );
        const functions: any = {
            '!выбрать вопрос': Select_Question,
            '!выбрать ответ': Select_Answer,
            '!отмена': Select_Cancel,
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

async function Select_Answer(context: Context, res: { working: boolean }): Promise<void> {
    let value_check = false
    const question: { id: number | null, text: String | null, text_edit: string | null, crdate: Date | null, id_question: number | null, text_question: string | null,} = { id: null, text: null, crdate: null, id_question: null, text_question: null, text_edit: null }
	while (value_check == false) {
		const uid: any = await context.question( `🧷 Введите ID ответа:`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' }).row()
                .oneTime().inline()
            }
        )
        if (uid.isTimeout) { return await context.send('⏰ Время ожидания на ввод банковского счета получателя истекло!')}
        if (uid.text == '!отмена') { value_check = true; return }
		if (/^(0|-?[1-9]\d{0,5})$/.test(uid.text)) {
            const answer = await prisma.answer.findFirst({ where: { id: Number(uid.text) } })
            if (answer) {
                const quest = await prisma.question.findFirst({ where: { id: answer.id_question } })
                if (quest) {
                    question.id = answer.id
                    question.text = answer.answer
                    question.crdate = answer.crdate
                    question.id_question = quest.id
                    question.text_question = quest.text
                    question.text_edit = answer.answer
                } else { return }
                value_check = true
            } else {
                await context.send(`Не найден ответ под ID${uid.text}`)
            }
        } else { await context.send(`💡 Нет такого ответа!`) }
    }
    let value_pass = false
    while (value_pass == false) {
        const input: any = await context.question(`Вы открыли следующий ответ к вопросу ID${question.id_question} ${question.text_question}:\nID: ${question.id}\nСодержание: ${question.text}\nДата создания: ${question.crdate}\n\n Команды:\n!скорректировать - изменить ответ;\n!удалить - удалить ответ;\n!отмена - отменить ответ.`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!скорректировать', payload: { command: 'student' }, color: 'secondary' }).row()
                .textButton({ label: '!удалить', payload: { command: 'professor' }, color: 'secondary' }).row()
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' }).row()
                .oneTime().inline()
            }
        );
        const functions: any = {
            '!скорректировать': Edit_Answer,
            '!удалить': Delete_Answer,
            '!отмена': Select_Cancel,
        };
        if (input?.text in functions) {
            const commandHandler = functions[input.text];
            await commandHandler(context, question);
            if (input.text == '!отмена') { value_pass = true  }
        } else {
            await context.send(`Вы ввели несуществующую команду`)
        }
    }
    async function Edit_Answer(context: Context, question: { id: number, text: String, text_edit: string, crdate: Date, id_question: number, text_question: String,}) {
        let ender = true
        while (ender) {
            const check = await Save_Answer(question.text_edit, question.id_question)
            const text_smart = check ? `Внимание уже есть похожий ответ на вопрос [${question.text_question}] под ID${check.id} [${check.answer}]` : ``
            const corrected = await context.question(`Корректировка ответа:\n[${question.text}] --> [${question.text_edit}]\n\nНапишите !сохранить если вас все устраивает. иначе новый вариант ответа\n\n ${text_smart}`,
                {	
                    keyboard: Keyboard.builder()
                    .textButton({ label: '!сохранить', payload: { command: 'student' }, color: 'secondary' })
                    .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' })
                    .oneTime().inline()
                }
            )
            if (corrected.text == '!сохранить') {
                // Проверяем, есть ли ответ уже в базе данных
                let save_pass = await prisma.answer.findFirst({ where: { id: question.id } });
                if (save_pass) {
                    const save = await prisma.answer.update({ where: { id: question.id }, data: { answer: question.text_edit } })
                    clearTextSearchCache("questions");
                    question.text = save.answer
                    question.text_edit = save.answer
                    await context.send(`Для вопроса ID${question.id_question} ${question.text_question} успешно изменен ответ ID${save_pass.id}:\n[${save_pass.answer}] --> [${save.answer}]`)
                }
                res.working = false
                ender = false
            } else {
                if (corrected.text == '!отмена') {
                    ender = false
                } else {
                    question.text_edit = corrected.text
                }
            }
        }
        value_pass = true
    }
    async function Delete_Answer(context: Context, question: { id: number, text: String, text_edit: string, crdate: Date, id_question: number, text_question: String,}) {
        let ender = true
        while (ender) {
            const corrected = await context.question(`Вы уверены, что хотите удалить следующий ответ к вопросу ID${question.id_question} ${question.text_question}:\nID: ${question.id}\nСодержание: ${question.text}\nДата создания: ${question.crdate}\n\nНапишите !да если подтверждаете его удаление. иначе !нет для отмены удаления`,
                {	
                    keyboard: Keyboard.builder()
                    .textButton({ label: '!да', payload: { command: 'student' }, color: 'secondary' })
                    .textButton({ label: '!нет', payload: { command: 'citizen' }, color: 'secondary' })
                    .oneTime().inline()
                }
            )
            if (corrected.text == '!да') {
                // Проверяем, есть ли ответ уже в базе данных
                let save_pass = await prisma.answer.findFirst({ where: { id: question.id } });
                if (save_pass) {
                    const save = await prisma.answer.delete({ where: { id: question.id } })
                    clearTextSearchCache("questions");
                    await context.send(`Для вопроса ID${question.id_question} ${question.text_question} успешно удален ответ ID${save_pass.id}:\n[${save.answer}]`)
                }
                res.working = false
                ender = false
            } else {
                ender = false
            }
        }
        value_pass = true
    }
}

async function Select_Question(context: Context, res: { working: boolean }): Promise<void> {
    let value_check = false
    const question: { id: number | null, text: String | null, text_edit: string | null} = { id: null, text: null, text_edit: null }
	while (value_check == false) {
		const uid: any = await context.question( `🧷 Введите ID вопроса:`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' }).row()
                .oneTime().inline()
            }
        )
        if (uid.isTimeout) { return await context.send('⏰ Время ожидания на ввод банковского счета получателя истекло!')}
        if (uid.text == '!отмена') { value_check = true; return }
		if (/^(0|-?[1-9]\d{0,5})$/.test(uid.text)) {
            const ques = await prisma.question.findFirst({ where: { id: Number(uid.text) } })
            if (ques) {
                question.id = ques.id
                question.text = ques.text
                question.text_edit = ques.text
                value_check = true
            } else {
                await context.send(`Не найден вопрос под ID${uid.text}`)
            }
        } else { await context.send(`💡 Нет такого вопроса!`) }
    }
    let value_pass = false
    while (value_pass == false) {
        const input: any = await context.question(`Вы открыли следующий вопрос:\nID: ${question.id}\nСодержание: ${question.text}\n\n Команды:\n!скорректировать - изменить вопрос;\n!удалить - удалить вопрос;\n!отмена - отменить вопрос.`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!скорректировать', payload: { command: 'student' }, color: 'secondary' }).row()
                .textButton({ label: '!удалить', payload: { command: 'professor' }, color: 'secondary' }).row()
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' }).row()
                .oneTime().inline()
            }
        );
        const functions: any = {
            '!скорректировать': Edit_Question,
            '!удалить': Delete_Question,
            '!отмена': Select_Cancel,
        };
        if (input?.text in functions) {
            const commandHandler = functions[input.text];
            await commandHandler(context, question);
            if (input.text == '!отмена') { value_pass = true  }
        } else {
            await context.send(`Вы ввели несуществующую команду`)
        }
    }
    async function Edit_Question(context: Context, question: { id: number, text: String, text_edit: string}) {
        let ender = true
        while (ender) {
            const corrected = await context.question(`Корректировка вопроса:\n[${question.text}] --> [${question.text_edit}]\n\nНапишите !сохранить если вас все устраивает. иначе новый вариант вопроса`,
                {	
                    keyboard: Keyboard.builder()
                    .textButton({ label: '!сохранить', payload: { command: 'student' }, color: 'secondary' })
                    .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' })
                    .oneTime().inline()
                }
            )
            if (corrected.text == '!сохранить') {
                // Проверяем, есть ли ответ уже в базе данных
                let save_pass = await prisma.question.findFirst({ where: { id: question.id } });
                if (save_pass) {
                    const save = await prisma.question.update({ where: { id: question.id }, data: { text: question.text_edit } })
                    clearTextSearchCache("questions");
                    question.text = save.text
                    question.text_edit = save.text
                    await context.send(`Успешно изменен вопрос ID${save_pass.id}:\n[${save_pass.text}] --> [${save.text}]`)
                }
                res.working = false
                ender = false
            } else {
                if (corrected.text == '!отмена') {
                    ender = false
                } else {
                    question.text_edit = corrected.text
                }
            }
        }
        value_pass = true
    }
    async function Delete_Question(context: Context, question: { id: number, text: String, text_edit: string}) {
        let ender = true
        while (ender) {
            const question_counter = await prisma.answer.count({ where: { id_question: question.id } })
            const corrected = await context.question(`Вы уверены, что хотите удалить следующий вопрос:\nID: ${question.id}\nСодержание: ${question.text}\n\nНапишите !да если подтверждаете его удаление. иначе !нет для отмены удаления\n\n Также удалено следующее количество ответов к нему: ${question_counter}`,
                {	
                    keyboard: Keyboard.builder()
                    .textButton({ label: '!да', payload: { command: 'student' }, color: 'secondary' })
                    .textButton({ label: '!нет', payload: { command: 'citizen' }, color: 'secondary' })
                    .oneTime().inline()
                }
            )
            if (corrected.text == '!да') {
                // Проверяем, есть ли ответ уже в базе данных
                let save_pass = await prisma.question.findFirst({ where: { id: question.id } });
                if (save_pass) {
                    
                    const save = await prisma.question.delete({ where: { id: question.id } })
                    clearTextSearchCache("questions");
                    await context.send(`Успешно удален вопрос ID${save_pass.id}:\n[${save.text}]\n\n Также удалено следующее количество ответов к нему: ${question_counter}`)
                }
                res.working = false
                ender = false
            } else {
                ender = false
            }
        }
        value_pass = true
    }
}

async function Select_Cancel(context: Context, res: { working: boolean }): Promise<void> {
    await context.send(`Отменяем режим редактирования`)
    res.working = false
}

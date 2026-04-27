import { Answer, BlackList, Unknown } from "@prisma/client";
import prisma from "../../module/prisma";
import { compareTwoStrings } from 'string-similarity';
import { Context, Keyboard } from "vk-io";
import Black_List_Engine from "./blacklist";
import { clearTextSearchCache } from "../reseacher/text_search";

async function Save_Black_Word(text: string): Promise<BlackList | false> {
    const unknownQuestions: BlackList[] = await prisma.blackList.findMany({})
    for (const unknownQuestion of unknownQuestions) {
        const cosineScore = compareTwoStrings(text, unknownQuestion.text,);
        if (cosineScore >= 0.8) {
            return unknownQuestion
        }
    }
    return false
}

export async function Editor_Engine_BlackList(context: Context): Promise<boolean> {

    const res: { working: boolean } = { working: true }
    while (res.working) {
        const input: any = await context.question(`Добро пожаловать в режим редактирования блеклиста баз данных\n\n Команды:\n!выбрать стоп-слово - для выбора стоп-слова по его ID для удаления или редактирования;\n!добавить стоп-слово - для добавления нового стоп-слова;\n!отмена - отменить стоп-слова.`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!выбрать стоп-слово', payload: { command: 'student' }, color: 'secondary' }).row()
                .textButton({ label: '!добавить стоп-слово', payload: { command: 'professor' }, color: 'secondary' }).row()
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' }).row()
                .oneTime().inline()
            }
        );
        const functions: any = {
            '!выбрать стоп-слово': Select_BlackList,
            '!добавить стоп-слово': Create_BlackList,
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

async function Create_BlackList(context: Context, res: { working: boolean }): Promise<void> {
    let ender = true
    let word = ``
    while (ender) {
        const check = await Save_Black_Word(word)
        const text_smart = check ? `Внимание уже есть похожее стоп-слово [${check.text}] под ID${check.id}` : ``
        const corrected = await context.question(`Добавление стоп-слова, вы ввели:\n[${word}]\n\nНапишите !сохранить если вас все устраивает. иначе новый вариант стоп-слово`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!сохранить', payload: { command: 'student' }, color: 'secondary' })
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' })
                .oneTime().inline()
            }
        )
        if (corrected.text == '!сохранить') {
            // Проверяем, есть ли ответ уже в базе данных
            const save = await prisma.blackList.create({ data: { text: word } })
            clearTextSearchCache("black-list");
            if (save) {
                await context.send(`Успешно добавлено стоп-слово ID${save.id}:\n[${save.text}]`)
            }
            res.working = false
            ender = false
        } else {
            if (corrected.text == '!отмена') {
                ender = false
            } else {
                word = corrected.text
            }
        }
    }
}

async function Select_BlackList(context: Context, res: { working: boolean }): Promise<void> {
    let value_check = false
    const question: { id: number | null, text: String | null, text_edit: string | null} = { id: null, text: null, text_edit: null }
	while (value_check == false) {
		const uid: any = await context.question( `🧷 Введите ID стоп-слова:`,
            {	
                keyboard: Keyboard.builder()
                .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' }).row()
                .oneTime().inline()
            }
        )
        if (uid.isTimeout) { return await context.send('⏰ Время ожидания на ввод банковского счета получателя истекло!')}
		if (uid.text == '!отмена') { value_check = true; return }
        if (/^(0|-?[1-9]\d{0,5})$/.test(uid.text)) {
            const ques = await prisma.blackList.findFirst({ where: { id: Number(uid.text) } })
            if (ques) {
                question.id = ques.id
                question.text = ques.text
                question.text_edit = ques.text
                value_check = true
            } else {
                await context.send(`Не найдено стоп-слово под ID${uid.text}`)
            }
        } else { await context.send(`💡 Нет такого стоп-слова!`) }
    }
    let value_pass = false
    while (value_pass == false) {
        const input: any = await context.question(`Вы открыли следующее стоп-слово:\nID: ${question.id}\nСодержание: ${question.text}\n\n Команды:\n!скорректировать - изменить стоп-слово;\n!удалить - удалить стоп-слово;\n!отмена - отменить стоп-слово.`,
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
            const check = await Save_Black_Word(question.text_edit)
            const text_smart = check ? `Внимание уже есть похожее стоп-слово [${check.text}] под ID${check.id}` : ``
            const corrected = await context.question(`Корректировка стоп-слова:\n[${question.text}] --> [${question.text_edit}]\n\nНапишите !сохранить если вас все устраивает. иначе новый вариант стоп-слово\n\n ${text_smart}`,
                {	
                    keyboard: Keyboard.builder()
                    .textButton({ label: '!сохранить', payload: { command: 'student' }, color: 'secondary' })
                    .textButton({ label: '!отмена', payload: { command: 'citizen' }, color: 'secondary' })
                    .oneTime().inline()
                }
            )
            if (corrected.text == '!сохранить') {
                // Проверяем, есть ли ответ уже в базе данных
                let save_pass = await prisma.blackList.findFirst({ where: { id: question.id } });
                if (save_pass) {
                    const save = await prisma.blackList.update({ where: { id: question.id }, data: { text: question.text_edit } })
                    clearTextSearchCache("black-list");
                    question.text = save.text
                    question.text_edit = save.text
                    await context.send(`Успешно изменено стоп-слово ID${save_pass.id}:\n[${save_pass.text}] --> [${save.text}]`)
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
            const corrected = await context.question(`Вы уверены, что хотите удалить следующее стоп-слово:\nID: ${question.id}\nСодержание: ${question.text}\n\nНапишите !да если подтверждаете его удаление. иначе !нет для отмены удаления\n`,
                {	
                    keyboard: Keyboard.builder()
                    .textButton({ label: '!да', payload: { command: 'student' }, color: 'secondary' })
                    .textButton({ label: '!нет', payload: { command: 'citizen' }, color: 'secondary' })
                    .oneTime().inline()
                }
            )
            if (corrected.text == '!да') {
                // Проверяем, есть ли ответ уже в базе данных
                let save_pass = await prisma.blackList.findFirst({ where: { id: question.id } });
                if (save_pass) {
                    
                    const save = await prisma.blackList.delete({ where: { id: question.id } })
                    clearTextSearchCache("black-list");
                    await context.send(`Успешно удаленj стоп-слово ID${save_pass.id}:\n[${save.text}]\n`)
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
    await context.send(`Отменяем режим редактирования блэклиста`)
    res.working = false
}

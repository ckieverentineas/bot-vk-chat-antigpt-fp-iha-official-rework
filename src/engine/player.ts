import { User } from "@prisma/client";
import path from "path";
import { HearManager } from "@vk-io/hear";
import { IQuestionMessageContext } from "vk-io-question";
import { root, starting_date } from '../index';
import { User_Access, User_Info} from './helper';
import prisma from "../module/prisma";
import { Prefab_Engine } from './prefab/prefab_engine';
import { Save_Answers_and_Question_In_DB, exportQuestionsAndAnswers } from "./parser";
import { Education_Engine } from "./education/education_egine";
import { Editor_Engine } from "./editor/editor_engine";
import { Editor_Engine_BlackList } from "./prefab/blacklist_editor";

export function registerUserRoutes(hearManager: HearManager<IQuestionMessageContext>): void {
    hearManager.hear(/!база/, async (context) => {
        if (context.isOutbox == false && context.senderId == root) {
            await Save_Answers_and_Question_In_DB(context)

        }
    })
    hearManager.hear(/!конфиг/, async (context) => {
        if (context.isOutbox == false && (context.senderId == root || await User_Access(context) == true)) {
            const count_question = await prisma.question.count({})
            const count_answer = await prisma.answer.count({})
            const count_blacklist = await prisma.blackList.count({})
            await context.send(`Панель администратора: \n 🔸 Версия: 0.1.06 Pre-Alpha Building \n 👤 Личные сообщения: Разрешены \n 👥 Беседы: Разрешены \n\n ⚙ Защиты: 🛡Антиспам \n 🛡"Я не повторяюсь" \n 🛡"Ты повторяешься" \n 🛡"Молчать, когда два бота вместе" \n 🛡"Упомянули не меня" \n 🛡"Ответили не мне" \n 🛡"Имунитет от любителей писать одно слово в сообщении" \n 📚 Количество вопросов ${count_question} и ответов к ним: ${count_answer} \n ☠ Количество стоп-слов в blacklist ${count_blacklist} \n\n 📝 Поисковые движки: \n 🔍 DirectBoost - ищет ответы 1 к 1; \n 🔍 MultiBoost - ищет для кучи предложений нечетко.`)
        }
    })
    hearManager.hear(/!помощь/, async (context) => {
        if (context.isOutbox == false && (context.senderId == root || await User_Access(context) == true)) {
            await context.send(`☠ Команды бота уже сделанные:
                \n👤 !инфа - выдает информацию о вас и вашем статусе для релевантности бота, конечно вам покажут не все=)
                \n👥 !конфиг - показывает текущую конфигурацию бота
                \n👥 !игнор idvk - где idvk, пишем уникальный идентификатор пользователя вк или упоминаем пользователя, для включения или отключения режима его игнорирования
                \n⭐ !юзердроп - удаляет всех пользователей
                \n⭐ !дамп - сохраняет txt в корне проекта под названием "questions_and_answers.txt" согласно формату
                \n👥 !аптайм - показывает время работы с момента запуска бота
                \n👥 !права idvk - где idvk, пишем уникальный идентификатор пользователя вк или упоминаем пользователя, для выдачи снятия прав администратора
                \n🌐 !обучение - достает неизвестные вопросы, обнаруженные ботом и предлагает их скорректировать и дать ответы на них.
                \n🌐 !редактирование - позволяет по ID вопроса/ответа удалить или скорректировать вопрос/ответ.
                \n🌐 !блэклист - позволяет по ID стоп-слова удалить или скорректировать его, или добавить новое стоп-слово.
                \n⭐ !база - доступна админам считывает тхт формата: \nВопрос\nОтвет\nОтвет\n\nВопрос\nОтвет\n\nВопрос\nОтвет\nОтвет\nОтвет\nОтвет\n\n.....
                \n💡 В корне проекта должна быть директория (папка) book в которой все txt для загрузки вопросов и ответов к ним в базу данных посредством команды !база.
                \n⌚️ !злыечасы - ввывод часов в стиле агрессии.
                \n⚠ Команды с символами:\n👤 - Доступны обычным пользователям;\n👥 - Доступны администраторам бота;\n🌐 - Доступны администраторам бота только в сообщениях с группой.\n⭐ - Доступны только рут пользователю бота`
            )
        }
    })
    hearManager.hear(/!игнор/, async (context) => {
        if (context.isOutbox == false && (context.senderId == root || await User_Access(context) == true) && context.text) {
            const target: number = Number(context.text.replace(/[^0-9]/g,"")) || 0
            if (target > 0) {
                const user: any = await prisma.user.findFirst({ where: { idvk: target } })
                if (user) {
                    const login = await prisma.user.update({ where: { idvk: target }, data: { ignore: user.ignore ? false : true } })
                    await context.send(`@id${login.idvk}(Пользователь) ${login.ignore ? 'добавлен в лист игнора' : 'убран из листа игнора'}`)
                    console.log(`@id${login.idvk}(Пользователь) ${login.ignore ? 'добавлен в лист игнора' : 'убран из листа игнора'}`)
                } else {
                    await context.send(`@id${target}(Пользователья) не существует`)
                    console.log(`@id${target}(Пользователья) не существует`)
                }
            }
        }
    })
    hearManager.hear(/!забань/, async (context) => {
        if (context.isOutbox == false) {
            const target: number = context.senderId; // Извлекаем ID отправителя
            if (target > 0) {
                const user: any = await prisma.user.findFirst({ where: { idvk: target } });
                if (user) {
                    const login = await prisma.user.update({
                        where: { idvk: target },
                        data: { ignore: user.ignore ? false : true } // Переключаем статус на игнор
                    });
                    await context.send(`@id${login.idvk}(Юзер) ${login.ignore ? 'ты меня обидел, теперь не буду отвечать тебе' : 'я тебя прощаю, давай общаться)'}`);
                    console.log(`@id${login.idvk}(Пользователь) ${login.ignore ? 'добавлен в лист игнора' : 'убран из листа игнора'}`);
                } else {
                    await context.send(`@id${target}(Пользователья) не существует`);
                    console.log(`@id${target}(Пользователья) не существует`);
                }
            }
        }
    });
    
    hearManager.hear(/!права/, async (context) => {
        if (context.isOutbox == false && (context.senderId == root || await User_Access(context) == true) && context.text) {
            const target: number = Number(context.text.replace(/[^0-9]/g,"")) || 0
            if (target > 0) {
                const user: User | null = await prisma.user.findFirst({ where: { idvk: target } })
                if (user) {
                    const login = await prisma.user.update({ where: { idvk: target }, data: { root: user.root ? false : true } })
                    await context.send(`@id${login.idvk}(Пользователь) ${login.root ? 'добавлен в лист администраторов' : 'убран из листа администраторов'}`)
                    console.log(`@id${login.idvk}(Пользователь) ${login.root ? 'добавлен в лист администраторов' : 'убран из листа администраторов'}`)
                } else {
                    await context.send(`@id${target}(Пользователья) не существует`)
                    console.log(`@id${target}(Пользователья) не существует`)
                }
            }
        }
    })
    hearManager.hear(/!юзердроп/, async (context) => {
        if (context.isOutbox == false && (context.senderId == root)) {
            const user: User[] | null = await prisma.user.findMany({})
            if (user && user.length >= 1) {
                for (const i in user) {
                    const login = await prisma.user.delete({ where: { id: user[i].id } })
                    console.log(`@id${login.idvk}(Пользователь) был удален`)
                }
                await context.send(`⚙ Внимание, было удалено пользователей ${user.length}`)
            } else {
                await context.send(`⚙ Обидно, но некого удалить... Увы`)
                console.log(`Пользователей не обнаружено`)
            }
        }
    })
    hearManager.hear(/!инфа/, async (context) => {
        if (await Prefab_Engine(context)) { return; }
        if (context.isOutbox == false) {
            const user: User | null = await prisma.user.findFirst({ where: { idvk: context.senderId } })
            const info: any = await User_Info(context)
            if (user) {
                await context.send(` 👤 Имя: @id${user.idvk}(${info.first_name}): \n\n 💳 Порядковый номер: ${user.id} \n 🎥 Кремлевский номер: ${user.idvk} \n ⚠ Получено предупреждений: ${user.warning}/3 \n ⚰ Дата резервации: ${user.crdate} \n ⛓ Статус: ${user.ignore ? 'В стоп-листе' : 'Законопослушны'} \n 🔸 Находитесь в капсуле: 0.1.06 Pre-Alpha Building \n `)
            }
        }
    })
    hearManager.hear(/!дамп/, async (context) => {
        if (!context.isOutbox && context.senderId === root && context?.text !== undefined) {
            try {
                await context.send('Вы запустили процесс слива базы данных в текстовый файл. Пожалуйста, подождите...');
                console.log('Запуск процесса слива базы данных...');
                await exportQuestionsAndAnswers();
                await context.send('Процесс завершён. Загружаю файл...');
                const filePath = path.resolve('questions_and_answers.txt'); // Абсолютный путь к файлу
                await context.sendDocuments({
                    value: filePath,
                    filename: 'questions_and_answers.txt',
                });
    
                console.log('Файл успешно отправлен пользователю.');
            } catch (error) {
                console.error('Ошибка при выполнении команды !дамп:', error);
                await context.send('Произошла ошибка при выполнении команды. Попробуйте снова позже.');
            }
        }
    });
    
    hearManager.hear(/!аптайм/, async (context) => {
        if (context.isOutbox == false && (context.senderId == root || await User_Access(context) == true) && context?.text != undefined) {
            const now = new Date();
            const diff = now.getTime() - starting_date.getTime();
            const timeUnits = [
                { unit: "дней", value: Math.floor(diff / 1000 / 60 / 60 / 24) },
                { unit: "часов", value: Math.floor((diff / 1000 / 60 / 60) % 24) },
                { unit: "минут", value: Math.floor((diff / 1000 / 60) % 60) },
                { unit: "секунд", value: Math.floor((diff / 1000) % 60) },
            ];
            await context.send(`Время работы: ${timeUnits.filter(({ value }) => value > 0).map(({ unit, value }) => `${value} ${unit}`).join(" ")}`);
        }
    })
    hearManager.hear(/!обучение/, async (context: any) => {
        if (context.isOutbox == false && (context.senderId == root || await User_Access(context) == true) && context?.text != undefined) {
            try {
                const [group] = await context.api.groups.getById();
	            const groupId = group.id;
            } catch {
                return context.send(`Команда доступна только в ботогруппе!`)
            }
            await context.send(`Внимание, вы в режиме обучения бота!`);
            while (true) {
                const trig = await Education_Engine(context)
                if (!trig) { break }
            }
            
            await context.send(`Обучили`);
        }
    })
    hearManager.hear(/!редактирование/, async (context: any) => {
        if (context.isOutbox == false && (context.senderId == root || await User_Access(context) == true) && context?.text != undefined) {
            try {
                const [group] = await context.api.groups.getById();
	            const groupId = group.id;
            } catch {
                return context.send(`Команда доступна только в ботогруппе!`)
            }
            await context.send(`Внимание, вы в режиме редактирования базы данных бота!`);
            while (true) {
                const trig = await Editor_Engine(context)
                if (!trig) { break }
            }
            
            await context.send(`Скорректировали`);
        }
    })
    hearManager.hear(/!блэклист/, async (context: any) => {
        if (context.isOutbox == false && (context.senderId == root || await User_Access(context) == true) && context?.text != undefined) {
            try {
                const [group] = await context.api.groups.getById();
	            const groupId = group.id;
            } catch {
                return context.send(`Команда доступна только в ботогруппе!`)
            }
            await context.send(`Внимание, вы в режиме обновления блеклиста базы данных бота!`);
            while (true) {
                const trig = await Editor_Engine_BlackList(context)
                if (!trig) { break }
            }
            await context.send(`Скорректировали`);
        }
    })
}

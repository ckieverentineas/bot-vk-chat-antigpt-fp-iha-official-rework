import { User } from "@prisma/client";
import path from "path";
import { HearManager } from "@vk-io/hear";
import { QuestionMessageContext } from "../module/question_flow";
import { root, starting_date } from '../index';
import { User_Access, User_Info} from './helper';
import prisma from "../module/prisma";
import { Prefab_Engine } from './prefab/prefab_engine';
import { Save_Answers_and_Question_In_DB, exportQuestionsAndAnswers } from "./parser";
import { Education_Engine } from "./education/education_egine";
import { Editor_Engine } from "./editor/editor_engine";
import { Editor_Engine_BlackList } from "./prefab/blacklist_editor";
import { findBlackListDetection } from "./prefab/blacklist";
import { buildAsciiSayMessage, parseAsciiSayCommand, validateAsciiSayText } from "./ascii_say";
import { getContextLogger, logWithContext } from "../module/logger";
import { PROJECT_VERSION_LABEL } from "../module/project_version";
import {
    formatIgnoredChatToggleMessage,
    getChatPeerId,
    getIgnoredChatTitle,
    parseIgnoredChatCommand,
    toggleIgnoredChat,
} from "../module/ignored_chats";
import {
    formatRuntimeSettings,
    getRuntimeFeatureLabel,
    getRuntimeSettings,
    parseRuntimeModeCommand,
    saveRuntimeFeatureToDatabase,
} from "../module/runtime_flags";

export function registerUserRoutes(hearManager: HearManager<QuestionMessageContext>): void {
    hearManager.hear(/^!(?:скажи|say)(?:\s|$)/i, async (context) => {
        if (context.isOutbox || !context.text) {
            return;
        }

        if (await Prefab_Engine(context)) {
            return;
        }

        const rawText = parseAsciiSayCommand(context.text);
        if (rawText === undefined) {
            return;
        }

        const validation = validateAsciiSayText(rawText);
        if (!validation.ok) {
            await context.send(validation.reason);
            return;
        }

        const blackListDetection = await findBlackListDetection(validation.text);
        if (blackListDetection !== undefined) {
            logWithContext(context, `Команда !скажи отклонена стоп-словом [${blackListDetection.text}]`);
            await context.send('Не могу это нарисовать: текст не прошел фильтр.');
            return;
        }

        await context.send(buildAsciiSayMessage(validation.text));
    })
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
            await context.send(`Панель администратора: \n 🔸 Версия: ${PROJECT_VERSION_LABEL} \n 👤 Личные сообщения: Разрешены \n 👥 Беседы: Разрешены \n\n ⚙ Защиты: 🛡Антиспам \n 🛡"Я не повторяюсь" \n 🛡"Ты повторяешься" \n 🛡"Молчать, когда два бота вместе" \n 🛡"Упомянули не меня" \n 🛡"Ответили не мне" \n 🛡"Имунитет от любителей писать одно слово в сообщении" \n 📚 Количество вопросов ${count_question} и ответов к ним: ${count_answer} \n ☠ Количество стоп-слов в blacklist ${count_blacklist} \n\n 📝 Поисковые движки: \n 🔍 DirectBoost - ищет ответы 1 к 1; \n 🔍 MultiBoost - ищет для кучи предложений нечетко.`)
        }
    })
    hearManager.hear(/!режим/, async (context) => {
        if (context.isOutbox == false && (context.senderId == root || await User_Access(context) == true) && context.text) {
            const command = parseRuntimeModeCommand(context.text);

            if (command === undefined) {
                await context.send(formatRuntimeSettings(getRuntimeSettings()));
                return;
            }

            try {
                const settings = await saveRuntimeFeatureToDatabase(command.feature, command.enabled);
                await context.send([
                    `${getRuntimeFeatureLabel(command.feature)}: ${command.enabled ? 'включены' : 'отключены'}`,
                    '',
                    formatRuntimeSettings(settings),
                ].join('\n'));
            } catch (error) {
                await context.send(`Не удалось сохранить runtime-настройку в БД: ${error}`);
            }
        }
    })
    hearManager.hear(/!помощь/, async (context) => {
        if (context.isOutbox == false && (context.senderId == root || await User_Access(context) == true)) {
            await context.send(`☠ Команды бота уже сделанные:
                \n👤 !инфа - выдает информацию о вас и вашем статусе для релевантности бота, конечно вам покажут не все=)
                \n👥 !конфиг - показывает текущую конфигурацию бота
                \n👥 !игнор idvk - включает или отключает игнор пользователя
                \n👥 !игнор беседа - включает или отключает игнор текущей беседы
                \n⭐ !юзердроп - удаляет всех пользователей
                \n⭐ !дамп - сохраняет txt в корне проекта под названием "questions_and_answers.txt" согласно формату
                \n👥 !аптайм - показывает время работы с момента запуска бота
                \n👥 !режим - показывает runtime-тумблеры бота
                \n👥 !режим ответы/лс/беседы/стена/оффлайн вкл|выкл - динамически включает или отключает функционал
                \n👤 !скажи текст - рисует короткий текст ASCII-артом с фильтрацией
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
            if (parseIgnoredChatCommand(context.text)) {
                const peerId = getChatPeerId(context);

                if (peerId === undefined) {
                    await context.send('Эта команда работает только в беседе.');
                    return;
                }

                const result = await toggleIgnoredChat({
                    peerId,
                    title: getIgnoredChatTitle(context),
                    createdByIdvk: context.senderId,
                    reason: 'manual command',
                });
                const message = formatIgnoredChatToggleMessage(result);

                await context.send(message);
                logWithContext(context, message);
                return;
            }

            const target: number = Number(context.text.replace(/[^0-9]/g,"")) || 0
            if (target > 0) {
                const user: any = await prisma.user.findFirst({ where: { idvk: target } })
                if (user) {
                    const login = await prisma.user.update({ where: { idvk: target }, data: { ignore: user.ignore ? false : true } })
                    await context.send(`@id${login.idvk}(Пользователь) ${login.ignore ? 'добавлен в лист игнора' : 'убран из листа игнора'}`)
                    logWithContext(context, `@id${login.idvk}(Пользователь) ${login.ignore ? 'добавлен в лист игнора' : 'убран из листа игнора'}`)
                } else {
                    await context.send(`@id${target}(Пользователья) не существует`)
                    logWithContext(context, `@id${target}(Пользователья) не существует`)
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
                    logWithContext(context, `@id${login.idvk}(Пользователь) ${login.ignore ? 'добавлен в лист игнора' : 'убран из листа игнора'}`);
                } else {
                    await context.send(`@id${target}(Пользователья) не существует`);
                    logWithContext(context, `@id${target}(Пользователья) не существует`);
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
                    logWithContext(context, `@id${login.idvk}(Пользователь) ${login.root ? 'добавлен в лист администраторов' : 'убран из листа администраторов'}`)
                } else {
                    await context.send(`@id${target}(Пользователья) не существует`)
                    logWithContext(context, `@id${target}(Пользователья) не существует`)
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
                    logWithContext(context, `@id${login.idvk}(Пользователь) был удален`)
                }
                await context.send(`⚙ Внимание, было удалено пользователей ${user.length}`)
            } else {
                await context.send(`⚙ Обидно, но некого удалить... Увы`)
                logWithContext(context, `Пользователей не обнаружено`)
            }
        }
    })
    hearManager.hear(/!инфа/, async (context) => {
        if (await Prefab_Engine(context)) { return; }
        if (context.isOutbox == false) {
            const user: User | null = await prisma.user.findFirst({ where: { idvk: context.senderId } })
            const info: any = await User_Info(context)
            if (user) {
                await context.send(` 👤 Имя: @id${user.idvk}(${info.first_name}): \n\n 💳 Порядковый номер: ${user.id} \n 🎥 Кремлевский номер: ${user.idvk} \n ⚠ Получено предупреждений: ${user.warning}/3 \n ⚰ Дата резервации: ${user.crdate} \n ⛓ Статус: ${user.ignore ? 'В стоп-листе' : 'Законопослушны'} \n 🔸 Находитесь в капсуле: ${PROJECT_VERSION_LABEL} \n `)
            }
        }
    })
    hearManager.hear(/!дамп/, async (context) => {
        if (!context.isOutbox && context.senderId === root && context?.text !== undefined) {
            try {
                await context.send('Вы запустили процесс слива базы данных в текстовый файл. Пожалуйста, подождите...');
                logWithContext(context, 'Запуск процесса слива базы данных...');
                await exportQuestionsAndAnswers(getContextLogger(context));
                await context.send('Процесс завершён. Загружаю файл...');
                const filePath = path.resolve('questions_and_answers.txt'); // Абсолютный путь к файлу
                await context.sendDocuments({
                    value: filePath,
                    filename: 'questions_and_answers.txt',
                });
    
                logWithContext(context, 'Файл успешно отправлен пользователю.');
            } catch (error) {
                logWithContext(context, `Ошибка при выполнении команды !дамп: ${error}`);
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

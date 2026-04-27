import { Context, VK } from 'vk-io';
import { HearManager } from '@vk-io/hear';
import { QuestionManager, IQuestionMessageContext } from 'vk-io-question';
import { registerUserRoutes } from './engine/player'
import { InitGameRoutes } from './engine/init';
import { registerCommandRoutes } from './engine/command';
const natural = require('natural');
import * as dotenv from "dotenv";
import { Analyzer_Core_Edition } from './engine/core/analyzer_controller';
import { Answer_Core_Edition } from './engine/core/reseacher_controller';
import { updateStatuses } from './module/status_changer';
import prisma from './module/prisma';
import { Prefab_Engine } from './engine/prefab/prefab_engine';
import { Replacer_System_Params } from './engine/reseacher/specializator';
import { User_Info } from './engine/helper';
import { Answer_Offline } from './engine/offline_answer';
import { parseVkEntitiesEnv, VkEntity, VkEntityType } from './module/vk_entities_env';
import { createLogger, formatIncomingMessageLog, logWithContext, setContextLogger } from './module/logger';
dotenv.config();

const systemLogger = createLogger('vk-chat-bot');


export const root: number = Number(process.env.root) //root user

//инициализация
const questionManager = new QuestionManager();
const hearManager = new HearManager<IQuestionMessageContext>();

export const tokenizer = new natural.AggressiveTokenizerRu()
export const tokenizer_sentence = new natural.SentenceTokenizer()
export const starting_date = new Date(); // время работы бота

/* раскоментировать для того, чтобы лицезреть процесс поиска ответов
prisma.$use(async (params, next) => {
	const before = Date.now()
	const result = await next(params)
	const after = Date.now()
	systemLogger(`Query ${params.model}.${params.action} took ${after - before}ms`)
	return result
})
*/


export interface VKs_Info {
	idvk: number,
	type: VkEntityType,
	name: string
}
// Получаем данные обо всех Vk-сущностях из .env файла
const vkEntitiesParseResult = parseVkEntitiesEnv(process.env.VK_ENTITIES);
if (vkEntitiesParseResult.error) {
	systemLogger(vkEntitiesParseResult.error);
}

const vkEntities: VkEntity[] = vkEntitiesParseResult.entities;
// Создаем объект VK для каждой Vk-сущности
export const vks: VK[] = [];
export const vks_info: VKs_Info[] = [];

interface ResolvedVkEntity {
	token: string,
	idvk: number,
	type: VkEntityType,
	name: string
}

interface ConfiguredVk {
	vk: VK,
	info: VKs_Info
}

type IncomingMessageDecision = 'ACCESS' | 'DENIED' | 'LOADING';

async function Group_Info_Get(token: string): Promise<ResolvedVkEntity> {
	const vk = new VK({ token: token, apiLimit: 1 });
	const [group] = await vk.api.groups.getById({});
	if (!group?.id) {
		throw new Error('VK API не вернул id группы');
	}
	return {
		token,
		idvk: Number(group.id),
		type: 'group',
		name: group.name || `club${group.id}`,
	}
}

async function User_Info_Get(token: string): Promise<ResolvedVkEntity> {
	const vk = new VK({ token: token, apiLimit: 1 });
	const [user] = await vk.api.users.get({});
	if (!user?.id) {
		throw new Error('VK API не вернул id страницы');
	}
	return {
		token,
		idvk: Number(user.id),
		type: 'page',
		name: [user.first_name, user.last_name].filter(Boolean).join(' ') || `id${user.id}`,
	}
}

async function Vk_Entity_Resolve(entity: VkEntity): Promise<ResolvedVkEntity> {
	if (entity.type === 'group') {
		return Group_Info_Get(entity.token);
	}

	if (entity.type === 'page') {
		return User_Info_Get(entity.token);
	}

	try {
		return await Group_Info_Get(entity.token);
	} catch {
		return User_Info_Get(entity.token);
	}
}

async function Log_Incoming_Message(context: Context, decision: IncomingMessageDecision, message: unknown = context.text): Promise<void> {
	logWithContext(context, formatIncomingMessageLog({
		senderId: Number(context.senderId),
		senderName: await Sender_Name_Get(context),
		channel: Message_Channel_Get(context),
		message,
		decision,
	}));
}

async function Sender_Name_Get(context: Context): Promise<string> {
	try {
		const user = await User_Info(context);
		const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ');

		return fullName || `id${context.senderId}`;
	} catch {
		return `id${context.senderId}`;
	}
}

function Message_Channel_Get(context: Context): string {
	if (context.isWallComment) {
		return 'Стена группы';
	}

	return context.isChat ? 'Беседа' : 'Личные сообщения';
}

const configuredVks: ConfiguredVk[] = [];

Promise.all(vkEntities.map(async entity => {
	try {
		const resolvedEntity = await Vk_Entity_Resolve(entity);
		// Авторизация
		const vk = new VK({
		  token: resolvedEntity.token,
		  apiLimit: 1,
		  pollingGroupId: resolvedEntity.type === 'group' ? resolvedEntity.idvk : undefined,
		});
		const info: VKs_Info = {
			idvk: resolvedEntity.idvk,
			type: resolvedEntity.type,
			name: resolvedEntity.name,
		};
		vks.push(vk);
		vks_info.push(info);
		configuredVks.push({ vk, info });
	} catch (error) {
		systemLogger(`Не удалось определить VK-сущность по токену: ${error}`);
	}
	return [vks, vks_info]
})).then(()=>{
	configuredVks.map(({ vk, info }) => {
		const logger = createLogger(info.name);
		//console.log(vks_info)
		//настройка
		vk.updates.use(async (context: Context, next) => {
			setContextLogger(context, logger);
			return next();
		});
		vk.updates.use(questionManager.middleware);
		vk.updates.on('message_new', hearManager.middleware);
		//регистрация роутов из других классов
		InitGameRoutes(hearManager)
		registerUserRoutes(hearManager)
		registerCommandRoutes(hearManager)
		//миддлевар для предварительной обработки сообщений
		vk.updates.on('message_new', async (context: Context, next) => {
			const incomingMessage = context.text;
			//модуль предобработки сообщений
			if (await Prefab_Engine(context)) {
				if (context.isOutbox == false && context.senderId > 0 && incomingMessage) {
					await Log_Incoming_Message(context, 'DENIED', incomingMessage);
				}
				return await next();
			}
			if (context.isOutbox == false && context.senderId > 0 && context.text) {
				//обрабатываем входящее сообщение
				//активация модулей класса анализаторов
				if (await Analyzer_Core_Edition(context)) {
					await Log_Incoming_Message(context, 'DENIED', incomingMessage);
					return await next();
				}
				await Log_Incoming_Message(context, 'ACCESS', incomingMessage || context.text);
				//запускаем режим печатания сообщения
				await context.setActivity();
				//ищем самый оптимальный вариант ответа на сообщение пользователя
				let res: { text: string; answer: string; info: string; status: boolean; } = await Answer_Core_Edition({ text: context.text, answer: '', info: '', status: false }, context, vk);
				if (!res.status) {
					if (res.info) { logWithContext(context, res.info); }
					return await next();
				}
				//сохраняем ответ пользователя для анализатора
				await prisma.user.update({ where: { idvk: context.senderId }, data: { say_me: res.answer.replace(/\r?\n|\r/g, "") } });
				//наконец добавили модуль для обработки всех этих %username% и прочей фигни=)
				res.answer = await Replacer_System_Params(res.answer, context);
				try {
					//отправляем оптимальный ответ пользователю
					if (context.isChat) { await context.reply(`${res.answer}`); } else { await context.send(`${res.answer}`); }
					logWithContext(context, res.info);
				} catch (e) {
					logWithContext(context, `Проблема отправки сообщения в чат: ${e}`);
				}
			}
			return await next();
		})
		vk.updates.on('wall_reply_new', async (context: Context, next: any) => {
			//событие отличается но подшаманим под классику жанра
			setContextLogger(context, logger);
			context.senderId = context.fromId
			const incomingMessage = context.text;
			//модуль предобработки сообщений
			if (await Prefab_Engine(context)) {
				if (context.fromId > 0 && incomingMessage) {
					await Log_Incoming_Message(context, 'DENIED', incomingMessage);
				}
				return await next()
			}
			if (context.fromId > 0 && context.text) {
				//обрабатываем входящее сообщение на стене
				//активация модулей класса анализаторов
				if (await Analyzer_Core_Edition(context)) {
					await Log_Incoming_Message(context, 'DENIED', incomingMessage);
					return await next()
				}
				await Log_Incoming_Message(context, 'ACCESS', incomingMessage || context.text);
				//ищем самый оптимальный вариант ответа на сообщение пользователя
				let res: { text: string, answer: string, info: string, status: boolean } = await Answer_Core_Edition({ text: context.text, answer: '', info: '', status: false }, context, vk)
				if (!res.status) {
					if (res.info) { logWithContext(context, res.info); }
					return await next()
				}
				//сохраняем ответ пользователя для анализатора
				await prisma.user.update({ where: { idvk: context.senderId }, data: { say_me: res.answer } })
				//наконец добавили модуль для обработки всех этих %username% и прочей фигни=)
				res.answer = await Replacer_System_Params(res.answer, context)
				try {
					if (context.isWallComment) {
						//отправляем оптимальный ответ пользователю на стене
						await vk.api.wall.createComment({owner_id: context.ownerId, post_id: context.objectId, reply_to_comment: context.id, guid: context.text, message: `${res.answer}`})
						logWithContext(context, res.info)
					}
				} catch (e) {
					logWithContext(context, `Проблема отправки сообщения в чат: ${e}`)
				}
			}
			return await next();
		})
		/*vk.updates.on('friend_request', async (context: any, next) => {
			logWithContext(context, `Получен запрос в друзья от пользователя ${context.payload?.user_id}`)
			const { user_id } = context.payload;
			try {
			  await context.api.friends.add({ user_id });
			  logWithContext(context, `Пользователь с id ${user_id} успешно добавлен в друзья`);
			} catch (error) {
			  logWithContext(context, `Не удалось добавить пользователя с id ${user_id} в друзья: ${error}`);
			}
		  
			return next();
		  });*/
		vk.updates.start().then(() => {
			const vkLink = info.type === 'group' ? `@club${info.idvk}` : `@id${info.idvk}`;
			logger(`Бот ${info.type} ${vkLink} успешно запущен и готов к эксплуатации!`)
			Answer_Offline(vk, logger).catch((error) => {
				logger(`Проблема считывания оффлайн сообщений: ${error}`);
			})
		}).catch((error) => {
			logger(`Проблема запуска VK updates: ${error}`);
		});
	})
})

//запуск автостатуса каждые 2 минут
setInterval(updateStatuses, 120000);

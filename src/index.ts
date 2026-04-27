import { Context, MessageContext, VK } from 'vk-io';
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
import { randomInt } from 'crypto';
import prisma from './module/prisma';
import { Prefab_Engine } from './engine/prefab/prefab_engine';
import { Replacer_System_Params } from './engine/reseacher/specializator';
import { Sleep } from './engine/helper';
import { Answer_Offline } from './engine/offline_answer';
dotenv.config();



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
	console.log(`Query ${params.model}.${params.action} took ${after - before}ms`)
	return result
})
*/


export interface VKs_Info {
	idvk: number,
	type: string
}
// Определяем тип сущности VK (страница или группа)
type VkEntityType = 'page' | 'group';

// Определяем тип объекта, содержащего информацию о Vk-сущности
type VkEntity = {
	token: string,
	idvk: number,
	type: VkEntityType
};

// Получаем данные обо всех Vk-сущностях из .env файла
const vkEntities: VkEntity[] = JSON.parse(String(process.env.VK_ENTITIES)) || '[]';
// Создаем объект VK для каждой Vk-сущности
export const vks: VK[] = [];
export const vks_info: VKs_Info[] = [];
async function Group_Id_Get(token: string) {
	const vk = new VK({ token: token, apiLimit: 1 });
	const [group] = await vk.api.groups.getById(vk);
	const groupId = group.id;
	return groupId
}
async function User_Id_Get(token: string) {
	const vk = new VK({ token: token, apiLimit: 1 });
	const [user] = await vk.api.users.get(vk);
	const groupId = user.id;
	return groupId
}
function Id_Getter(target: string, token: string) {
	const functions: any = {
		'group': Group_Id_Get,
		'page': User_Id_Get,
	};
	const commandHandler = functions[target];
	const res = commandHandler(token).then((data: any) => { return data })
	return res
}

Promise.all(vkEntities.map(async entity => {
	try {
		//let idvk = entity.type === 'group' ? Number((await Group_Id_Get(entity.token))) : Number(await User_Id_Get(entity.token))
		const idvk = await Id_Getter(entity.type, entity.token).then((data: any) => { return data })
		//console.log(idvk);
		// Авторизация
		const vk = new VK({
		  token: entity.token,
		  apiLimit: 1,
		  pollingGroupId: entity.type === 'group' ? idvk : undefined,
		});
		vks.push(vk);
		vks_info.push({ idvk: idvk, type: entity.type });
	} catch (error) {
		console.error(error);
	}
	return [vks, vks_info]
})).then(()=>{
	vks.map(vk => {
		//console.log(vks_info)
		//настройка
		vk.updates.use(questionManager.middleware);
		vk.updates.on('message_new', hearManager.middleware);
		//регистрация роутов из других классов
		InitGameRoutes(hearManager)
		registerUserRoutes(hearManager)
		registerCommandRoutes(hearManager)
		//миддлевар для предварительной обработки сообщений
		vk.updates.on('message_new', async (context: Context, next) => {
			//модуль предобработки сообщений
			if (await Prefab_Engine(context)) { return await next(); }
			if (context.isOutbox == false && context.senderId > 0 && context.text) {
				//обрабатываем входящее сообщение
				//активация модулей класса анализаторов
				if (await Analyzer_Core_Edition(context)) { return await next(); }
				//запускаем режим печатания сообщения
				await context.setActivity();
				//ищем самый оптимальный вариант ответа на сообщение пользователя
				let res: { text: string; answer: string; info: string; status: boolean; } = await Answer_Core_Edition({ text: context.text, answer: '', info: '', status: false }, context, vk);
				if (!res.status) { console.log(res.info); return await next(); }
				//сохраняем ответ пользователя для анализатора
				await prisma.user.update({ where: { idvk: context.senderId }, data: { say_me: res.answer.replace(/\r?\n|\r/g, "") } });
				//наконец добавили модуль для обработки всех этих %username% и прочей фигни=)
				res.answer = await Replacer_System_Params(res.answer, context);
				try {
					//отправляем оптимальный ответ пользователю
					if (context.isChat) { await context.reply(`${res.answer}`); } else { await context.send(`${res.answer}`); }
					console.log(res.info);
				} catch (e) {
					console.log(`Проблема отправки сообщения в чат: ${e}`);
				}
			}
			return await next();
		})
		vk.updates.on('wall_reply_new', async (context: Context, next: any) => {
			//событие отличается но подшаманим под классику жанра
			context.senderId = context.fromId
			//модуль предобработки сообщений
			if (await Prefab_Engine(context)) { return await next() }
			if (context.fromId > 0 && context.text) {
				//обрабатываем входящее сообщение на стене
				//активация модулей класса анализаторов
				if (await Analyzer_Core_Edition(context)) { return await next() }
				//ищем самый оптимальный вариант ответа на сообщение пользователя
				let res: { text: string, answer: string, info: string, status: boolean } = await Answer_Core_Edition({ text: context.text, answer: '', info: '', status: false }, context, vk)
				if (!res.status) { console.log(res.info); return await next() }
				//сохраняем ответ пользователя для анализатора
				await prisma.user.update({ where: { idvk: context.senderId }, data: { say_me: res.answer } })
				//наконец добавили модуль для обработки всех этих %username% и прочей фигни=)
				res.answer = await Replacer_System_Params(res.answer, context)
				try {
					if (context.isWallComment) {
						//отправляем оптимальный ответ пользователю на стене
						await vk.api.wall.createComment({owner_id: context.ownerId, post_id: context.objectId, reply_to_comment: context.id, guid: context.text, message: `${res.answer}`})
						console.log(res.info)
					}
				} catch (e) {
					console.log(`Проблема отправки сообщения в чат: ${e}`)
				}
			}
			return await next();
		})
		/*vk.updates.on('friend_request', async (context: any, next) => {
			console.log("🚀 ~ file: index.ts:132 ~ vk.updates.on ~ context:", context)
			const { user_id } = context.payload;
			try {
			  await context.api.friends.add({ user_id });
			  console.log(`Пользователь с id ${user_id} успешно добавлен в друзья`);
			} catch (error) {
			  console.error(`Не удалось добавить пользователя с id ${user_id} в друзья`, error);
			}
		  
			return next();
		  });*/
		vk.updates.start().then(() => {
			console.log('Бот успешно запущен и готов к эксплуатации!')
			Answer_Offline(vk).catch((error) => {
				console.log(`Проблема считывания оффлайн сообщений: ${error}`);
			})
		}).catch(console.log);
	})
})

//запуск автостатуса каждые 2 минут
setInterval(updateStatuses, 120000);

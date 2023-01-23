import { VK, Keyboard, IMessageContextSendOptions, ContextDefaultState, MessageContext, VKAppPayloadContext, KeyboardBuilder } from 'vk-io';
import { HearManager } from '@vk-io/hear';
import { PrismaClient } from '@prisma/client'
import {
    QuestionManager,
    IQuestionMessageContext
} from 'vk-io-question';
import { randomInt } from 'crypto';
import { timeStamp } from 'console';
import { registerUserRoutes } from './engine/player'
import { InitGameRoutes } from './engine/init';
import { send } from 'process';
import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
import { env } from 'process';

const translate = require('secret-package-for-my-own-use');
dotenv.config()

export const token: string = String(process.env.token)
export const root: number = Number(process.env.root) //root user
export const chat_id: number = Number(process.env.chat_id) //chat for logs
export const group_id: number = Number(process.env.group_id)//clear chat group
export const timer_text = { answerTimeLimit: 300_000 } // ожидать пять минут
export const answerTimeLimit = 300_000 // ожидать пять минут
//авторизация
export const vk = new VK({ token: token, /*pollingGroupId: group_id,*/ apiMode: "sequential", apiLimit: 1 });
//инициализация
const questionManager = new QuestionManager();
const hearManager = new HearManager<IQuestionMessageContext>();
export const prisma = new PrismaClient()

/*prisma.$use(async (params, next) => {
	console.log('This is middleware!')
	// Modify or interrogate params here
	console.log(params)
	return next(params)
})*/

//настройка
vk.updates.use(questionManager.middleware);
vk.updates.on('message_new', hearManager.middleware);

//регистрация роутов из других классов
InitGameRoutes(hearManager)
registerUserRoutes(hearManager)
function deleteDuplicate(a: any){a=a.toString().replace(/ /g,",");a=a.replace(/[ ]/g,"").split(",");for(var b: any =[],c=0;c<a.length;c++)-1==b.indexOf(a[c])&&b.push(a[c]);b=b.join(", ");return b=b.replace(/,/g," ")};
//миддлевар для предварительной обработки сообщений
vk.updates.on('message_new', async (context: any, next: any) => {
	if (context.isOutbox == false) {
		const data_old = Date.now()
        let count = 0
        let count_circle = 0
        const temp: Array<string> = context.text.toLowerCase().replace(/[^а-яА-Я ]/g, "").split(/(?:,| )+/)
		let ans: string = ''
		for (let j = 0; j < temp.length-1; j++) {
			const find_one = await prisma.word_Couple.findMany({ where: { name_word_first: temp[j].toLowerCase() }})
			console.log("🚀 ~ file: index.ts:55 ~ vk.updates.on ~ find_one", find_one)
			if (find_one.length >= 1) {
				ans += find_one.length > 1 ? `${find_one[randomInt(0, find_one.length)].name_word_first} ${find_one[randomInt(0, find_one.length)].name_word_second} ` : `${find_one[0].name_word_first} ${find_one[0].name_word_second} `
				count++
			}
			count_circle++
		}   
		const res = await translate(`${ans ? ans : "Я не понимаю"}`, { from: 'auto', to: 'en', autoCorrect: true });
		const fin = await translate(`${res.text ? res.text : "Я не понимаю"}`, { from: 'en', to: 'ru', autoCorrect: true });
		console.log(fin.text)
        context.send(`Получен ответ: ${deleteDuplicate(fin.text)}, Сложность: ${count_circle} Затраченно времени: ${(Date.now() - data_old)/1000} сек.`)
	}
	return next();
})
vk.updates.on('message_event', async (context: any, next: any) => { 
	//const data = await Book_Random_String('./src/book/tom1-7.txt')
	//context.answer({type: 'show_snackbar', text: `🔔 ${data.slice(0,80)}`})
	return next();
})

vk.updates.start().then(() => console.log('LongPool server up!')).catch(console.log);
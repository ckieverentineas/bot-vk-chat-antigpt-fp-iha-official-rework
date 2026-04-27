import { root } from "..";
import { Input_Message_Cleaner } from "./clear_input";
import { Sleep } from "./helper";
import { Direct_Search } from "./reseacher/reseach_direct_boost";
import Reseacher_New_Format from "./reseacher/reseacher_new_format";
import { VK } from "vk-io";
import { Logger } from "../module/logger";

async function Send_Message_Safely(vk: VK, peerId: number, message: string, logger: Logger): Promise<boolean> {
    try {
        await vk.api.messages.send({
            peer_id: peerId,
            random_id: 0,
            message,
        });
        return true;
    } catch (error) {
        logger(`Не удалось отправить сообщение peer_id ${peerId}: ${error}`);
        return false;
    }
}

export async function Answer_Offline(vk: VK, logger: Logger): Promise<void> {
    await Send_Message_Safely(vk, root, `Приступаем к считыванию оффлайн сообщений!`, logger);

    let messages;
    try {
        messages = await vk.api.messages.getConversations({
            filter: 'unread'
        });
    } catch (error) {
        logger(`Не удалось получить оффлайн сообщения: ${error}`);
        return;
    }
    
    const unreadMessages = messages.items;
    
    if (unreadMessages.length > 0) {
        for (const message of unreadMessages) {
            //console.log(message)
            if (message.last_message.text == '') { continue }
            await Sleep(Math.floor(Math.random() * (50000 - 10000 + 1)) + 10000)
            const peerId = message.conversation.peer.id;
            if (peerId < 0) { continue }
            const context = {
                senderId: message.conversation.peer.id,
                text: message.last_message.text
            }
            if (typeof context.text != 'string' || (typeof context.text == 'string' && context.text.length < 3) ) { continue }
            //модуль поиска с прямым вхождением 1 к 1-му
            const dataOld = Date.now();
            let res: { text: string; answer: string; info: string; status: boolean; } = { text: context.text, answer: '', info: '', status: false }
	        res = await Direct_Search(res, dataOld)
	        if (!res.status) {
                res = await Reseacher_New_Format(res, context, dataOld, vk)
            }
            //ищем самый оптимальный вариант ответа на сообщение пользователя
			
			if (!res.status) {
                if (res.info) { logger(res.info); }
                continue;
            }
			try {
				//отправляем оптимальный ответ пользователю
                // Отправляем ответное сообщение
                const answerWasSent = await Send_Message_Safely(
                    vk,
                    peerId,
                    `Привет я снова в сети, ты пишешь: ${Input_Message_Cleaner(message.last_message.text)}, мой ответ: ${res.answer}`,
                    logger
                );
				if (answerWasSent) { logger(res.info); }
			} catch (e) {
				logger(`Проблема отправки сообщения в чат: ${e}`);
			}
        }
    }
    await Send_Message_Safely(vk, root, `Закончили считывать оффлайн сообщений!`, logger);
}

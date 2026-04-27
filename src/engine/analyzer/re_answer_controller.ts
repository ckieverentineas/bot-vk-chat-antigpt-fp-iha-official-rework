import { Context } from "vk-io";
import { vks_info } from "../..";
import { logWithContext } from "../../module/logger";

export async function Re_Answer_controller(context: Context): Promise<boolean> {
    const ids = vks_info.map((info) => info.idvk);
    try {
        await context.loadMessagePayload();
    } catch (e) {
        logWithContext(context, `ВК послал нас нафиг, так и не подгрузив данные о сообщениях: ${e}`)
    }
    if (context.replyMessage || (context.forwards && context.forwards.length > 1)) {
        //console.log(`Ответ на сообщение бота. Идентификатор диалога: ${context.replyMessage.peerId}`);
        // Обработка ответа на сообщение бота
        //if ((context.replyMessage && context.replyMessage.senderId != bot_id) || (context.forwards > 1))
        if ( ( context.replyMessage && !ids.includes(Math.abs(context.replyMessage!.senderId)) ) || (context.forwards && context.forwards.length > 1)) {
            return true
        } else {
            //console.log(`Ответ на сообщение другого пользователя. Идентификатор диалога: ${context.replyMessage?.peerId}`);
            // Обработка ответа на сообщение другого пользователя
            return false
        }
    }
    return false
}

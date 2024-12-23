import { Context } from "vk-io";
import prisma from "../../module/prisma";
import Black_List_Engine from "./blacklist";

async function User_Registration(context: any) {
    const user: any = await prisma.user.findFirst({ where: { idvk: context.senderId } })
    if (!user) {
        try {
            const registration = await prisma.user.create({ data: { idvk: context.senderId}})
            console.log(`Зарегестрирован новый пользователь: ${registration.idvk}`)
        } catch (e) {
            console.log(`Возникла ошибка регистрации клиента: ${e}`)
        }
    }
}

export async function Prefab_Engine(context: Context) {
    //регистрация пользователя
    if (context.isOutbox == true) { return true; }
    //console.log(context)
    await User_Registration(context)
    //модуль игнорирования пользователей
    if (await User_ignore_Check(context)) { return true; }
    if (context.isWallComment) { console.log(`Пользователь ${context.senderId} прислал сообщение ${context.text} на стену группы`) } else { console.log(`Пользователь ${context.senderId} прислал сообщение ${context.text} в ${context.isChat ? "Беседу" : "Личные сообщения"}`) }
    //модуль обнаружения стикеров
    if (context.hasAttachments("sticker")) { context.text = 'стикер стикер стикер стикер' }
    //модуль блеклиста для стоп слов
    const data = await Black_List_Engine({ text: context.text, answer: '', info: '', status: false }, context)
    if (data.status) { return true }
    return false;
}

async function User_ignore_Check(context: any) {
    const user: any = await prisma.user.findFirst({ where: { idvk: context.senderId } })
    return user.ignore ? true : false
}

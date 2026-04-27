import prisma from "../../module/prisma"
import { logWithContext } from "../../module/logger"

async function User_Info(context: any) {
    let [userData] = await context.api.users.get({user_id: context.senderId});
    return userData
}

export async function Anti_Spam_Engine(context: any) {
    const info: any = await User_Info(context)
    const user: any = await prisma.user.findFirst({ where: { idvk: context.senderId } })
    const now: number = new Date().getTime()
    const update: number = user.update.getTime()
    const interval: number = now - update

    if (interval < 12000) {
        const login = await prisma.user.update({ where: { idvk: context.senderId }, data: { count: { increment: 1 } } })
        if (user.count >= 3) {
            const login = await prisma.user.update({ where: { idvk: context.senderId }, data: { warning: { increment: 1 }, count: 0 } })
            await context.send(`@id${context.senderId}(${info.first_name}), не спамьте, а то будете проигнорированы в дальнейшем.`)
            logWithContext(context, `Пользователь добавлен в игнор: ${context.senderId}`)
            if (user.warning < 2) {
                await context.send(user.warning === 0 ? `@id${context.senderId}(${info.first_name}), не отправляйте сообщения настолько часто.` : `@id${context.senderId}(${info.first_name}), не спамьте, а то будете проигнорированы в дальнейшем.`);
                logWithContext(context, `Пользователь добавлен в лист игнора: ${login.idvk}`);
            } else {
                const login = await prisma.user.update({ where: { idvk: context.senderId }, data: { ignore: true, warning: 0 } });
                await context.send(`@id${context.senderId}(${info.first_name}), c idvk ${context.senderId} я с тобой больше не разговариваю.`);
                logWithContext(context, `Пользователь добавлен в лист игнора: ${login.idvk}`);
            }
            return true;
        }
    } else {
        await prisma.user.update({ where: { idvk: context.senderId }, data: { count: 0, update: new Date() } })
    }
    return false
}

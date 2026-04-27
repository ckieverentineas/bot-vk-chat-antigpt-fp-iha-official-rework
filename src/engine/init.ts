import { HearManager } from "@vk-io/hear";
import { IQuestionMessageContext } from "vk-io-question";

export function InitGameRoutes(hearManager: HearManager<IQuestionMessageContext>): void {
	/*hearManager.hear(/init/, async (context: any) => {
		await prisma.role.create({
			data: {
				name: 'user'
			}
		})
		await prisma.role.create({
			data: {
				name: 'admin'
			}
		})
		context.send('Игра инициализированна успешно.')
	})*/
}

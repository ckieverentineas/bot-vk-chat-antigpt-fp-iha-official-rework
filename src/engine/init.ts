import { HearManager } from "@vk-io/hear";
import { QuestionMessageContext } from "../module/question_flow";

export function InitGameRoutes(hearManager: HearManager<QuestionMessageContext>): void {
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

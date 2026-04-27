import { vks_info } from "../..";
import { logWithContext } from "../../module/logger";

export async function Answer_Alive_Bot_Detector(context: any): Promise<boolean> {
    const configuredBotMemberIds = vks_info.map((info) => {
        return info.type === 'group' ? -info.idvk : info.idvk;
    });

    try {
        const members = await context.api.messages.getConversationMembers({
            peer_id: context.peerId,
        });
        const memberIds = members.items.map((member: { member_id: number }) => member.member_id);
        const activeBotIds = memberIds.filter((memberId: number) => configuredBotMemberIds.includes(memberId));

        return activeBotIds.length > 1;
    } catch (error) {
        logWithContext(context, `Не удалось проверить наличие своих ботов в беседе: ${error}`);
        return false;
    }
}

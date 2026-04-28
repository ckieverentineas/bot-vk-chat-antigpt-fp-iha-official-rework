import { Context } from 'vk-io';
import prisma from './prisma';

export interface ChatContextLike {
    readonly isChat?: boolean;
    readonly peerId?: number;
    readonly [key: string]: unknown;
}

export interface IgnoredChatToggleResult {
    readonly peerId: number;
    readonly ignored: boolean;
}

export function parseIgnoredChatCommand(text: string): boolean {
    return /^!игнор\s+(?:беседа|чат)$/i.test(text.trim());
}

export function getChatPeerId(context: ChatContextLike): number | undefined {
    if (!context.isChat || typeof context.peerId !== 'number') {
        return undefined;
    }

    return context.peerId;
}

export async function isChatIgnored(peerId: number): Promise<boolean> {
    const ignoredChat = await prisma.ignoredChat.findUnique({
        where: { peerId: BigInt(peerId) },
        select: { ignored: true },
    });

    return ignoredChat?.ignored ?? false;
}

export async function isContextChatIgnored(context: ChatContextLike): Promise<boolean> {
    const peerId = getChatPeerId(context);

    if (peerId === undefined) {
        return false;
    }

    return isChatIgnored(peerId);
}

export async function toggleIgnoredChat(params: {
    readonly peerId: number;
    readonly title?: string;
    readonly createdByIdvk?: number;
    readonly reason?: string;
}): Promise<IgnoredChatToggleResult> {
    const existingChat = await prisma.ignoredChat.findUnique({
        where: { peerId: BigInt(params.peerId) },
    });
    const nextIgnoredState = !(existingChat?.ignored ?? false);

    const ignoredChat = existingChat
        ? await prisma.ignoredChat.update({
            where: { peerId: BigInt(params.peerId) },
            data: {
                ignored: nextIgnoredState,
                title: params.title ?? existingChat.title,
                reason: params.reason ?? existingChat.reason,
                createdByIdvk: params.createdByIdvk ?? existingChat.createdByIdvk,
            },
        })
        : await prisma.ignoredChat.create({
            data: {
                peerId: BigInt(params.peerId),
                title: params.title ?? '',
                ignored: true,
                createdByIdvk: params.createdByIdvk,
                reason: params.reason ?? '',
            },
        });

    return {
        peerId: Number(ignoredChat.peerId),
        ignored: ignoredChat.ignored,
    };
}

export function formatIgnoredChatToggleMessage(result: IgnoredChatToggleResult): string {
    return result.ignored
        ? `Беседа ${result.peerId} добавлена в игнор.`
        : `Беседа ${result.peerId} убрана из игнора.`;
}

export function getIgnoredChatTitle(context: Context): string {
    return `Беседа ${context.peerId}`;
}

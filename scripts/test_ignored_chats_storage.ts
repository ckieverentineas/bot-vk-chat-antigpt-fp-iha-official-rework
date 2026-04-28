import prisma from '../src/module/prisma';
import { isChatIgnored, toggleIgnoredChat } from '../src/module/ignored_chats';

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

async function run(): Promise<void> {
    const peerId = 2999999999;
    const previousChat = await prisma.ignoredChat.findUnique({ where: { peerId: BigInt(peerId) } });

    try {
        await prisma.ignoredChat.deleteMany({ where: { peerId: BigInt(peerId) } });

        assertEqual(await isChatIgnored(peerId), false, 'Unknown chat should not be ignored');

        const ignoredChat = await toggleIgnoredChat({
            peerId,
            title: 'Тестовая беседа',
            createdByIdvk: 123,
            reason: 'test',
        });

        assertEqual(ignoredChat.ignored, true, 'First toggle should enable chat ignore');
        assertEqual(await isChatIgnored(peerId), true, 'Enabled chat ignore should be persisted');

        const restoredChat = await toggleIgnoredChat({ peerId });

        assertEqual(restoredChat.ignored, false, 'Second toggle should disable chat ignore');
        assertEqual(await isChatIgnored(peerId), false, 'Disabled chat ignore should be persisted');
    } finally {
        await prisma.ignoredChat.deleteMany({ where: { peerId: BigInt(peerId) } });

        if (previousChat) {
            await prisma.ignoredChat.create({
                data: {
                    peerId: previousChat.peerId,
                    title: previousChat.title,
                    ignored: previousChat.ignored,
                    createdByIdvk: previousChat.createdByIdvk,
                    reason: previousChat.reason,
                    createdAt: previousChat.createdAt,
                },
            });
        }
    }
}

run()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

import {
    formatIgnoredChatToggleMessage,
    getChatPeerId,
    parseIgnoredChatCommand,
} from '../src/module/ignored_chats';

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

assertEqual(parseIgnoredChatCommand('!игнор беседа'), true, 'Current chat ignore command should be detected');
assertEqual(parseIgnoredChatCommand('!игнор чат'), true, 'Current chat ignore alias should be detected');
assertEqual(parseIgnoredChatCommand('!игнор 123456'), false, 'User ignore command should stay separate');
assertEqual(parseIgnoredChatCommand('!скажи игнор чат'), false, 'Other commands should not be detected');

assertEqual(
    getChatPeerId({ isChat: true, peerId: 2000000123 }),
    2000000123,
    'Chat peer id should be returned for chat contexts',
);

assertEqual(
    getChatPeerId({ isChat: false, peerId: 2000000123 }),
    undefined,
    'Private messages should not have chat peer id',
);

assertEqual(
    formatIgnoredChatToggleMessage({ peerId: 2000000123, ignored: true }),
    'Беседа 2000000123 добавлена в игнор.',
    'Enable message should be clear',
);

assertEqual(
    formatIgnoredChatToggleMessage({ peerId: 2000000123, ignored: false }),
    'Беседа 2000000123 убрана из игнора.',
    'Disable message should be clear',
);

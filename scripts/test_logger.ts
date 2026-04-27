import {
    formatLogField,
    formatIncomingMessageLog,
    formatLogMessage,
    formatLogSections,
    formatSearchTitle,
    formatLogText,
    getContextLogger,
    Logger,
    logWithContext,
    setContextLogger,
} from '../src/module/logger';

function assertEqual(actual: string, expected: string, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

function assertSame<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(message);
    }
}

const date = new Date('2026-04-27T10:20:30.000Z');
const formattedMessage = formatLogMessage({
    projectName: 'Magomir Central Bank',
    text: 'Бот запущен',
    date,
});

assertEqual(
    formattedMessage,
    `[Magomir Central Bank] --> Бот запущен <-- (${date.toLocaleString('ru')})`,
    'Logger message format changed',
);

const messages: string[] = [];
const logger: Logger = (text: string): void => {
    messages.push(text);
};
const context = {};

setContextLogger(context, logger);
logWithContext(context, 'Сообщение из контекста');

assertEqual(messages[0], 'Сообщение из контекста', 'Context logger did not receive the message');
assertSame(getContextLogger(context), logger, 'Context logger was not stored');

const longText = 'abcdefghijklmnopqrstuvwxyz0123456789';
assertEqual(
    formatLogText(longText, { maxLength: 20, edgeLength: 5 }),
    'abcde ... (+26 симв.) ... 56789',
    'Long log text was not shortened with beginning and ending preserved',
);

assertEqual(
    formatLogField('Параметр на русском', longText, { maxLength: 20, edgeLength: 5 }),
    '- Параметр на русском: [abcde ... (+26 симв.) ... 56789]',
    'Log field format changed',
);

assertEqual(
    formatLogSections('(V) MultiBoost~', [
        [
            { label: 'Сгенерирован ответ', value: '29073 <-- на одном дыхании' },
            { label: 'Исправление ошибок', value: '29073 --> вопрос' },
            { label: 'Найдено вариантов: [18], затрачено времени', value: '28.242 сек.' },
        ],
    ], 'FINISH'),
    '(V) MultiBoost~\n- Сгенерирован ответ: [29073 <-- на одном дыхании]\n- Исправление ошибок: [29073 --> вопрос]\n- Найдено вариантов: [18], затрачено времени: [28.242 сек.]\n[FINISH]',
    'Log sections format changed',
);

assertEqual(
    formatIncomingMessageLog({
        senderId: 463031671,
        senderName: 'Имя пользователя',
        channel: 'Личные сообщения',
        message: 'Ты ии?',
        decision: 'ACCESS',
    }),
    '{idvk463031671}\n- Получено сообщение от: [Имя пользователя]\n- Канал: [Личные сообщения]\n- Сообщение: [Ты ии?]\n[ACCESS]',
    'Incoming message log format changed',
);

assertEqual(formatSearchTitle('MultiBoost~', true), '(V) MultiBoost~', 'Success search title changed');
assertEqual(formatSearchTitle('MultiBoost~', false), '(X) MultiBoost~', 'Failure search title changed');

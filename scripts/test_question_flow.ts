import { QuestionFlowManager, QuestionMessageContext, createQuestionSessionKey } from '../src/module/question_flow';

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

function assertTrue(value: boolean, message: string): void {
    if (!value) {
        throw new Error(message);
    }
}

interface SentMessage {
    text: string | object,
    params?: object,
}

function createMessageContext(params: {
    senderId: number,
    peerId: number,
    text: string,
}): QuestionMessageContext & { sent: SentMessage[] } {
    const sent: SentMessage[] = [];

    return {
        senderId: params.senderId,
        peerId: params.peerId,
        text: params.text,
        forwards: null,
        messagePayload: undefined,
        attachments: [],
        sent,
        is(types: readonly string[]): boolean {
            return types.includes('message');
        },
        async send(text: string | object, sendParams?: object): Promise<QuestionMessageContext> {
            sent.push({ text, params: sendParams });
            return this as QuestionMessageContext;
        },
    } as unknown as QuestionMessageContext & { sent: SentMessage[] };
}

assertEqual(
    createQuestionSessionKey(createMessageContext({ senderId: 10, peerId: 200, text: 'ping' })),
    '200:10',
    'Question key should include dialog and sender identifiers',
);

async function main(): Promise<void> {
    const manager = new QuestionFlowManager();
    const promptContext = createMessageContext({ senderId: 10, peerId: 200, text: '!обучение' });
    let promptNextCalls = 0;

    await manager.middleware(promptContext, async () => {
        promptNextCalls += 1;
    });

    const questionPromise = promptContext.question('Проверочный вопрос');
    await Promise.resolve();

    assertEqual(promptNextCalls, 1, 'Initial command should continue through middleware');
    assertEqual(promptContext.sent.length, 1, 'question() should send the prompt');
    assertEqual(promptContext.sent[0].text, 'Проверочный вопрос', 'question() should send provided text');

    const otherDialogContext = createMessageContext({ senderId: 10, peerId: 201, text: 'не тот чат' });
    let otherDialogNextCalls = 0;

    await manager.middleware(otherDialogContext, async () => {
        otherDialogNextCalls += 1;
    });

    assertEqual(otherDialogNextCalls, 1, 'Answer from another dialog should not close active question');

    const answerContext = createMessageContext({ senderId: 10, peerId: 200, text: 'правильный ответ' });
    let answerNextCalls = 0;

    await manager.middleware(answerContext, async () => {
        answerNextCalls += 1;
    });

    const answer = await questionPromise;

    assertEqual(answer.text, 'правильный ответ', 'Question should resolve with answer text');
    assertEqual(answerNextCalls, 0, 'Answer message should not continue to regular handlers');
    assertTrue(answer.duration >= 0, 'Answer should include response duration');

    const waitContext = createMessageContext({ senderId: 11, peerId: 300, text: '!картинка' });
    await manager.middleware(waitContext, async () => undefined);

    const waitPromise = waitContext.waitQuestion();
    await Promise.resolve();

    assertEqual(waitContext.sent.length, 0, 'waitQuestion() should wait without sending an extra prompt');

    const waitAnswerContext = createMessageContext({ senderId: 11, peerId: 300, text: 'ответ на картинку' });
    await manager.middleware(waitAnswerContext, async () => undefined);

    const waitAnswer = await waitPromise;

    assertEqual(waitAnswer.text, 'ответ на картинку', 'waitQuestion() should resolve the next matching answer');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

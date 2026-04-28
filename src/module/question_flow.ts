import {
    Attachment,
    ExternalAttachment,
    MessageContext,
    MessageForwardsCollection,
    Params,
} from 'vk-io';

export interface QuestionManagerOptions {
    readonly answerTimeLimit?: number;
}

export interface QuestionWaitParams {
    readonly targetUserId?: number;
    readonly answerTimeLimit?: number;
}

export interface QuestionParams extends Params.MessagesSendParams, QuestionWaitParams {}

export class QuestionAnswer {
    public readonly text: string | null;
    public readonly forwards: MessageForwardsCollection | null;
    public readonly payload: unknown;
    public readonly attachments: ReadonlyArray<Attachment<object> | ExternalAttachment<object>> | null;
    public readonly duration: number;
    public readonly createdAt: number;
    public readonly isTimeout: boolean;

    public constructor(params: {
        readonly text: string | null,
        readonly forwards: MessageForwardsCollection | null,
        readonly payload: unknown,
        readonly attachments: ReadonlyArray<Attachment<object> | ExternalAttachment<object>> | null,
        readonly duration: number,
        readonly isTimeout?: boolean,
    }) {
        this.text = params.text;
        this.forwards = params.forwards;
        this.payload = params.payload;
        this.attachments = params.attachments;
        this.duration = params.duration;
        this.createdAt = Date.now();
        this.isTimeout = params.isTimeout ?? false;
    }

    public get [Symbol.toStringTag](): string {
        return this.constructor.name;
    }
}

export interface QuestionMessageContext extends MessageContext {
    question(message: string, params?: QuestionParams): Promise<QuestionAnswer>;
    waitQuestion(params?: QuestionWaitParams): Promise<QuestionAnswer>;
}

type MiddlewareNext = () => Promise<unknown>;
type QuestionMiddleware = (context: QuestionMessageContext, next: MiddlewareNext) => Promise<void>;

interface PendingQuestion {
    readonly resolve: (answer: QuestionAnswer) => void;
    readonly startTime: number;
}

export function createQuestionSessionKey(
    context: Pick<QuestionMessageContext, 'peerId' | 'senderId'>,
    targetUserId: number = context.senderId,
): string {
    return `${context.peerId}:${targetUserId}`;
}

function splitQuestionParams(params: QuestionParams): {
    readonly waitParams: QuestionWaitParams,
    readonly sendParams: Params.MessagesSendParams,
} {
    const { answerTimeLimit, targetUserId, ...sendParams } = params;

    return {
        waitParams: { answerTimeLimit, targetUserId },
        sendParams,
    };
}

export class QuestionFlowManager {
    private readonly pendingQuestions = new Map<string, PendingQuestion>();
    private readonly timeouts = new Map<string, NodeJS.Timeout>();
    private readonly answerTimeLimit: number;

    public constructor(options: QuestionManagerOptions = {}) {
        this.answerTimeLimit = options.answerTimeLimit ?? 0;
    }

    public get [Symbol.toStringTag](): string {
        return this.constructor.name;
    }

    public readonly middleware: QuestionMiddleware = async (context, next) => {
        if (!context.is(['message'])) {
            await next();
            return;
        }

        const sessionKey = createQuestionSessionKey(context);
        const pendingQuestion = this.pendingQuestions.get(sessionKey);

        if (pendingQuestion) {
            this.resolveQuestion(sessionKey, this.createAnswer(context, pendingQuestion));
            return;
        }

        context.waitQuestion = (params: QuestionWaitParams = {}) => this.waitQuestion(context, params);
        context.question = async (message: string, params: QuestionParams = {}) => {
            if (!message) {
                throw new TypeError('Parameter `message` is required');
            }

            const { waitParams, sendParams } = splitQuestionParams(params);
            await context.send(message, sendParams);

            return this.waitQuestion(context, waitParams);
        };

        await next();
    };

    private waitQuestion(context: QuestionMessageContext, params: QuestionWaitParams): Promise<QuestionAnswer> {
        const sessionKey = createQuestionSessionKey(context, params.targetUserId);
        const answerTimeLimit = params.answerTimeLimit ?? this.answerTimeLimit;

        this.clearTimeout(sessionKey);

        return new Promise((resolve) => {
            this.pendingQuestions.set(sessionKey, {
                resolve,
                startTime: Date.now(),
            });

            if (answerTimeLimit > 0) {
                this.timeouts.set(sessionKey, setTimeout(() => {
                    const pendingQuestion = this.pendingQuestions.get(sessionKey);

                    if (!pendingQuestion) {
                        this.clearTimeout(sessionKey);
                        return;
                    }

                    this.resolveQuestion(sessionKey, new QuestionAnswer({
                        text: null,
                        forwards: null,
                        payload: null,
                        attachments: null,
                        duration: Date.now() - pendingQuestion.startTime,
                        isTimeout: true,
                    }));
                }, answerTimeLimit));
            }
        });
    }

    private createAnswer(context: QuestionMessageContext, pendingQuestion: PendingQuestion): QuestionAnswer {
        return new QuestionAnswer({
            text: context.text ?? null,
            forwards: context.forwards ?? null,
            payload: context.messagePayload,
            attachments: context.attachments ?? null,
            duration: Date.now() - pendingQuestion.startTime,
        });
    }

    private resolveQuestion(sessionKey: string, answer: QuestionAnswer): void {
        const pendingQuestion = this.pendingQuestions.get(sessionKey);

        if (!pendingQuestion) {
            return;
        }

        pendingQuestion.resolve(answer);
        this.pendingQuestions.delete(sessionKey);
        this.clearTimeout(sessionKey);
    }

    private clearTimeout(sessionKey: string): void {
        const timeout = this.timeouts.get(sessionKey);

        if (!timeout) {
            return;
        }

        clearTimeout(timeout);
        this.timeouts.delete(sessionKey);
    }
}

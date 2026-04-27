export type Logger = (text: string) => void;

const defaultLogger = createLogger('vk-chat-bot');
const contextLoggerKey = '__vkChatBotLogger';

export interface LogMessageParams {
    readonly projectName: string;
    readonly text: string;
    readonly date?: Date;
}

export interface LogTextOptions {
    readonly maxLength?: number;
    readonly edgeLength?: number;
}

export interface LogField {
    readonly label: string;
    readonly value: unknown;
    readonly options?: LogTextOptions;
}

export interface IncomingMessageLogParams {
    readonly senderId: number;
    readonly senderName: string;
    readonly channel: string;
    readonly message: unknown;
    readonly decision?: 'ACCESS' | 'DENIED' | 'LOADING';
}

type ContextWithLogger = Record<typeof contextLoggerKey, Logger>;

export function createLogger(projectName: string): Logger {
    return (text: string): void => {
        console.log(`${formatLogMessage({ projectName, text })}\n`);
    };
}

export function formatLogMessage(params: LogMessageParams): string {
    const date = params.date ?? new Date();

    return `[${params.projectName}] --> ${params.text} <-- (${date.toLocaleString('ru')})`;
}

export function setContextLogger(context: unknown, logger: Logger): void {
    if (!canStoreLogger(context)) {
        return;
    }

    Object.defineProperty(context, contextLoggerKey, {
        configurable: true,
        enumerable: false,
        value: logger,
        writable: true,
    });
}

export function getContextLogger(context: unknown): Logger {
    if (!canStoreLogger(context)) {
        return defaultLogger;
    }

    return (context as Partial<ContextWithLogger>)[contextLoggerKey] ?? defaultLogger;
}

export function logWithContext(context: unknown, text: string): void {
    getContextLogger(context)(text);
}

export function formatLogFields(fields: readonly LogField[]): string {
    return `\n${fields.map(field => formatLogField(field.label, field.value, field.options)).join('\n')}\n`;
}

export function formatLogSections(title: string, sections: readonly (readonly LogField[])[], footer?: string): string {
    const formattedSections = sections
        .map(section => section.map(field => formatLogField(field.label, field.value, field.options)).join('\n'))
        .join('\n\n');
    const formattedFooter = footer ? `\n[${formatLogText(footer)}]` : '';

    return `${formatLogText(title)}\n${formattedSections}${formattedFooter}`;
}

export function formatIncomingMessageLog(params: IncomingMessageLogParams): string {
    return formatLogSections(`{idvk${params.senderId}}`, [
        compactLogFields([
            { label: 'Получено сообщение от', value: params.senderName },
            { label: 'Канал', value: params.channel },
            { label: 'Сообщение', value: params.message },
        ]),
    ], params.decision);
}

export function formatLogField(label: string, value: unknown, options: LogTextOptions = {}): string {
    return `- ${label}: [${formatLogText(value, options)}]`;
}

export function formatSearchTitle(engine: string, status: boolean): string {
    return `(${status ? 'V' : 'X'}) ${engine}`;
}

export function formatLogText(value: unknown, options: LogTextOptions = {}): string {
    const text = normalizeLogText(value);
    const maxLength = options.maxLength ?? 320;

    if (text.length <= maxLength) {
        return text;
    }

    const edgeLength = Math.max(1, options.edgeLength ?? 90);
    const safeEdgeLength = Math.min(edgeLength, Math.floor((text.length - 1) / 2));
    const hiddenLength = text.length - safeEdgeLength * 2;

    return `${text.slice(0, safeEdgeLength)} ... (+${hiddenLength} симв.) ... ${text.slice(-safeEdgeLength)}`;
}

function canStoreLogger(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function normalizeLogText(value: unknown): string {
    if (value instanceof Error) {
        return collapseWhitespace(value.stack ?? value.message);
    }

    return collapseWhitespace(String(value));
}

function collapseWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function compactLogFields(fields: readonly (LogField | undefined)[]): LogField[] {
    return fields.filter((field): field is LogField => field !== undefined);
}

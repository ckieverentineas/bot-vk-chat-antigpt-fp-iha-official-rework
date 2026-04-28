import { Logger } from '../module/logger';

export interface ImportProgressMessageParams {
    readonly title: string;
    readonly fileName: string;
    readonly formatLabel: string;
    readonly processedQuestions: number;
    readonly totalQuestions: number;
    readonly parsedAnswers: number;
    readonly createdQuestions: number;
    readonly existingQuestions: number;
    readonly createdAnswers: number;
    readonly existingAnswers: number;
    readonly skippedLines: number;
}

export interface ImportProgressReporterOptions {
    readonly logger: Logger;
    readonly sendMessage: (message: string) => Promise<void>;
    readonly logIntervalMs?: number;
    readonly messageIntervalMs?: number;
    readonly now?: () => number;
}

export interface ImportProgressReportOptions {
    readonly forceLog?: boolean;
    readonly forceMessage?: boolean;
}

export class ImportProgressReporter {
    private readonly logger: Logger;
    private readonly sendMessage: (message: string) => Promise<void>;
    private readonly logIntervalMs: number;
    private readonly messageIntervalMs: number;
    private readonly now: () => number;
    private lastLogAt: number;
    private lastMessageAt: number;

    public constructor(options: ImportProgressReporterOptions) {
        this.logger = options.logger;
        this.sendMessage = options.sendMessage;
        this.logIntervalMs = options.logIntervalMs ?? 10000;
        this.messageIntervalMs = options.messageIntervalMs ?? 60000;
        this.now = options.now ?? Date.now;
        this.lastLogAt = this.now();
        this.lastMessageAt = this.now();
    }

    public async report(params: ImportProgressMessageParams, options: ImportProgressReportOptions = {}): Promise<void> {
        const currentTime = this.now();
        const message = formatImportProgressMessage(params);

        if (options.forceLog || shouldReportProgress(this.lastLogAt, currentTime, this.logIntervalMs)) {
            this.logger(message);
            this.lastLogAt = currentTime;
        }

        if (options.forceMessage || shouldReportProgress(this.lastMessageAt, currentTime, this.messageIntervalMs)) {
            await this.sendProgressMessage(message);
            this.lastMessageAt = currentTime;
        }
    }

    private async sendProgressMessage(message: string): Promise<void> {
        try {
            await this.sendMessage(message);
        } catch (error) {
            this.logger(`Не удалось отправить прогресс загрузки базы: ${error}`);
        }
    }
}

export function shouldReportProgress(previousReportAt: number, currentTime: number, intervalMs: number): boolean {
    return currentTime - previousReportAt >= intervalMs;
}

export function formatImportProgressMessage(params: ImportProgressMessageParams): string {
    return [
        params.title,
        `Файл: ${params.fileName}`,
        `Формат: ${params.formatLabel}`,
        `Прогресс: ${formatProgressPercent(params.processedQuestions, params.totalQuestions)} (${params.processedQuestions}/${params.totalQuestions})`,
        `Ответов в файле: ${params.parsedAnswers}`,
        `Добавлено вопросов: ${params.createdQuestions}`,
        `Уже было вопросов: ${params.existingQuestions}`,
        `Добавлено ответов: ${params.createdAnswers}`,
        `Уже было ответов: ${params.existingAnswers}`,
        `Пропущено строк: ${params.skippedLines}`,
    ].join('\n');
}

function formatProgressPercent(processedQuestions: number, totalQuestions: number): string {
    if (totalQuestions <= 0) {
        return '0.0%';
    }

    return `${((processedQuestions / totalQuestions) * 100).toFixed(1)}%`;
}

export type QuestionAnswerImportFormat = 'modern-block' | 'iha-legacy';

export interface QuestionAnswerEntry {
    readonly question: string;
    readonly answers: readonly string[];
    readonly priority?: number;
}

export interface QuestionAnswerParseResult {
    readonly format: QuestionAnswerImportFormat;
    readonly entries: readonly QuestionAnswerEntry[];
    readonly skippedLines: number;
}

interface LegacyLine {
    readonly question: string;
    readonly answer: string;
    readonly priority: number;
}

export interface ModernBlockLineResult {
    readonly entry?: QuestionAnswerEntry;
    readonly skippedLine?: boolean;
}

export function parseQuestionAnswerText(text: string): QuestionAnswerParseResult {
    const lines = splitLines(removeUtfBom(text));
    const format = detectQuestionAnswerFormat(lines);

    if (format === 'iha-legacy') {
        return parseLegacyIhaLines(lines);
    }

    return parseModernBlockLines(lines);
}

export function detectQuestionAnswerFormat(lines: readonly string[]): QuestionAnswerImportFormat {
    const meaningfulLines = lines.filter(line => line.trim().length > 0);

    if (meaningfulLines.some(isModernMarkerLine)) {
        return 'modern-block';
    }

    const legacyLineCount = meaningfulLines.filter(line => parseLegacyLine(line) !== undefined).length;
    const minimumLegacyLineCount = Math.max(1, Math.ceil(meaningfulLines.length * 0.6));

    return legacyLineCount >= minimumLegacyLineCount ? 'iha-legacy' : 'modern-block';
}

function parseLegacyIhaLines(lines: readonly string[]): QuestionAnswerParseResult {
    const entries: QuestionAnswerEntry[] = [];
    let skippedLines = 0;

    for (const line of lines) {
        if (line.trim().length === 0) {
            continue;
        }

        const legacyLine = parseLegacyLine(line);

        if (legacyLine === undefined) {
            skippedLines++;
            continue;
        }

        entries.push({
            question: legacyLine.question,
            answers: [legacyLine.answer],
            priority: legacyLine.priority,
        });
    }

    return {
        format: 'iha-legacy',
        entries,
        skippedLines,
    };
}

export function parseLegacyQuestionAnswerLine(line: string): QuestionAnswerEntry | undefined {
    const legacyLine = parseLegacyLine(line);

    if (legacyLine === undefined) {
        return undefined;
    }

    return {
        question: legacyLine.question,
        answers: [legacyLine.answer],
        priority: legacyLine.priority,
    };
}

function parseLegacyLine(line: string): LegacyLine | undefined {
    const normalizedLine = removeUtfBom(line).trim();
    const priorityMatch = normalizedLine.match(/\\(\d+)\s*$/);

    if (priorityMatch === null || priorityMatch.index === undefined) {
        return undefined;
    }

    const questionAndAnswer = normalizedLine.slice(0, priorityMatch.index);
    const separatorIndex = questionAndAnswer.indexOf('\\');

    if (separatorIndex <= 0 || separatorIndex === questionAndAnswer.length - 1) {
        return undefined;
    }

    const question = questionAndAnswer.slice(0, separatorIndex).trim();
    const answer = questionAndAnswer.slice(separatorIndex + 1).trim();

    if (question.length === 0 || answer.length === 0) {
        return undefined;
    }

    return {
        question,
        answer,
        priority: Number(priorityMatch[1]),
    };
}

function parseModernBlockLines(lines: readonly string[]): QuestionAnswerParseResult {
    const entries: QuestionAnswerEntry[] = [];
    const parser = new ModernBlockLineParser();
    let skippedLines = 0;

    for (const line of lines) {
        const result = parser.pushLine(line);

        if (result.entry !== undefined) {
            entries.push(result.entry);
        }

        if (result.skippedLine) {
            skippedLines++;
        }
    }

    const finalEntry = parser.flush();

    if (finalEntry !== undefined) {
        entries.push(finalEntry);
    }

    return {
        format: 'modern-block',
        entries,
        skippedLines,
    };
}

export class ModernBlockLineParser {
    private currentQuestion: string | undefined;
    private currentAnswers: string[] = [];

    public pushLine(line: string): ModernBlockLineResult {
        const normalizedLine = removeUtfBom(line);

        if (normalizedLine.trim().length === 0) {
            return { entry: this.flush() };
        }

        if (isQuestionLine(normalizedLine)) {
            const entry = this.flush();
            this.currentQuestion = cleanQuestionLine(normalizedLine);
            this.currentAnswers = [];
            return { entry };
        }

        if (isAnswerLine(normalizedLine)) {
            if (this.currentQuestion === undefined) {
                return { skippedLine: true };
            }

            this.currentAnswers.push(cleanAnswerLine(normalizedLine));
            return {};
        }

        if (this.currentQuestion === undefined) {
            this.currentQuestion = normalizedLine.trim();
            return {};
        }

        this.currentAnswers.push(normalizedLine.trim());
        return {};
    }

    public flush(): QuestionAnswerEntry | undefined {
        const normalizedQuestion = this.currentQuestion?.trim();

        if (!normalizedQuestion) {
            this.reset();
            return undefined;
        }

        const entry: QuestionAnswerEntry = {
            question: normalizedQuestion,
            answers: this.currentAnswers.map(answer => answer.trim()).filter(answer => answer.length > 0),
        };

        this.reset();
        return entry;
    }

    private reset(): void {
        this.currentQuestion = undefined;
        this.currentAnswers = [];
    }
}

function splitLines(text: string): string[] {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function removeUtfBom(text: string): string {
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function isModernMarkerLine(line: string): boolean {
    return isQuestionLine(line) || isAnswerLine(line);
}

function isQuestionLine(line: string): boolean {
    return line.trimStart().startsWith('<~');
}

function isAnswerLine(line: string): boolean {
    return line.trimStart().startsWith('~>');
}

function cleanQuestionLine(line: string): string {
    return line.trimStart().slice(2).trim();
}

function cleanAnswerLine(line: string): string {
    return line.trimStart().slice(2).trim();
}

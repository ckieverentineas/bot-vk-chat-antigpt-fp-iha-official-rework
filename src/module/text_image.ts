import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';
import * as PureImage from 'pureimage';

const FONT_FAMILY = 'QuestionImageFont';
const DEFAULT_WIDTH = 1100;
const DEFAULT_PADDING = 34;
const DEFAULT_FONT_SIZE = 28;
const DEFAULT_LINE_HEIGHT = 40;
const DEFAULT_MAX_CHARS_PER_LINE = 62;
const DEFAULT_MAX_LINES = 42;

let loadedFontPath: string | undefined;

export interface TextImageOptions {
    readonly width?: number;
    readonly padding?: number;
    readonly fontSize?: number;
    readonly lineHeight?: number;
    readonly maxCharsPerLine?: number;
    readonly maxLines?: number;
    readonly fontPath?: string;
}

export function wrapTextForImage(text: string, maxCharsPerLine: number = DEFAULT_MAX_CHARS_PER_LINE): string[] {
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    return normalizedText
        .split('\n')
        .flatMap((line) => wrapLine(line, maxCharsPerLine));
}

export function clampImageLines(lines: readonly string[], maxLines: number = DEFAULT_MAX_LINES): string[] {
    if (lines.length <= maxLines) {
        return [...lines];
    }

    const tailLength = Math.min(5, Math.max(1, Math.floor((maxLines - 1) / 2)));
    const headLength = Math.max(1, maxLines - tailLength - 1);
    const hiddenLines = lines.length - headLength - tailLength;

    return [
        ...lines.slice(0, headLength),
        `... (+${hiddenLines} строк) ...`,
        ...lines.slice(lines.length - tailLength),
    ];
}

export async function renderTextImagePng(text: string, options: TextImageOptions = {}): Promise<Buffer> {
    const width = options.width ?? DEFAULT_WIDTH;
    const padding = options.padding ?? DEFAULT_PADDING;
    const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
    const lineHeight = options.lineHeight ?? DEFAULT_LINE_HEIGHT;
    const maxCharsPerLine = options.maxCharsPerLine ?? DEFAULT_MAX_CHARS_PER_LINE;
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;

    ensureFontLoaded(options.fontPath);

    const lines = clampImageLines(wrapTextForImage(text, maxCharsPerLine), maxLines);
    const height = Math.max(180, padding * 2 + lines.length * lineHeight);
    const image = PureImage.make(width, height);
    const context = image.getContext('2d');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#111827';
    context.font = `${fontSize}pt ${FONT_FAMILY}`;

    lines.forEach((line, index) => {
        context.fillText(line, padding, padding + fontSize + index * lineHeight);
    });

    return encodePngToBuffer(image);
}

function wrapLine(line: string, maxCharsPerLine: number): string[] {
    if (!line.trim()) {
        return [''];
    }

    const result: string[] = [];
    let currentLine = '';

    for (const word of line.split(/\s+/)) {
        const nextLine = currentLine ? `${currentLine} ${word}` : word;

        if (nextLine.length <= maxCharsPerLine) {
            currentLine = nextLine;
            continue;
        }

        if (currentLine) {
            result.push(currentLine);
        }

        const wordParts = splitLongWord(word, maxCharsPerLine);
        result.push(...wordParts.slice(0, -1));
        currentLine = wordParts[wordParts.length - 1] ?? '';
    }

    if (currentLine) {
        result.push(currentLine);
    }

    return result;
}

function splitLongWord(word: string, maxCharsPerLine: number): string[] {
    if (word.length <= maxCharsPerLine) {
        return [word];
    }

    const result: string[] = [];

    for (let index = 0; index < word.length; index += maxCharsPerLine) {
        result.push(word.slice(index, index + maxCharsPerLine));
    }

    return result;
}

function ensureFontLoaded(fontPath?: string): void {
    const resolvedFontPath = fontPath ?? findSystemFontPath();

    if (loadedFontPath === resolvedFontPath) {
        return;
    }

    PureImage.registerFont(resolvedFontPath, FONT_FAMILY).loadSync();
    loadedFontPath = resolvedFontPath;
}

function findSystemFontPath(): string {
    const candidates = [
        process.env.QUESTION_IMAGE_FONT,
        'C:\\Windows\\Fonts\\arial.ttf',
        'C:\\Windows\\Fonts\\segoeui.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/System/Library/Fonts/Supplemental/Arial.ttf',
    ].filter((candidate): candidate is string => Boolean(candidate));

    const fontPath = candidates.find((candidate) => fs.existsSync(path.resolve(candidate)));

    if (!fontPath) {
        throw new Error('Не найден системный шрифт для генерации изображения вопроса.');
    }

    return fontPath;
}

async function encodePngToBuffer(image: PureImage.Bitmap): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = new Writable({
        write(chunk: Buffer, _encoding, callback): void {
            chunks.push(Buffer.from(chunk));
            callback();
        },
    });

    await PureImage.encodePNGToStream(image, stream);

    return Buffer.concat(chunks);
}

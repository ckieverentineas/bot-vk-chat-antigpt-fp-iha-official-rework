import { clampImageLines, renderTextImagePng, wrapTextForImage } from '../src/module/text_image';

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

async function main(): Promise<void> {
    const wrapped = wrapTextForImage('раз два три четыре', 7);
    assertEqual(wrapped.length, 3, 'Text should wrap into several short lines');
    assertEqual(wrapped[0], 'раз два', 'Wrapper should keep whole words when possible');

    const clamped = clampImageLines(['1', '2', '3', '4', '5', '6', '7'], 5);
    assertEqual(clamped.length, 5, 'Line clamp should respect the maximum line count');
    assertEqual(clamped[2], '... (+3 строк) ...', 'Line clamp should describe hidden middle lines');

    const image = await renderTextImagePng('Проверочный вопрос\nс кириллицей');
    assertTrue(image.length > 100, 'Rendered PNG should not be empty');
    assertEqual(image.subarray(1, 4).toString('utf8'), 'PNG', 'Rendered buffer should have PNG signature');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

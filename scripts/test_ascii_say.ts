import {
    buildAsciiSayMessage,
    parseAsciiSayCommand,
    validateAsciiSayText,
} from '../src/engine/ascii_say';

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

function assertIncludes(text: string, expected: string, message: string): void {
    if (!text.includes(expected)) {
        throw new Error(`${message}\nExpected to include: ${expected}\nActual: ${text}`);
    }
}

function assertTrue(value: boolean, message: string): void {
    if (!value) {
        throw new Error(message);
    }
}

assertEqual(parseAsciiSayCommand('!скажи Привет'), 'Привет', 'Russian command should return payload');
assertEqual(parseAsciiSayCommand('!say Hello'), 'Hello', 'English alias should return payload');
assertEqual(parseAsciiSayCommand('!скажи'), '', 'Command without payload should return empty text');
assertEqual(parseAsciiSayCommand('!банк Привет'), undefined, 'Other commands should not be parsed as say command');

assertEqual(validateAsciiSayText('').ok, false, 'Empty payload should be rejected');
assertEqual(validateAsciiSayText('https://vk.com/scam').ok, false, 'URLs should be rejected');
assertEqual(validateAsciiSayText('карта 1234 5678 9012 3456').ok, false, 'Long digit chains should be rejected');
assertEqual(validateAsciiSayText('привет'.repeat(20)).ok, false, 'Too long payload should be rejected');

const validText = validateAsciiSayText('Привет, мир!');
assertTrue(validText.ok, 'Safe text should pass validation');

if (validText.ok) {
    const message = buildAsciiSayMessage(validText.text);

    assertIncludes(message, '```', 'ASCII message should be wrapped as preformatted text');
    assertIncludes(message, '#', 'ASCII message should contain drawn pixels');
    assertTrue(message.length <= 4096, 'ASCII message should fit into VK message limit');
}

import { getSearchModeLabel, getSearchSettings } from '../src/module/search_config';

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

const defaultSettings = getSearchSettings({});

assertEqual(defaultSettings.mode, 'stream', 'Default search mode should be memory-saving');
assertEqual(defaultSettings.batchSize, 10000, 'Default batch size should be conservative');
assertEqual(defaultSettings.topLimit, 1, 'Default top limit should keep only the best match');

const cacheSettings = getSearchSettings({
    SEARCH_MODE: 'cache',
    SEARCH_BATCH_SIZE: '250',
    SEARCH_TOP_LIMIT: '3',
});

assertEqual(cacheSettings.mode, 'cache', 'SEARCH_MODE=cache should enable RAM cache mode');
assertEqual(cacheSettings.batchSize, 250, 'SEARCH_BATCH_SIZE should be parsed from env');
assertEqual(cacheSettings.topLimit, 3, 'SEARCH_TOP_LIMIT should be parsed from env');

const invalidSettings = getSearchSettings({
    SEARCH_MODE: 'fast',
    SEARCH_BATCH_SIZE: '-10',
    SEARCH_TOP_LIMIT: '0',
});

assertEqual(invalidSettings.mode, 'stream', 'Invalid SEARCH_MODE should fall back to stream');
assertEqual(invalidSettings.batchSize, 10000, 'Invalid SEARCH_BATCH_SIZE should fall back to default');
assertEqual(invalidSettings.topLimit, 1, 'Invalid SEARCH_TOP_LIMIT should fall back to default');

assertEqual(
    getSearchModeLabel('stream'),
    'stream - экономия ОЗУ, чтение базы порциями',
    'Stream mode label should explain memory-saving behavior',
);

assertEqual(
    getSearchModeLabel('cache'),
    'cache - база загружается в ОЗУ',
    'Cache mode label should explain RAM cache behavior',
);

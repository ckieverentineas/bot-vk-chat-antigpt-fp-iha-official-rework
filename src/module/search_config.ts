export type SearchMode = 'stream' | 'cache';

export interface SearchSettings {
    readonly mode: SearchMode;
    readonly batchSize: number;
    readonly topLimit: number;
}

type SearchEnv = Record<string, string | undefined>;

const defaultSearchSettings: SearchSettings = {
    mode: 'stream',
    batchSize: 10000,
    topLimit: 1,
};

export function getSearchSettings(env: SearchEnv = process.env): SearchSettings {
    return {
        mode: parseSearchMode(env.SEARCH_MODE),
        batchSize: parsePositiveInteger(env.SEARCH_BATCH_SIZE, defaultSearchSettings.batchSize),
        topLimit: parsePositiveInteger(env.SEARCH_TOP_LIMIT, defaultSearchSettings.topLimit),
    };
}

export function getSearchModeLabel(mode: SearchMode): string {
    if (mode === 'cache') {
        return 'cache - база загружается в ОЗУ';
    }

    return 'stream - экономия ОЗУ, чтение базы порциями';
}

function parseSearchMode(value: string | undefined): SearchMode {
    return value === 'cache' ? 'cache' : 'stream';
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    if (value === undefined) {
        return fallback;
    }

    const parsedValue = Number(value);

    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
        return fallback;
    }

    return parsedValue;
}

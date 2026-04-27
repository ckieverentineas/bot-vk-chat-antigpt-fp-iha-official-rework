import { getSearchSettings, SearchSettings } from "../../module/search_config";

export interface SearchableTextRecord {
    readonly id: number;
    readonly text: string;
}

export interface TextSearchRepository<TRecord extends SearchableTextRecord> {
    loadAll(): Promise<readonly TRecord[]>;
    loadBatch(cursorId: number | undefined, batchSize: number): Promise<readonly TRecord[]>;
}

export interface TextSearchMatch<TRecord extends SearchableTextRecord> {
    readonly record: TRecord;
    readonly score: number;
}

export interface TextSearchResult<TRecord extends SearchableTextRecord> {
    readonly queryText: string;
    readonly matches: TextSearchMatch<TRecord>[];
}

export interface TextSearchParams<TRecord extends SearchableTextRecord> {
    readonly cacheKey: string;
    readonly queries: readonly string[];
    readonly repository: TextSearchRepository<TRecord>;
    readonly score: (queryText: string, record: TRecord) => number;
    readonly accept: (score: number, queryText: string, record: TRecord) => boolean;
    readonly settings?: SearchSettings;
}

const textSearchCache = new Map<string, Promise<readonly SearchableTextRecord[]>>();

export async function findTextMatches<TRecord extends SearchableTextRecord>(
    params: TextSearchParams<TRecord>,
): Promise<TextSearchResult<TRecord>[]> {
    const settings = params.settings ?? getSearchSettings();
    const results = createInitialResults<TRecord>(params.queries);

    if (settings.mode === 'cache') {
        const records = await getCachedRecords(params.cacheKey, params.repository);
        scanRecords(records as readonly TRecord[], results, params, settings.topLimit);
        return results;
    }

    let cursorId: number | undefined = undefined;

    while (true) {
        const records = await params.repository.loadBatch(cursorId, settings.batchSize);

        if (records.length === 0) {
            break;
        }

        scanRecords(records, results, params, settings.topLimit);
        cursorId = records[records.length - 1].id;
        await yieldToEventLoop();
    }

    return results;
}

export function clearTextSearchCache(cacheKey?: string): void {
    if (cacheKey === undefined) {
        textSearchCache.clear();
        return;
    }

    textSearchCache.delete(cacheKey);
}

function createInitialResults<TRecord extends SearchableTextRecord>(
    queries: readonly string[],
): TextSearchResult<TRecord>[] {
    return queries
        .map(queryText => queryText.trim())
        .filter(queryText => queryText.length > 0)
        .map(queryText => ({ queryText, matches: [] }));
}

function scanRecords<TRecord extends SearchableTextRecord>(
    records: readonly TRecord[],
    results: TextSearchResult<TRecord>[],
    params: TextSearchParams<TRecord>,
    topLimit: number,
): void {
    for (const result of results) {
        for (const record of records) {
            const score = params.score(result.queryText, record);

            if (params.accept(score, result.queryText, record)) {
                addMatch(result.matches, { record, score }, topLimit);
            }
        }
    }
}

function addMatch<TRecord extends SearchableTextRecord>(
    matches: TextSearchMatch<TRecord>[],
    match: TextSearchMatch<TRecord>,
    topLimit: number,
): void {
    if (matches.length < topLimit) {
        matches.push(match);
        matches.sort((left, right) => right.score - left.score);
        return;
    }

    const lowestScoreIndex = matches.length - 1;

    if (match.score <= matches[lowestScoreIndex].score) {
        return;
    }

    matches[lowestScoreIndex] = match;
    matches.sort((left, right) => right.score - left.score);
}

function getCachedRecords<TRecord extends SearchableTextRecord>(
    cacheKey: string,
    repository: TextSearchRepository<TRecord>,
): Promise<readonly TRecord[]> {
    const cachedRecords = textSearchCache.get(cacheKey);

    if (cachedRecords !== undefined) {
        return cachedRecords as Promise<readonly TRecord[]>;
    }

    const recordsPromise = repository.loadAll();
    textSearchCache.set(cacheKey, recordsPromise);

    return recordsPromise;
}

function yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

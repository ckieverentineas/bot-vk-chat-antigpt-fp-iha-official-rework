import {
    clearTextSearchCache,
    findTextMatches,
    SearchableTextRecord,
    TextSearchRepository,
} from '../src/engine/reseacher/text_search';

interface TestRecord extends SearchableTextRecord {
    readonly tag: string;
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

const records: TestRecord[] = [
    { id: 1, text: 'привет', tag: 'low' },
    { id: 2, text: 'привет мир', tag: 'best' },
    { id: 3, text: 'пока', tag: 'miss' },
];

function createRepository(): TextSearchRepository<TestRecord> & { loadAllCount: number; loadBatchCount: number } {
    return {
        loadAllCount: 0,
        loadBatchCount: 0,
        async loadAll(): Promise<TestRecord[]> {
            this.loadAllCount++;
            return records;
        },
        async loadBatch(cursorId: number | undefined, batchSize: number): Promise<TestRecord[]> {
            this.loadBatchCount++;
            const startIndex = cursorId === undefined
                ? 0
                : records.findIndex(record => record.id > cursorId);

            if (startIndex < 0) {
                return [];
            }

            return records.slice(startIndex, startIndex + batchSize);
        },
    };
}

const score = (queryText: string, record: TestRecord): number => {
    if (queryText === record.text) {
        return 1;
    }

    return record.text.includes(queryText) ? 0.75 : 0;
};

const accept = (scoreValue: number): boolean => scoreValue > 0;

async function run(): Promise<void> {
    clearTextSearchCache();

    const streamRepository = createRepository();
    const streamResults = await findTextMatches({
        cacheKey: 'test-stream',
        queries: ['привет'],
        repository: streamRepository,
        settings: { mode: 'stream', batchSize: 1, topLimit: 1 },
        score,
        accept,
    });

    assertEqual(streamRepository.loadAllCount, 0, 'Stream mode should not load all records');
    assert(streamRepository.loadBatchCount > 1, 'Stream mode should read records in batches');
    assertEqual(streamResults[0]?.matches[0]?.record.tag, 'low', 'Stream mode should keep the highest score only');
    assertEqual(streamResults[0]?.matches.length, 1, 'Stream mode should respect topLimit');

    const cacheRepository = createRepository();
    const firstCacheResults = await findTextMatches({
        cacheKey: 'test-cache',
        queries: ['привет'],
        repository: cacheRepository,
        settings: { mode: 'cache', batchSize: 1, topLimit: 2 },
        score,
        accept,
    });
    const secondCacheResults = await findTextMatches({
        cacheKey: 'test-cache',
        queries: ['пока'],
        repository: cacheRepository,
        settings: { mode: 'cache', batchSize: 1, topLimit: 1 },
        score,
        accept,
    });

    assertEqual(cacheRepository.loadAllCount, 1, 'Cache mode should reuse loaded records by cache key');
    assertEqual(cacheRepository.loadBatchCount, 0, 'Cache mode should not use batch loading');
    assertEqual(firstCacheResults[0]?.matches.length, 2, 'Cache mode should respect topLimit');
    assertEqual(secondCacheResults[0]?.matches[0]?.record.tag, 'miss', 'Cache mode should search cached records');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});

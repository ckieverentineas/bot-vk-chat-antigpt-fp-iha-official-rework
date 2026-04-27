import { parseVkEntitiesEnv, VkEntity } from '../src/module/vk_entities_env';

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);

    if (actualJson !== expectedJson) {
        throw new Error(`${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`);
    }
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function assertParsedEntities(input: string | undefined, expectedEntities: VkEntity[]): void {
    const result = parseVkEntitiesEnv(input);

    assertDeepEqual(result.entities, expectedEntities, 'Parsed entities do not match expected entities');
    assert(result.error === undefined, `Expected no parse error, got: ${result.error}`);
}

assertParsedEntities(
    `[
        { "token": "page-token", "type": "page" },
        { "token": "group-token", "type": "group" }
    ]`,
    [
        { token: 'page-token', type: 'page' },
        { token: 'group-token', type: 'group' },
    ],
);

assertParsedEntities(
    `[
        { "token": "page-token", "type": "page", },
    ]`,
    [
        { token: 'page-token', type: 'page' },
    ],
);

assertParsedEntities(
    `[
        {
            token: "page-token"
            type: "page"
        },
        {
            token: "group-token"
            type: "group"
        },
    ]`,
    [
        { token: 'page-token', type: 'page' },
        { token: 'group-token', type: 'group' },
    ],
);

assertParsedEntities(
    `[
        {
            token: "page-token"
        },
        {
            token: "group-token"
        },
    ]`,
    [
        { token: 'page-token' },
        { token: 'group-token' },
    ],
);

const invalidResult = parseVkEntitiesEnv(`[
    {
        token: "broken-token"
        type: "bot"
    },
]`);

assertDeepEqual(invalidResult.entities, [], 'Invalid entities should be skipped');
assert(Boolean(invalidResult.error), 'Invalid entities should return a parse error');

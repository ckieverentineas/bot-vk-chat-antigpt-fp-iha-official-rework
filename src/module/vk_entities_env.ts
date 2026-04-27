export type VkEntityType = 'page' | 'group';

export interface VkEntity {
    readonly token: string;
    readonly type?: VkEntityType;
}

export interface VkEntitiesParseResult {
    readonly entities: VkEntity[];
    readonly error?: string;
}

type StringFields = Record<string, string>;

interface EntityValidationResult {
    readonly entities: VkEntity[];
    readonly errors: string[];
}

export function parseVkEntitiesEnv(rawValue: string | undefined): VkEntitiesParseResult {
    const normalizedValue = normalizeRawValue(rawValue);

    if (normalizedValue.length === 0) {
        return { entities: [] };
    }

    const strictJsonResult = parseStrictJson(normalizedValue);
    if (strictJsonResult !== undefined) {
        return strictJsonResult;
    }

    return parseLenientEntities(normalizedValue);
}

function normalizeRawValue(rawValue: string | undefined): string {
    const trimmedValue = rawValue?.trim() ?? '';
    const unquotedValue = removeMatchingOuterQuotes(trimmedValue);
    const arrayValue = unquotedValue.startsWith('{') ? `[${unquotedValue}]` : unquotedValue;

    return removeTrailingCommasOutsideStrings(arrayValue);
}

function removeMatchingOuterQuotes(value: string): string {
    if (value.length < 2) {
        return value;
    }

    const firstCharacter = value[0];
    const lastCharacter = value[value.length - 1];
    const hasMatchingQuotes =
        (firstCharacter === '\'' && lastCharacter === '\'') ||
        (firstCharacter === '"' && lastCharacter === '"');

    return hasMatchingQuotes ? value.slice(1, -1) : value;
}

function removeTrailingCommasOutsideStrings(value: string): string {
    let result = '';
    let isInsideString = false;
    let isEscaped = false;

    for (let index = 0; index < value.length; index++) {
        const character = value[index];

        if (isInsideString) {
            result += character;

            if (isEscaped) {
                isEscaped = false;
                continue;
            }

            if (character === '\\') {
                isEscaped = true;
                continue;
            }

            if (character === '"') {
                isInsideString = false;
            }

            continue;
        }

        if (character === '"') {
            isInsideString = true;
            result += character;
            continue;
        }

        if (character === ',' && isTrailingComma(value, index)) {
            continue;
        }

        result += character;
    }

    return result;
}

function isTrailingComma(value: string, commaIndex: number): boolean {
    for (let index = commaIndex + 1; index < value.length; index++) {
        const character = value[index];

        if (/\s/.test(character)) {
            continue;
        }

        return character === ']' || character === '}';
    }

    return false;
}

function parseStrictJson(value: string): VkEntitiesParseResult | undefined {
    try {
        const parsedValue: unknown = JSON.parse(value);
        return toParseResult(validateEntities(parsedValue));
    } catch {
        return undefined;
    }
}

function parseLenientEntities(value: string): VkEntitiesParseResult {
    const objectBodies = extractObjectBodies(value);

    if (objectBodies.length === 0) {
        return {
            entities: [],
            error: 'VK_ENTITIES не удалось разобрать: не найдено ни одной записи вида { token: "...", type: "..." }.',
        };
    }

    const fields = objectBodies.map(parseObjectFields);
    const validationResult = validateEntities(fields);

    if (validationResult.errors.length === 0) {
        return { entities: validationResult.entities };
    }

    return {
        entities: validationResult.entities,
        error: `VK_ENTITIES разобран частично: ${validationResult.errors.join(' ')}`,
    };
}

function extractObjectBodies(value: string): string[] {
    const bodies: string[] = [];
    let depth = 0;
    let objectStartIndex = -1;
    let isInsideString = false;
    let isEscaped = false;

    for (let index = 0; index < value.length; index++) {
        const character = value[index];

        if (isInsideString) {
            if (isEscaped) {
                isEscaped = false;
                continue;
            }

            if (character === '\\') {
                isEscaped = true;
                continue;
            }

            if (character === '"') {
                isInsideString = false;
            }

            continue;
        }

        if (character === '"') {
            isInsideString = true;
            continue;
        }

        if (character === '{') {
            if (depth === 0) {
                objectStartIndex = index + 1;
            }

            depth++;
            continue;
        }

        if (character === '}') {
            depth--;

            if (depth === 0 && objectStartIndex >= 0) {
                bodies.push(value.slice(objectStartIndex, index));
                objectStartIndex = -1;
            }
        }
    }

    return depth === 0 ? bodies : [];
}

function parseObjectFields(objectBody: string): StringFields {
    const fields: StringFields = {};
    const fieldPattern = /(?:^|[\s,])"?([A-Za-z_][A-Za-z0-9_]*)"?\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let match: RegExpExecArray | null;

    while ((match = fieldPattern.exec(objectBody)) !== null) {
        const [, key, rawValue] = match;
        fields[key] = parseQuotedStringValue(rawValue);
    }

    return fields;
}

function parseQuotedStringValue(value: string): string {
    try {
        return JSON.parse(`"${value}"`) as string;
    } catch {
        return value;
    }
}

function validateEntities(value: unknown): EntityValidationResult {
    if (!Array.isArray(value)) {
        return {
            entities: [],
            errors: ['ожидался массив записей.'],
        };
    }

    const entities: VkEntity[] = [];
    const errors: string[] = [];

    value.forEach((item, index) => {
        const token = getStringField(item, 'token')?.trim();
        const type = getStringField(item, 'type')?.trim();

        if (!token) {
            errors.push(`запись ${index + 1}: token должен быть непустой строкой.`);
            return;
        }

        if (type !== undefined && !isVkEntityType(type)) {
            errors.push(`запись ${index + 1}: type должен быть "page" или "group".`);
            return;
        }

        entities.push(type === undefined ? { token } : { token, type });
    });

    return { entities, errors };
}

function toParseResult(validationResult: EntityValidationResult): VkEntitiesParseResult {
    if (validationResult.errors.length === 0) {
        return { entities: validationResult.entities };
    }

    return {
        entities: validationResult.entities,
        error: `VK_ENTITIES разобран частично: ${validationResult.errors.join(' ')}`,
    };
}

function getStringField(value: unknown, fieldName: string): string | undefined {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }

    const record = value as Record<string, unknown>;
    const fieldValue = record[fieldName];

    return typeof fieldValue === 'string' ? fieldValue : undefined;
}

function isVkEntityType(value: string | undefined): value is VkEntityType {
    return value === 'page' || value === 'group';
}

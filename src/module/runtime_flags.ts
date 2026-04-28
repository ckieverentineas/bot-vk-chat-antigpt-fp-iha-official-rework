import prisma from './prisma';

export type RuntimeFeature =
    'answersEnabled' |
    'privateMessagesEnabled' |
    'chatsEnabled' |
    'wallCommentsEnabled' |
    'offlineReadingEnabled';

export type RuntimeForcedMode = 'database-import';
export type AutoReplyTarget = 'private-message' | 'chat' | 'wall-comment';
export type AutoReplyDecisionStatus = 'ACCESS' | 'DENIED' | 'LOADING';

export interface RuntimeSettings {
    readonly answersEnabled: boolean;
    readonly privateMessagesEnabled: boolean;
    readonly chatsEnabled: boolean;
    readonly wallCommentsEnabled: boolean;
    readonly offlineReadingEnabled: boolean;
    readonly forcedModes: readonly RuntimeForcedMode[];
}

export interface AutoReplyDecision {
    readonly allowed: boolean;
    readonly decision: AutoReplyDecisionStatus;
    readonly reason?: string;
}

export interface RuntimeModeCommand {
    readonly feature: RuntimeFeature;
    readonly enabled: boolean;
}

type MutableRuntimeSettings = {
    [Feature in RuntimeFeature]: boolean;
};

const defaultSettings: MutableRuntimeSettings = {
    answersEnabled: true,
    privateMessagesEnabled: true,
    chatsEnabled: true,
    wallCommentsEnabled: true,
    offlineReadingEnabled: true,
};

const featureLabels: Record<RuntimeFeature, string> = {
    answersEnabled: 'Автоответы',
    privateMessagesEnabled: 'Личные сообщения',
    chatsEnabled: 'Беседы',
    wallCommentsEnabled: 'Комментарии на стене',
    offlineReadingEnabled: 'Оффлайн-сообщения',
};

const runtimeFeatures: readonly RuntimeFeature[] = [
    'answersEnabled',
    'privateMessagesEnabled',
    'chatsEnabled',
    'wallCommentsEnabled',
    'offlineReadingEnabled',
];

const featureAliases: Record<string, RuntimeFeature> = {
    ответы: 'answersEnabled',
    автоответы: 'answersEnabled',
    лс: 'privateMessagesEnabled',
    личка: 'privateMessagesEnabled',
    личные: 'privateMessagesEnabled',
    беседы: 'chatsEnabled',
    чаты: 'chatsEnabled',
    чат: 'chatsEnabled',
    стена: 'wallCommentsEnabled',
    комментарии: 'wallCommentsEnabled',
    комменты: 'wallCommentsEnabled',
    оффлайн: 'offlineReadingEnabled',
    offline: 'offlineReadingEnabled',
};

const enabledAliases = new Set(['вкл', 'включить', 'on', 'enable', 'true', '1']);
const disabledAliases = new Set(['выкл', 'отключить', 'off', 'disable', 'false', '0']);
const forcedModes = new Map<RuntimeForcedMode, number>();

let runtimeSettings: MutableRuntimeSettings = { ...defaultSettings };

export function getRuntimeSettings(): RuntimeSettings {
    return {
        ...runtimeSettings,
        forcedModes: Array.from(forcedModes.keys()),
    };
}

export function resetRuntimeSettings(): void {
    runtimeSettings = { ...defaultSettings };
    forcedModes.clear();
}

export async function loadRuntimeSettingsFromDatabase(): Promise<RuntimeSettings> {
    const settings = await prisma.runtimeSetting.findMany({
        where: {
            key: {
                in: [...runtimeFeatures],
            },
        },
    });
    const nextSettings: MutableRuntimeSettings = { ...defaultSettings };

    for (const setting of settings) {
        if (!isRuntimeFeature(setting.key)) {
            continue;
        }

        nextSettings[setting.key] = parseStoredBoolean(setting.value, defaultSettings[setting.key]);
    }

    runtimeSettings = nextSettings;

    return getRuntimeSettings();
}

export function setRuntimeFeature(feature: RuntimeFeature, enabled: boolean): RuntimeSettings {
    runtimeSettings = {
        ...runtimeSettings,
        [feature]: enabled,
    };

    return getRuntimeSettings();
}

export async function saveRuntimeFeatureToDatabase(feature: RuntimeFeature, enabled: boolean): Promise<RuntimeSettings> {
    await prisma.runtimeSetting.upsert({
        where: { key: feature },
        create: {
            key: feature,
            value: serializeBoolean(enabled),
        },
        update: {
            value: serializeBoolean(enabled),
        },
    });

    return setRuntimeFeature(feature, enabled);
}

export function enterRuntimeForcedMode(mode: RuntimeForcedMode): () => void {
    forcedModes.set(mode, (forcedModes.get(mode) ?? 0) + 1);

    return () => {
        const count = forcedModes.get(mode) ?? 0;

        if (count <= 1) {
            forcedModes.delete(mode);
            return;
        }

        forcedModes.set(mode, count - 1);
    };
}

export function getAutoReplyDecision(target: AutoReplyTarget): AutoReplyDecision {
    if (forcedModes.has('database-import')) {
        return {
            allowed: false,
            decision: 'LOADING',
            reason: 'Идет загрузка базы, автоответы временно отключены.',
        };
    }

    if (!runtimeSettings.answersEnabled) {
        return {
            allowed: false,
            decision: 'DENIED',
            reason: 'Автоответы отключены runtime-тумблером.',
        };
    }

    const targetFeature = getTargetFeature(target);

    if (!runtimeSettings[targetFeature]) {
        return {
            allowed: false,
            decision: 'DENIED',
            reason: `${featureLabels[targetFeature]} отключены runtime-тумблером.`,
        };
    }

    return {
        allowed: true,
        decision: 'ACCESS',
    };
}

export function parseRuntimeModeCommand(text: string): RuntimeModeCommand | undefined {
    const parts = text.trim().toLowerCase().split(/\s+/);

    if (parts[0] !== '!режим' || parts.length < 3) {
        return undefined;
    }

    const feature = featureAliases[parts[1]];
    const enabled = parseEnabledValue(parts[2]);

    if (feature === undefined || enabled === undefined) {
        return undefined;
    }

    return { feature, enabled };
}

export function formatRuntimeSettings(settings: RuntimeSettings = getRuntimeSettings()): string {
    const forcedModeText = settings.forcedModes.length > 0 ? settings.forcedModes.join(', ') : 'нет';

    return [
        'Текущий режим бота:',
        formatRuntimeFeature('answersEnabled', settings.answersEnabled),
        formatRuntimeFeature('privateMessagesEnabled', settings.privateMessagesEnabled),
        formatRuntimeFeature('chatsEnabled', settings.chatsEnabled),
        formatRuntimeFeature('wallCommentsEnabled', settings.wallCommentsEnabled),
        formatRuntimeFeature('offlineReadingEnabled', settings.offlineReadingEnabled),
        `Принудительные режимы: ${forcedModeText}`,
    ].join('\n');
}

export function getRuntimeFeatureLabel(feature: RuntimeFeature): string {
    return featureLabels[feature];
}

function parseEnabledValue(value: string): boolean | undefined {
    if (enabledAliases.has(value)) {
        return true;
    }

    if (disabledAliases.has(value)) {
        return false;
    }

    return undefined;
}

function isRuntimeFeature(value: string): value is RuntimeFeature {
    return runtimeFeatures.includes(value as RuntimeFeature);
}

function parseStoredBoolean(value: string, fallback: boolean): boolean {
    if (value === 'true') {
        return true;
    }

    if (value === 'false') {
        return false;
    }

    return fallback;
}

function serializeBoolean(value: boolean): string {
    return value ? 'true' : 'false';
}

function getTargetFeature(target: AutoReplyTarget): RuntimeFeature {
    if (target === 'chat') {
        return 'chatsEnabled';
    }

    if (target === 'wall-comment') {
        return 'wallCommentsEnabled';
    }

    return 'privateMessagesEnabled';
}

function formatRuntimeFeature(feature: RuntimeFeature, enabled: boolean): string {
    return `${featureLabels[feature]}: ${enabled ? 'включены' : 'отключены'}`;
}

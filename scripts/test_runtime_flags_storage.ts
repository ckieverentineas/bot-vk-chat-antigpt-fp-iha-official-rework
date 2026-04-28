import prisma from '../src/module/prisma';
import {
    loadRuntimeSettingsFromDatabase,
    resetRuntimeSettings,
    saveRuntimeFeatureToDatabase,
    setRuntimeFeature,
} from '../src/module/runtime_flags';

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

async function run(): Promise<void> {
    const runtimeKeys = [
        'answersEnabled',
        'privateMessagesEnabled',
        'chatsEnabled',
        'wallCommentsEnabled',
        'offlineReadingEnabled',
    ];
    const previousSettings = await prisma.runtimeSetting.findMany({
        where: {
            key: {
                in: runtimeKeys,
            },
        },
    });

    try {
        await prisma.runtimeSetting.deleteMany({
            where: {
                key: {
                    in: runtimeKeys,
                },
            },
        });

        resetRuntimeSettings();
        await saveRuntimeFeatureToDatabase('chatsEnabled', false);

        resetRuntimeSettings();
        assert(loadRuntimeSettingsFromDatabase !== undefined, 'Storage loader should be exported');

        const loadedSettings = await loadRuntimeSettingsFromDatabase();
        assert(!loadedSettings.chatsEnabled, 'Saved chat toggle should survive memory reset');
        assert(loadedSettings.answersEnabled, 'Missing settings should fall back to defaults');

        await saveRuntimeFeatureToDatabase('chatsEnabled', true);
        const restoredSettings = await loadRuntimeSettingsFromDatabase();
        assert(restoredSettings.chatsEnabled, 'Saving enabled toggle should update stored value');

        setRuntimeFeature('chatsEnabled', false);
        const reloadedSettings = await loadRuntimeSettingsFromDatabase();
        assert(reloadedSettings.chatsEnabled, 'Loading from DB should replace current memory settings');
    } finally {
        await prisma.runtimeSetting.deleteMany({
            where: {
                key: {
                    in: runtimeKeys,
                },
            },
        });

        for (const setting of previousSettings) {
            await prisma.runtimeSetting.create({
                data: {
                    key: setting.key,
                    value: setting.value,
                },
            });
        }
    }
}

run()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

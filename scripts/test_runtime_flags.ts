import {
    enterRuntimeForcedMode,
    formatRuntimeSettings,
    getAutoReplyDecision,
    getRuntimeSettings,
    parseRuntimeModeCommand,
    resetRuntimeSettings,
    setRuntimeFeature,
} from '../src/module/runtime_flags';

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

resetRuntimeSettings();

assert(getAutoReplyDecision('private-message').allowed, 'Private messages should be enabled by default');
assert(getAutoReplyDecision('chat').allowed, 'Chats should be enabled by default');
assert(getAutoReplyDecision('wall-comment').allowed, 'Wall comments should be enabled by default');

setRuntimeFeature('chatsEnabled', false);

assert(getAutoReplyDecision('private-message').allowed, 'Disabling chats should not affect private messages');
assert(!getAutoReplyDecision('chat').allowed, 'Disabled chats should block chat auto replies');
assertEqual(getAutoReplyDecision('chat').decision, 'DENIED', 'Manual disabled channel should be logged as DENIED');

const releaseImportMode = enterRuntimeForcedMode('database-import');

assert(!getAutoReplyDecision('private-message').allowed, 'Database import should block private auto replies');
assert(!getAutoReplyDecision('chat').allowed, 'Database import should block chat auto replies');
assert(!getAutoReplyDecision('wall-comment').allowed, 'Database import should block wall auto replies');
assertEqual(getAutoReplyDecision('private-message').decision, 'LOADING', 'Database import should be logged as LOADING');
assert(formatRuntimeSettings(getRuntimeSettings()).includes('database-import'), 'Runtime settings should show forced import mode');

releaseImportMode();

assert(getAutoReplyDecision('private-message').allowed, 'Releasing import mode should restore private replies');
assert(!getAutoReplyDecision('chat').allowed, 'Releasing import mode should keep manual chat toggle');

assertEqual(parseRuntimeModeCommand('!режим ответы выкл')?.feature, 'answersEnabled', 'Parser should understand answers toggle');
assertEqual(parseRuntimeModeCommand('!режим лс вкл')?.enabled, true, 'Parser should understand enable command');
assertEqual(parseRuntimeModeCommand('!режим беседы выкл')?.feature, 'chatsEnabled', 'Parser should understand chats alias');
assertEqual(parseRuntimeModeCommand('!режим стена выкл')?.feature, 'wallCommentsEnabled', 'Parser should understand wall alias');
assertEqual(parseRuntimeModeCommand('!режим оффлайн выкл')?.feature, 'offlineReadingEnabled', 'Parser should understand offline alias');
assertEqual(parseRuntimeModeCommand('!режим неизвестно выкл'), undefined, 'Parser should reject unknown feature');

resetRuntimeSettings();

// @ts-nocheck
function toBoolean(value) {
    return value === true;
}

function isFakeVersionRun() {
    return process.argv.some(arg => /^-\d+\.\d+\.\d+$/.test(String(arg || '').trim()));
}

function normalizeText(value, fallback = '') {
    const text = String(value || '').trim();
    return text || fallback;
}

function classifyErrorReason(error) {
    const code = String((error && error.code) || '').toLowerCase();
    const message = String((error && error.message) || error || '').toLowerCase();
    if (message.includes('checksum') || message.includes('sha512')) return 'checksum';
    if (message.includes('signature')) return 'signature';
    if (code === 'enoent' || message.includes('no such file')) return 'missing-installer';
    if (code === 'econnreset' || code === 'econnrefused' || code === 'enetunreach' || code === 'ehostunreach' || code === 'eai_again' || message.includes('network') || message.includes('offline') || message.includes('timed out')) {
        return 'offline';
    }
    return code || 'download';
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function resolveUpdaterRuntime(app, isFakeRun) {
    if (app.isPackaged) {
        return {
            channel: 'nsis',
            provider: 'github',
            supported: true,
            usesDevConfig: false
        };
    }

    if (isFakeRun()) {
        return {
            channel: 'development',
            provider: 'generic',
            supported: true,
            usesDevConfig: true
        };
    }

    return {
        channel: 'development',
        provider: 'none',
        supported: false,
        usesDevConfig: false
    };
}

module.exports = {
    classifyErrorReason,
    delay,
    isFakeVersionRun,
    normalizeText,
    resolveUpdaterRuntime,
    toBoolean
};

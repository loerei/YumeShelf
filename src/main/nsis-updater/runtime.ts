export function toBoolean(value: any): boolean {
    return value === true;
}

export function isFakeVersionRun(): boolean {
    return process.argv.some(arg => /^-\d+\.\d+\.\d+$/.test(String(arg || '').trim()));
}

export function normalizeText(value: any, fallback: any = ''): any {
    const text = String(value || '').trim();
    return text || fallback;
}

export function classifyErrorReason(error: any): string {
    const code = String((error?.code) || '').toLowerCase();
    const message = String((error?.message) || error || '').toLowerCase();
    if (message.includes('checksum') || message.includes('sha512')) return 'checksum';
    if (message.includes('signature')) return 'signature';
    if (code === 'enoent' || message.includes('no such file')) return 'missing-installer';
    if (code === 'econnreset' || code === 'econnrefused' || code === 'enetunreach' || code === 'ehostunreach' || code === 'eai_again' || message.includes('network') || message.includes('offline') || message.includes('timed out')) {
        return 'offline';
    }
    return code || 'download';
}

export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export function resolveUpdaterRuntime(app: any, isFakeRun: () => boolean) {
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

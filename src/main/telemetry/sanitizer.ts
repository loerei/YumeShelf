import * as os from 'node:os';

export interface TelemetryPayload {
    filePath: string;
    lineNo?: number | null;
    functionName: string;
    source: string;
    count: number;
    firstSeen?: string;
    lastSeen?: string;
}

// Dynamically retrieve the active OS user details to filter out profile names
let cachedUsername = '';
try {
    const userInfo = os.userInfo();
    cachedUsername = userInfo.username || '';
} catch {
    cachedUsername = process.env.USERNAME || process.env.USER || '';
}

/**
 * Standardize path slashes to forward slashes for backend consistency and remove local drive letters
 */
export function normalizePathSlashes(p: string): string {
    return p.replaceAll('\\', '/');
}

/**
 * Robust path and profile sanitizer
 */
export function sanitizePath(filePath: string, appDataDir?: string, userDataDir?: string): string {
    if (!filePath) return '';

    let cleaned = normalizePathSlashes(filePath);

    // Get default system folders to map to generic placeholders
    const userProfile = normalizePathSlashes(process.env.USERPROFILE || '');
    const localAppData = normalizePathSlashes(process.env.LOCALAPPDATA || '');
    const appData = normalizePathSlashes(process.env.APPDATA || '');

    // Map system-specific paths to generic place-holders
    if (appDataDir) {
        const normAppData = normalizePathSlashes(appDataDir);
        cleaned = cleaned.replace(new RegExp(escapeRegExp(normAppData), 'gi'), '<appdata>');
    }
    if (userDataDir) {
        const normUserData = normalizePathSlashes(userDataDir);
        cleaned = cleaned.replace(new RegExp(escapeRegExp(normUserData), 'gi'), '<userdata>');
    }

    if (appData) {
        cleaned = cleaned.replace(new RegExp(escapeRegExp(appData), 'gi'), '<appdata>');
    }
    if (localAppData) {
        cleaned = cleaned.replace(new RegExp(escapeRegExp(localAppData), 'gi'), '<localappdata>');
    }
    if (userProfile) {
        cleaned = cleaned.replace(new RegExp(escapeRegExp(userProfile), 'gi'), '<user-profile>');
    }

    // Aggressively scrub the system username if it appears anywhere in the path
    if (cachedUsername && cachedUsername.length > 2) {
        cleaned = cleaned.replace(new RegExp(escapeRegExp(cachedUsername), 'gi'), '<user>');
    }

    // Strip drive letters (e.g. C:/, d:/) to ensure cross-machine paths are identical
    cleaned = cleaned.replace(/^[a-zA-Z]:\//, '/');

    // Remove relative prefixes if they leak (e.g. ../../)
    cleaned = cleaned.replace(/^\.+\//, '');

    return cleaned;
}

/**
 * Aggressive credentials and secrets scrubber
 */
export function scrubSecrets(input: string): string {
    if (!input) return '';

    let scrubbed = input;

    // Common authorization/credentials patterns
    const secretPatterns = [
        /(authorization|auth|token|password|passwd|pwd|key|secret|apikey|bearer)\s*[:=]\s*["']?[\w.~-]{10,}["']?/gi,
        /db:\/\/[^@\s]+@[^\s]+/gi, // database URIs
        /https?:\/\/[^@\s]+@[^\s]+/gi, // basic auth URLs
        /\bAKIA[A-Z0-9]{16}\b/g, // AWS Access Keys
        /\b[\w-]+\.[\w-]+\.[\w-]+\b/g, // JWT Tokens (3-part dot-separated base64)
        /\b(ghp|npm)_\w{36}\b/g, // GitHub / npm personal access tokens
        /-----BEGIN[A-Z ]*PRIVATE KEY-----[a-z0-9+/=\s]+-----END[A-Z ]*PRIVATE KEY-----/gi, // Full PEM block
        /-----BEGIN[A-Z ]*PRIVATE KEY-----/gi // PEM private key boundary start
    ];

    for (const pattern of secretPatterns) {
        scrubbed = scrubbed.replace(pattern, (match, p1) => {
            if (p1) {
                return `${p1}: <redacted>`;
            }
            return '<redacted-secret>';
        });
    }

    return scrubbed;
}

/**
 * Cleans a stack trace down to filename, function names, and line numbers
 */
export function sanitizeStackTrace(stack: string, appDataDir?: string, userDataDir?: string): string {
    if (!stack) return '';

    const lines = stack.split('\n');
    const sanitizedLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('at ')) {
            return scrubSecrets(trimmed);
        }

        // Standard trace format: at FunctionName (FilePath:Line:Col) or at FilePath:Line:Col
        let cleanedLine = trimmed;

        // Apply path sanitization
        cleanedLine = sanitizePath(cleanedLine, appDataDir, userDataDir);
        cleanedLine = scrubSecrets(cleanedLine);

        return cleanedLine;
    });

    return sanitizedLines.join('\n');
}

/**
 * Sanitizes a full JSON log payload to ensure absolute anonymity
 */
export function sanitizeLogPayload(
    payload: TelemetryPayload,
    appDataDir?: string,
    userDataDir?: string
): TelemetryPayload {
    return {
        filePath: sanitizePath(payload.filePath, appDataDir, userDataDir),
        lineNo: payload.lineNo || null,
        functionName: scrubSecrets(payload.functionName).replace(/[<>:"/\\|?*]/g, ''), // Strip illegal characters
        source: payload.source || 'production',
        count: payload.count || 1,
        firstSeen: payload.firstSeen,
        lastSeen: payload.lastSeen
    };
}

function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

import * as util from 'util';
import { execSync } from 'child_process';

function isBrokenPipeError(error: any): boolean {
    if (!error) return false;
    const code = error.code;
    const message = (error.message || String(error)).toLowerCase();
    return code === 'EPIPE' || code === 'EOF' || message.includes('broken pipe');
}

type ConsoleMethodName = 'log' | 'info' | 'warn' | 'error' | 'debug';

function wrapConsoleMethod(methodName: ConsoleMethodName): void {
    const original = console[methodName] as any;
    if (typeof original !== 'function' || original.__yumeshelfSafeWrapped) {
        return;
    }

    const isOutputError = methodName === 'error' || methodName === 'warn';
    const stream = isOutputError ? process.stderr : process.stdout;

    // Prevent unhandled stream errors on Windows that cause the app to crash
    if (process.platform === 'win32' && stream && !(stream as any).__yumeshelfErrorHandled) {
        stream.on('error', (err: any) => {
            if (isBrokenPipeError(err)) return;
        });
        (stream as any).__yumeshelfErrorHandled = true;
    }

    const wrapped = (...args: any[]): any => {
        try {
            if (process.platform === 'win32' && stream) {
                const formatted = util.format(...args) + '\n';
                stream.write(Buffer.from(formatted, 'utf-8'));
            } else {
                return original.apply(console, args);
            }
        } catch (error) {
            if (isBrokenPipeError(error)) {
                return;
            }
            try {
                return original.apply(console, args);
            } catch (e) {}
        }
    };

    (wrapped as any).__yumeshelfSafeWrapped = true;
    (wrapped as any).__yumeshelfOriginal = original;
    console[methodName] = wrapped as any;
}

export function installSafeConsole(): void {
    if (process.platform === 'win32') {
        try {
            execSync('chcp 65001', { stdio: 'ignore' });
        } catch (e) {}
    }
    const methods: ConsoleMethodName[] = ['log', 'info', 'warn', 'error', 'debug'];
    methods.forEach(wrapConsoleMethod);
}

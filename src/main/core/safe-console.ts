// @ts-nocheck
const util = require('util');

function isBrokenPipeError(error) {
    return !!error && (error.code === 'EPIPE' || String(error.message || error).includes('broken pipe'));
}

function wrapConsoleMethod(methodName) {
    const original = console[methodName];
    if (typeof original !== 'function' || original.__yumeshelfSafeWrapped) {
        return;
    }

    const isOutputError = methodName === 'error' || methodName === 'warn';
    const stream = isOutputError ? process.stderr : process.stdout;

    const wrapped = (...args) => {
        try {
            if (process.platform === 'win32') {
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

    wrapped.__yumeshelfSafeWrapped = true;
    wrapped.__yumeshelfOriginal = original;
    console[methodName] = wrapped;
}

function installSafeConsole() {
    if (process.platform === 'win32') {
        try {
            require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
        } catch (e) {}
    }
    ['log', 'info', 'warn', 'error', 'debug'].forEach(wrapConsoleMethod);
}

module.exports = {
    installSafeConsole
};

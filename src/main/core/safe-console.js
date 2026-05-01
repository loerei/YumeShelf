function isBrokenPipeError(error) {
    return !!error && (error.code === 'EPIPE' || String(error.message || error).includes('broken pipe'));
}

function wrapConsoleMethod(methodName) {
    const original = console[methodName];
    if (typeof original !== 'function' || original.__yumeshelfSafeWrapped) {
        return;
    }

    const wrapped = (...args) => {
        try {
            return original.apply(console, args);
        } catch (error) {
            if (isBrokenPipeError(error)) {
                return;
            }
            throw error;
        }
    };

    wrapped.__yumeshelfSafeWrapped = true;
    wrapped.__yumeshelfOriginal = original;
    console[methodName] = wrapped;
}

function installSafeConsole() {
    ['log', 'info', 'warn', 'error', 'debug'].forEach(wrapConsoleMethod);
}

module.exports = {
    installSafeConsole
};

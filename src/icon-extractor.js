process.on('message', (msg) => {
    if (msg && msg.type === 'extract' && msg.id && msg.path && msg.extPath) {
        try {
            const ext = require(msg.extPath);
            const buf = ext(msg.path, 256);
            if (buf && buf.length > 0) {
                process.send({ id: msg.id, base64: buf.toString('base64') });
            } else {
                process.send({ id: msg.id, base64: '' });
            }
        } catch (err) {
            console.error(`[ICON-WORKER] ERROR during extraction:`, err);
            process.send({ id: msg.id, base64: '' });
        }
    } else {
        console.warn(`[ICON-WORKER] Received invalid message format:`, msg);
    }
});

process.on('uncaughtException', (err) => {
    console.error(`[ICON-WORKER] UNCAUGHT EXCEPTION:`, err);
});

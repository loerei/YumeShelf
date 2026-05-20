// @ts-nocheck
const { BrowserWindow } = require('electron');

function broadcastRendererEvent(channel, payload) {
    BrowserWindow.getAllWindows().forEach((windowRef) => {
        if (!windowRef || windowRef.isDestroyed()) return;
        windowRef.webContents.send(channel, payload);
    });
}

function createStatusBroadcaster(channel) {
    return (payload) => {
        broadcastRendererEvent(channel, payload);
    };
}

module.exports = {
    createStatusBroadcaster
};

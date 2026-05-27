import { BrowserWindow } from 'electron';

export function broadcastRendererEvent(channel: string, payload: any): void {
    BrowserWindow.getAllWindows().forEach((windowRef) => {
        if (!windowRef || windowRef.isDestroyed()) return;
        windowRef.webContents.send(channel, payload);
    });
}

export function createStatusBroadcaster(channel: string): (payload: any) => void {
    return (payload: any) => {
        broadcastRendererEvent(channel, payload);
    };
}

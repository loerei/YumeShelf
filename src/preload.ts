import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from './shared/types/ipc';

const api: ElectronAPI = {
    // Type-Safe Generic Bridge Implementation
    invoke: (channel: any, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    send: (channel: any, ...args: any[]) => ipcRenderer.send(channel, ...args),
    on: (channel: any, callback: any) => {
        const subscription = (_event: any, ...args: any[]) => callback(...args);
        ipcRenderer.on(channel, subscription);
        return () => {
            ipcRenderer.off(channel, subscription);
        };
    },

};

contextBridge.exposeInMainWorld('electronAPI', api);

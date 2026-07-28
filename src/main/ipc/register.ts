import { IpcRouter } from './router';
import type { RegisterIpcOptions } from './types';

export type { RegisterIpcOptions };

export function registerMainIpc(options: RegisterIpcOptions): void {
    const router = new IpcRouter(options);
    router.registerAll();
}

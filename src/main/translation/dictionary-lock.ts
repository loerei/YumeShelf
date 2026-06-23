
export class DictionaryLocker {
    private static lockPromise: Promise<void> = Promise.resolve();

    /**
     * Executes a callback surgically within a global serialization lock.
     * Prevents file lock collisions between background AOT sync and active runtime proxy.
     */
    static async executeLocked<T>(callback: () => Promise<T>): Promise<T> {
        let resolveLock: () => void;
        const nextLock = new Promise<void>((resolve) => {
            resolveLock = resolve;
        });

        const currentLock = this.lockPromise;
        this.lockPromise = nextLock;

        try {
            await currentLock;
            return await callback();
        } finally {
            resolveLock!();
        }
    }
}

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { sanitizeLogPayload, TelemetryPayload } from './sanitizer';

export class TelemetryShipper {
    private static instance: TelemetryShipper | null = null;

    private enabled: boolean = false;
    private appDataDir: string = '';
    private userDataDir: string = '';
    private dbFile: string = '';
    private queueFile: string = '';
    private memoryBuffer: Map<string, TelemetryPayload> = new Map();
    private flushInterval: NodeJS.Timeout | null = null;
    private isShipping: boolean = false;

    // The endpoint is proxy-secured by Cloudflare Workers to protect the Supabase key.
    // Client has a general Client App Token to prevent generic spamming.
    private workerEndpoint: string = process.env.TELEMETRY_WORKER_ENDPOINT || 'https://yumeshelf-telemetry.sayusumat.workers.dev/v1/ship';
    private clientAppToken: string = process.env.TELEMETRY_CLIENT_TOKEN || 'yumeshelf-client-auth-token-2026';

    private constructor() {}

    public static getInstance(): TelemetryShipper {
        if (!TelemetryShipper.instance) {
            TelemetryShipper.instance = new TelemetryShipper();
        }
        return TelemetryShipper.instance;
    }

    /**
     * Initializes the shipper with Electron context and reads configurations
     */
    public async initialize(app: any, appPaths: any): Promise<void> {
        this.appDataDir = app.getPath('appData');
        this.userDataDir = app.getPath('userData');
        this.dbFile = appPaths.dbFile;
        this.queueFile = path.join(path.dirname(this.dbFile), 'telemetry-queue.json');

        // Load the opt-in configuration status from library_db.json
        await this.syncConfigState();

        // Load offline cached logs if enabled
        if (this.enabled) {
            await this.loadQueueFromDisk();
            this.startFlushTimer();
        } else {
            // Guarantee no data remnants if user opted out
            await this.purgeAllData();
        }
    }

    /**
     * Synchronizes the internal enabled status with library_db.json config
     */
    public async syncConfigState(): Promise<void> {
        try {
            if (fsSync.existsSync(this.dbFile)) {
                const dbRaw = await fs.readFile(this.dbFile, 'utf8');
                const db = JSON.parse(dbRaw);
                if (db && db.config) {
                    this.enabled = !!db.config.telemetryEnabled;
                    return;
                }
            }
        } catch (e) {
            console.error('[TELEMETRY][SHIPPER] Failed to sync config state:', e);
        }
        this.enabled = false;
    }

    /**
     * Tracks a function execution. It will sanitize, aggregate, and store in-memory.
     */
    public track(
        filePath: string,
        functionName: string,
        source: string,
        lineNo: number | null = null
    ): void {
        if (!this.enabled) return;

        // Skip trace paths containing node_modules
        if (filePath.includes('node_modules')) return;

        const rawPayload: TelemetryPayload = {
            filePath,
            lineNo,
            functionName,
            source,
            count: 1
        };

        const sanitized = sanitizeLogPayload(rawPayload, this.appDataDir, this.userDataDir);
        
        // Keying by normalized path + function name + source to aggregate counts in-memory
        const aggregationKey = `${sanitized.filePath}::${sanitized.functionName}::${sanitized.source}::${sanitized.lineNo || 'null'}`;
        
        const existing = this.memoryBuffer.get(aggregationKey);
        if (existing) {
            existing.count += 1;
            existing.lastSeen = new Date().toISOString();
        } else {
            sanitized.firstSeen = new Date().toISOString();
            sanitized.lastSeen = sanitized.firstSeen;
            this.memoryBuffer.set(aggregationKey, sanitized);
        }

        // Auto-save memory buffer to disk queue in case of unexpected closure (throttle safety)
        this.saveQueueToDisk().catch(err => {
            console.error('[TELEMETRY][SHIPPER] Error autosaving queue:', err);
        });
    }

    /**
     * Flushes the current queue to the serverless Cloudflare Workers middleman
     */
    public async flush(): Promise<void> {
        if (!this.enabled || this.isShipping || this.memoryBuffer.size === 0) {
            return;
        }

        this.isShipping = true;
        const payloads = Array.from(this.memoryBuffer.values());
        
        console.log(`[TELEMETRY][SHIPPER] Attempting to ship ${payloads.length} execution traces.`);

        try {
            await this.shipPayloads(payloads);
            
            // On successful transmission, clear the memory buffer and purge the file cache
            this.memoryBuffer.clear();
            if (fsSync.existsSync(this.queueFile)) {
                await fs.unlink(this.queueFile);
            }
            console.log('[TELEMETRY][SHIPPER] Telemetry batch shipped successfully.');
        } catch (error) {
            console.warn('[TELEMETRY][SHIPPER] Failed to ship telemetry, retaining logs locally:', error);
            // Retain the queue in file cache so we retry later
            await this.saveQueueToDisk();
        } finally {
            this.isShipping = false;
        }
    }

    /**
     * Updates the user's opt-in / opt-out state
     */
    public async setTelemetryEnabled(enabled: boolean): Promise<void> {
        this.enabled = enabled;
        if (enabled) {
            this.startFlushTimer();
            await this.loadQueueFromDisk();
        } else {
            this.stopFlushTimer();
            await this.purgeAllData();
        }
    }

    public isTelemetryEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Completely purges all dynamic logging trace records from memory and local storage
     */
    private async purgeAllData(): Promise<void> {
        this.memoryBuffer.clear();
        try {
            if (fsSync.existsSync(this.queueFile)) {
                await fs.unlink(this.queueFile);
            }
        } catch (e) {
            console.error('[TELEMETRY][SHIPPER] Failed to purge telemetry-queue.json:', e);
        }
    }

    /**
     * Load queue items from telemetry-queue.json back into memory map
     */
    private async loadQueueFromDisk(): Promise<void> {
        try {
            if (fsSync.existsSync(this.queueFile)) {
                const dataRaw = await fs.readFile(this.queueFile, 'utf8');
                const list: TelemetryPayload[] = JSON.parse(dataRaw);
                
                if (Array.isArray(list)) {
                    for (const item of list) {
                        const aggKey = `${item.filePath}::${item.functionName}::${item.source}::${item.lineNo || 'null'}`;
                        const existing = this.memoryBuffer.get(aggKey);
                        if (existing) {
                            existing.count += item.count;
                            if (item.lastSeen && (!existing.lastSeen || item.lastSeen > existing.lastSeen)) {
                                existing.lastSeen = item.lastSeen;
                            }
                        } else {
                            this.memoryBuffer.set(aggKey, item);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[TELEMETRY][SHIPPER] Failed to load offline queue:', e);
        }
    }

    /**
     * Saves current memory buffer to telemetry-queue.json file cache
     */
    private async saveQueueToDisk(): Promise<void> {
        if (this.memoryBuffer.size === 0) return;
        try {
            const list = Array.from(this.memoryBuffer.values());
            await fs.writeFile(this.queueFile, JSON.stringify(list, null, 2), 'utf8');
        } catch (e) {
            console.error('[TELEMETRY][SHIPPER] Failed to write offline queue:', e);
        }
    }

    /**
     * Periodically flushes telemetry traces every 15 minutes (or 5 minutes in development mode)
     */
    private startFlushTimer(): void {
        this.stopFlushTimer();
        const intervalMs = process.env.NODE_ENV === 'development' ? 5 * 60 * 1000 : 15 * 60 * 1000;
        this.flushInterval = setInterval(() => {
            this.flush().catch(err => {
                console.error('[TELEMETRY][SHIPPER] Scheduled flush failed:', err);
            });
        }, intervalMs);
    }

    private stopFlushTimer(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
    }

    /**
     * Secure HTTPS request using Node.js standard modules
     */
    private shipPayloads(payloads: TelemetryPayload[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const urlParsed = new URL(this.workerEndpoint);
            const requestData = JSON.stringify({
                app: 'yumeshelf',
                payloads
            });

            const options = {
                hostname: urlParsed.hostname,
                port: urlParsed.port || 443,
                path: urlParsed.pathname + urlParsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestData),
                    'Authorization': `Bearer ${this.clientAppToken}`
                },
                timeout: 10000 // 10s timeout
            };

            const req = https.request(options, (res: http.IncomingMessage) => {
                let responseBody = '';
                res.on('data', (chunk: Buffer | string) => {
                    responseBody += chunk.toString();
                });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Server returned status code ${res.statusCode}: ${responseBody}`));
                    }
                });
            });

            req.on('error', (err: Error) => {
                reject(err);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });

            req.write(requestData);
            req.end();
        });
    }
}

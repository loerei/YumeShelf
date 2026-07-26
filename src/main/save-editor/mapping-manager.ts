import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { app } from 'electron';

export interface MappingEntry {
    name: string;
    offset: number;
    dataType: string;
}

export default class SaveMappingManager {
    gameId: string;
    mappingDir: string;
    mappingPath: string;
    mappings!: { variables: MappingEntry[] };

    constructor(gameId: string) {
        this.gameId = gameId;
        const userDataPath = app?.getPath ? app.getPath('userData') : path.join(os.tmpdir(), 'yumeshelf', 'userData');
        this.mappingDir = path.join(userDataPath, 'save-mappings');
        this.mappingPath = path.join(this.mappingDir, `${this.gameId}.json`);
        this.load();
    }

    load(): void {
        if (!fs.existsSync(this.mappingDir)) {
            fs.mkdirSync(this.mappingDir, { recursive: true });
        }
        if (fs.existsSync(this.mappingPath)) {
            try {
                this.mappings = JSON.parse(fs.readFileSync(this.mappingPath, 'utf8'));
            } catch {
                this.mappings = { variables: [] };
            }
        } else {
            this.mappings = { variables: [] };
        }
    }

    save(): void {
        fs.writeFileSync(this.mappingPath, JSON.stringify(this.mappings, null, 2));
    }

    addMapping(name: string, offset: number, dataType = 'int32'): void {
        this.mappings.variables.push({ name, offset, dataType });
        this.save();
    }
}

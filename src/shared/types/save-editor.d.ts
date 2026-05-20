// @ts-nocheck
export interface GamePaths {
    exeDir: string;
    saveDir: string;
    dataDir: string;
    langDataDir: string | null;
    engine: string;
}

export interface SaveMetadata {
    variables: any[];
    switches: any[];
    items: Record<string, { name: string; description: string; iconIndex: number }>;
    weapons: Record<string, { name: string; description: string; iconIndex: number }>;
    armors: Record<string, { name: string; description: string; iconIndex: number }>;
    gameTitle: string;
}

export interface SaveDataResult {
    data: any; // Raw JSON payload
    metadata: SaveMetadata;
}

export interface SaveFormat {
    match: (fileName: string) => boolean;
    decode: (rawData: Buffer, paths: GamePaths, fileName: string) => Promise<any>;
    encode: (jsonData: any, paths: GamePaths, fileName: string) => Promise<Buffer>;
    metadata?: (jsonData: any, paths: GamePaths, fileName: string) => Promise<SaveMetadata>;
}

export interface SaveEditorEngine {
    detect: (saveData: any) => boolean;
    extractRoot: (save: any) => any;
    getTabs?: (root: any, translations: any) => Array<{ id: string; label: string; i18n?: string }> | null;
    getProp: (obj: any, prop: string) => any;
    findGold: (root: any, party: any) => { obj: any; key: string; val: any } | null;
    extractData: (obj: any) => any;
}

export interface SearchOptions {
    query: string;
    exact: boolean;
    searchName: boolean;
    searchValue: boolean;
    searchIndex: boolean;
    switchOnlyTrue: boolean;
    switchOnlyFalse: boolean;
}


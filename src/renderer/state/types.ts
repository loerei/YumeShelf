export interface DragTargetInfo {
    id?: string;
    type?: string;
}

export interface GameInstance {
    gameId?: string;
    gameKey?: string;
    folderName?: string;
    exePath?: string;
    favorite?: boolean;
    relativePath?: string;
    relativePathDisplay?: string;
    relativePathFullDisplay?: string;
    fullLocationLabel?: string;
    locationLabel?: string;
    parentLocationLabel?: string;
    [key: string]: any;
}

export interface GameEntry extends GameInstance {
    instances?: GameInstance[];
    primaryInstance?: GameInstance | null;
    categoryIds?: string[];
    isRunning?: boolean;
}

export interface CategoryNode {
    id: string;
    name: string;
    gameCount?: number;
    [key: string]: any;
}

export interface StoreState {
    allGames: GameEntry[];
    categoryTree: CategoryNode[];
    activeCategoryId: string | null;
    currentLibraryConfig: any;
    draggedGameFolder: string | null;
    dragTargetInfo: DragTargetInfo | null;
    currentSort: string;
}

export type StoreListener<K extends keyof StoreState> = (value: StoreState[K]) => void;

export interface CentralStore {
    getAllGames(): GameEntry[];
    setAllGames(games: GameEntry[]): void;
    getCategoryTree(): CategoryNode[];
    setCategoryTree(tree: CategoryNode[]): void;
    getActiveCategoryId(): string | null;
    setActiveCategoryId(value: string | null): void;
    getCurrentLibraryConfig(): any;
    setCurrentLibraryConfig(config: any): void;
    getDraggedGameFolder(): string | null;
    setDraggedGameFolder(value: string | null): void;
    getDragTargetInfo(): DragTargetInfo | null;
    setDragTargetInfo(value: DragTargetInfo | null): void;
    getCurrentSort(): string;
    setCurrentSort(value: string): void;
    
    // Pub/Sub API
    subscribe<K extends keyof StoreState>(key: K, listener: StoreListener<K>): () => void;
}

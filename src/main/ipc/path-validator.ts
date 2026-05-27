import * as path from 'path';

/**
 * Validates whether the targetPath is strictly inside the resolved libraryPath.
 * Standardizes paths, resolves absolute paths, and checks that targetPath is a child of libraryPath.
 */
export function isPathWithinLibrary(targetPath: string, libraryPath: string): boolean {
    if (!targetPath || !libraryPath) return false;
    try {
        const resolvedTarget = path.resolve(targetPath);
        const resolvedLib = path.resolve(libraryPath);
        
        // Prevent directory traversal escape using path.relative
        const relative = path.relative(resolvedLib, resolvedTarget);
        
        // If relative is empty, it means targetPath is equal to libraryPath
        // Otherwise, it must not start with '..' and must not be absolute
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    } catch {
        return false;
    }
}

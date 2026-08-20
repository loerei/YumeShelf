const GENERIC_TITLE_BLOCKLIST = new Set([
    'game',
    'game.exe',
    'game.x86_64',
    'game.sh',
    'start.sh',
    'run.sh',
    'launch.sh',
    'apprun',
    'nwjs',
    'nw.js',
    'unity',
    'unity player',
    'godot',
    'godot engine',
    'main',
    'app',
    'application',
    'rmmz-game',
    'rmmv-game',
    'electron',
    'default',
    'my game',
    'test',
    'untitled',
    'rpg maker mv',
    'rpg maker mz'
]);

export function isGenericOrEmptyTitle(title: string | null | undefined): boolean {
    if (!title || typeof title !== 'string') return true;
    const normalized = title.trim().toLowerCase();
    if (!normalized) return true;
    return GENERIC_TITLE_BLOCKLIST.has(normalized);
}

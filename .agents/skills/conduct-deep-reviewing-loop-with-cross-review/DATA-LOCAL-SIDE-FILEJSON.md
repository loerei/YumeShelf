# Local File-Based JSON Schema and Persistence Safety

Audits desktop and CLI configuration persistence, atomic swaps, and schema validation.

## Domain Audit Checklist

* [ ] Atomic Sibling Replacement: Verify file updates write to a temporary sibling file, flush to physical disk (`fsync`), and atomically replace target via `rename`.
* [ ] Monotonic Version Envelope: Confirm JSON documents wrap payloads in an envelope containing an integer `schemaVersion`.
* [ ] Sequential Boot Migrations: Ensure migrations execute linearly (V1​→V2​→V3​) in an isolated runner before domain code consumes configuration data.
* [ ] Clean Read Invariants: Verify domain loaders consume exclusively canonical schema types without runtime fallback property sniffing (`if ('legacy' in obj)`).
* [ ] Corrupt File Quarantine: Confirm parsing exceptions (`SyntaxError`) trigger backup archiving of the malformed file before creating a fresh configuration.

## Concrete Anti-Patterns

### Anti-Pattern 1: Direct In-Place File Writing

```typescript

// BAD: In-place write truncates file first; crash leaves empty 0-byte file.
import * as fs from 'fs';
export function updateConfig(data: Record<string, unknown>): void {
fs.writeFileSync('/home/user/.app/config.json', JSON.stringify(data));
}

// GOOD: Sibling write, fsync flush, and atomic filesystem rename.
import * as fs from 'fs';
import * as path from 'path';

export function updateConfigAtomic(configPath: string, data: Record<string, unknown>): void {
const tempPath = path.join(path.dirname(configPath), `.tmp-${Date.now()}`);
const fd = fs.openSync(tempPath, 'w');
try {
fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf-8');
fs.fsyncSync(fd);
} finally {
fs.closeSync(fd);
}
fs.renameSync(tempPath, configPath);
}

```
## Failure Modes & Mitigations

- Truncation on Crash: System power loss during `writeFileSync` empties configuration. Mitigate by writing to temporary sibling files and using atomic `renameSync`.
- Combinatorial Sniffing Explosion: Adding fallback property checks across domain models creates exponential verification branches. Mitigate by running linear migration loops at boot.

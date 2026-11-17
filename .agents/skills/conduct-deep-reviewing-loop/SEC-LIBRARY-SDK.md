# Library and SDK Security: Credential Encapsulation, Prototype Pollution, and Parser Bounds

Audits secret encapsulation, prototype pollution defenses, untrusted graph/binary parser bounds, pre-decode sanitization, and supply-chain hygiene in libraries and SDKs.

## Domain Audit Checklist

### 1. Explicit Credential Injection & Private Field Encapsulation
- [ ] **No Silent `process.env` Credential Sniffing**: Libraries MUST NOT silently read `process.env` inside internal functions or default parameters. Require explicit credential passing (`new Client({ apiKey })`) or an explicit opt-in static factory (`Client.fromEnv()`).
- [ ] **True Private Storage (`#apiKey`)**: Store credentials in hard private class fields (`#apiKey` in JS/TS) or closures rather than public/TypeScript-`private` properties so `Object.keys(client)`, `{...client}`, and `JSON.stringify(client)` cannot exfiltrate secrets.

### 2. Prototype Pollution Defense in Config & Payload Merging
- [ ] **Safe Recursive Merge / Object Creation**: If the library deep-merges caller options or parses dynamic key-value structures, explicitly reject keys matching `__proto__`, `constructor`, and `prototype` (or validate through strict Zod/TypeBox schemas / `Object.hasOwn`).

### 3. Public Parser Ceilings, Graph Cycle Guards & Canonicalization Order
- [ ] **Pre-Parse Input & Step Ceilings**: Public library functions parsing strings, headers, URLs, markup, or binary buffers MUST enforce configurable `maxInputLength`, `maxDepth`, and `maxIterations`/`maxNodes` ceilings (with periodic `AbortSignal` checks) before executing regexes, bytecode/state-machine loops, or recursive AST traversal.
- [ ] **Three-Color Graph & Offset Traversal (`activeStack` vs. `memoCache`)**: When traversing formats with internal pointers, offset tables, or object references (JSON `$ref`, binary object tables, ASTs), track the current recursion chain in an `activeStack: Set` (to reject cyclic self-references immediately) separately from a `memoCache: Map` (to allow valid shared DAG references), and validate 64-bit offsets against `Number.MAX_SAFE_INTEGER` and buffer bounds (`offset < 0 || offset + len > buf.length`) before slicing.
- [ ] **Canonicalize Before Sanitize (Pre-Decode Byte & Entity Unmasking)**: When sanitizing untrusted markup, SVG, XML, or paths, reject null bytes (`0x00`) and unexpected UTF-16 BOMs (`0xFEFF`/`0xFFFE`) on the raw buffer *before* UTF-8 decoding (preventing multi-byte encoding bypasses), and decode numeric/hex character entities (`&#x...;`, `%XX`) *before* matching security blocklists (decoding `&amp;` last to defeat double-encoding unmasking).
- [ ] **Linear-Time Regex Guarantee**: Reject ambiguous nested quantifiers (`(a+)+`) on public library inputs to prevent a single malformed caller string from freezing the host application's thread.

### 4. Supply-Chain & Install Script Hygiene
- [ ] **Ban Unnecessary `postinstall` Scripts**: Avoid `preinstall`/`postinstall` shell scripts in published packages unless required for verified native binary prebuilds.
- [ ] **Minimal Runtime Dependency Surface**: Prefer native runtime APIs (`node:crypto`, `fetch`, `URL`, `TextEncoder`) over pulling transitive third-party utility packages.

## Concrete Anti-Patterns

### Anti-Pattern 1: Prototype Pollution in `mergeOptions` & Cyclic Pointer Loop in Graph Parser

```typescript
// BAD:
// 1. Recursive merge copies "__proto__", polluting Object.prototype globally!
// 2. Recursive offset/node parser lacks activeStack cycle check, hanging or overflowing stack on cyclic ref (0 -> 1 -> 0).
function parseNodeBad(id: number, nodes: Map<number, { children: number[] }>): unknown {
  const node = nodes.get(id);
  return node?.children.map((childId) => parseNodeBad(childId, nodes)); // Infinite recursion on cycle!
}

// GOOD: Separate activeStack (cycle detection) from memoCache (DAG sharing) + enforce maxDepth
const MAX_DEPTH = 64;

export function parseNodeSafe(
  id: number,
  nodes: Map<number, { children: number[] }>,
  activeStack = new Set<number>(),
  memoCache = new Map<number, unknown>(),
  depth = 0
): unknown {
  if (depth > MAX_DEPTH) throw new Error("Max recursion depth exceeded");
  if (activeStack.has(id)) throw new Error(`Cyclic reference detected at node ${id}`);
  if (memoCache.has(id)) return memoCache.get(id);

  activeStack.add(id);
  try {
    const node = nodes.get(id);
    const parsed = node?.children.map((childId) =>
      parseNodeSafe(childId, nodes, activeStack, memoCache, depth + 1)
    );
    memoCache.set(id, parsed);
    return parsed;
  } finally {
    activeStack.delete(id);
  }
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **Host Process RCE / Auth Bypass via Prototype Pollution** | Library deep-merges caller-supplied JSON options without filtering `__proto__` / `constructor`. | Filter `["__proto__", "constructor", "prototype"]` in all recursive merge/clone helpers or parse via strict schema. |
| **Stack Overflow / Infinite Loop on Malformed Graph/Binary** | Parser traverses cyclic object references (`A -> B -> A`) or unchecked 64-bit offsets. | Track `activeStack: Set` alongside `memoCache: Map`, cap `maxDepth`, and bounds-check every buffer offset. |
| **Sanitizer Bypass via UTF-16 BOM or Entity Encoding** | Regex blocklist runs before numeric entity decoding (`&#x3c;script`) or after UTF-16 BOM trickery. | Reject null bytes / UTF-16 BOM on raw bytes first; decode numeric entities before scanning (and `&amp;` last). |
| **API Key Leaked in Host App Telemetry** | Host app serializes `sdkClient` instance using `JSON.stringify`, exposing `private apiKey`. | Store sensitive credentials in ECMAScript `#private` fields or WeakMaps. |

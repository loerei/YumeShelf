# Universal Security Invariants

Covers cryptographic primitives, secret storage hygiene, and fail-fast input boundary parsing across all application architectures.

## Domain Audit Checklist (OWASP ASVS Alignment)

### 1. Cryptographic Primitives & Passwords
- [ ] **Password Hashing**: Passwords MUST be hashed using memory-hard cryptographic algorithms: Argon2id (memory >= 64MB, iterations >= 3) or bcrypt (cost factor >= 12) with cryptographically secure random salts. Reject MD5, SHA1, SHA256, or unsalted hashing algorithms.
- [ ] **JWT Verification**: Cryptographic signature validation MUST enforce an explicit algorithm allowlist (`RS256`, `EdDSA`). Reject `alg: "none"` and symmetric algorithm confusion attacks (`HS256` verified using an asymmetric public key).
- [ ] **Entropy & Nonce Generation**: Random tokens, session IDs, and cryptographic nonces MUST use cryptographically secure pseudorandom number generators (CSPRNG, e.g. `crypto.randomBytes`, `getrandom`). Reject `Math.random()`.

### 2. Secret Hygiene & Redaction
- [ ] **Zero Hardcoded Secrets**: Source code and repository files MUST NOT contain private API keys, database passwords, signing secrets, or private certificates. Bind secrets via runtime environment variables or external secret managers.
- [ ] **Log & Error Redaction**: Authentication tokens, raw passwords, payment card numbers, and sensitive PII MUST be masked or stripped before emission to logs, diagnostics, or client-facing error responses.

### 3. Fail-Fast Boundary Parsing & Injection Prevention
- [ ] **Schema Ingress Validation**: All untrusted external inputs MUST be parsed and strictly validated against explicit structural schemas (e.g. Zod, Pydantic, TypeBox) at system ingress before consumption by business logic.
- [ ] **SQL Parameterization**: All database queries MUST use parameterized statements or type-safe ORM query builders. Reject string interpolation, concatenation, or raw unescaped fragments.
- [ ] **Path Traversal Prevention**: File access routines MUST normalize paths (`path.resolve`) and verify that the target path remains strictly within the intended root directory before performing filesystem reads or writes.

---

## Concrete Anti-Patterns

### Anti-Pattern 1: Dynamic JWT Algorithm Selection from Untrusted Header

```javascript
// BAD: Dynamically trusting algorithm declared in JWT header allows signature bypass via 'none'
const jwt = require('jsonwebtoken');

function verifyToken(token, secretKey) {
  const decoded = jwt.decode(token, { complete: true });
  return jwt.verify(token, secretKey, { algorithms: [decoded.header.alg] });
}

// GOOD: Enforce explicit cryptographic algorithm allowlist
function verifyToken(token, publicKey) {
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
}
```

### Anti-Pattern 2: Path Traversal via Unvalidated File Path Joining

```javascript
// BAD: Joining untrusted input permits directory traversal escapes (e.g. '../../etc/passwd')
const path = require('path');
const fs = require('fs/promises');

async function readUserAsset(baseDir, userInput) {
  const target = path.join(baseDir, userInput);
  return fs.readFile(target, 'utf8');
}

// GOOD: Normalize path and assert root boundary containment
async function readUserAsset(baseDir, userInput) {
  const safeBase = path.resolve(baseDir);
  const target = path.resolve(safeBase, userInput);
  if (!target.startsWith(safeBase + path.sep)) {
    throw new Error('Access denied: path traversal detected');
  }
  return fs.readFile(target, 'utf8');
}
```

---

## Failure Modes & Mitigations

| Failure Mode | Root Mechanism | Required Mitigation |
| :--- | :--- | :--- |
| **Algorithm Confusion Bypass** | Verifier accepts attacker-controlled `alg` header (e.g. `none` or `HS256` with public key). | Hardcode algorithm allowlist `algorithms: ['RS256']` in verification options. |
| **Path Traversal Read/Write** | File utilities concatenate relative path components containing `..` or leading `/`. | Resolve absolute path and verify prefix containment against `safeBase + path.sep`. |
| **Credential Leak in Logs** | Logging raw request payloads or error dumps containing sensitive attributes. | Sanitize payloads using explicit field-level redaction filters before writing logs. |

# Client-Side Credentials & Secrets Hygiene

Covers client-side secret management, frontend build-time asset hygiene, and credential storage at rest for desktop, web, and local applications.

## Domain Audit Checklist

### 1. Client Bundle Secrets Hygiene
- [ ] **No Inlined Private Secrets**: Build-time environment variable prefixes (`VITE_*`, `NEXT_PUBLIC_*`, `REACT_APP_*`, `EXPO_PUBLIC_*`) MUST NEVER be assigned private API keys, database connection strings, payment secret keys (e.g. Stripe secret), signing keys, or service-role credentials.
- [ ] **Frontend Env Audit**: Verify that all variables bundled into client code contain only public, non-sensitive configuration (e.g. public API host URL, public analytics key, publishable payment key).
- [ ] **Decoupled Backend Proxying**: Private third-party integrations requiring service credentials MUST execute through a trusted backend or proxy endpoint, never directly from client code.

### 2. Local Credential Storage at Rest
- [ ] **OS Keychain Protection**: Desktop and native client applications MUST persist long-lived session tokens, refresh tokens, private keys, and master passwords using operating system credential facilities:
  - macOS: Keychain Services
  - Windows: Data Protection API (DPAPI) via `safeStorage`
  - Linux: Secret Service API (`libsecret`)
- [ ] **Ban Plaintext Local Storage**: MUST NOT store unencrypted sensitive credentials in browser `localStorage`, `sessionStorage`, cookies lacking `HttpOnly; Secure; SameSite`, unencrypted SQLite databases, or plaintext configuration files (`config.json`).

---

## Concrete Anti-Patterns

### Anti-Pattern 1: Leaking Service-Role Credentials in Client Build Environment

```typescript
// BAD: Vite build-time inlining embeds service secret directly into production JavaScript bundle
// .env:
// VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (Full admin database bypass key!)

import { createClient } from '@supabase/supabase-js';

// Client-side code:
export const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY // Completely readable in browser DevTools
);

// GOOD: Use public anon key on client with RLS; keep service-role key strictly on server
// Client-side code (.env: VITE_SUPABASE_ANON_KEY=eyJhbGci...):
export const supabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### Anti-Pattern 2: Storing Plaintext Session Tokens in Electron Local Files

```javascript
// BAD: Writing session token to plaintext JSON file in user data folder
const fs = require('fs/promises');
const path = require('path');

async function saveAuthSession(appDataDir, sessionToken) {
  const filePath = path.join(appDataDir, 'session.json');
  await fs.writeFile(filePath, JSON.stringify({ token: sessionToken }), 'utf8');
}

// GOOD: Encrypt token at rest using Electron safeStorage (OS Keychain / DPAPI)
const { safeStorage } = require('electron');
const fs = require('fs/promises');
const path = require('path');

async function saveAuthSession(appDataDir, sessionToken) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS native credential encryption unavailable');
  }
  const encryptedBuffer = safeStorage.encryptString(sessionToken);
  const filePath = path.join(appDataDir, 'session.enc');
  await fs.writeFile(filePath, encryptedBuffer);
}
```

---

## Failure Modes & Mitigations

| Failure Mode | Root Mechanism | Required Mitigation |
| :--- | :--- | :--- |
| **Service Key Exfiltration via Bundle** | Private secret prefixed with `VITE_*` / `NEXT_PUBLIC_*` inlined into static JS assets. | Strip client prefix. Route operations requiring secret through server API proxy. |
| **Local Credential Extraction** | Plaintext tokens in `localStorage` or unencrypted JSON readable by malware or local users. | Encrypt credentials at rest via native OS Keychain / DPAPI (`safeStorage`). |
| **Cookie Session Theft via XSS** | Session tokens saved in client-accessible storage or cookies without `HttpOnly`. | Issue authentication cookies with `HttpOnly; Secure; SameSite=Lax/Strict`. |

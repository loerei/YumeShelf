# 03 — Credential Vault & Secure Main-to-Renderer IPC

## Epic
PRD 04: Community Add-on Marketplace, Task Runner & Cascading Tool Manager

## What to build
The `CredentialVaultService` managing encrypted credential storage under `userData/credentials.enc`, binary format header `[YSCR]`, fallback AES-256-GCM encryption, dependency injection seams, atomic write-and-replace persistence, and secure Main-to-Renderer IPC contracts exposed on `window.electronAPI`.

## Explicit Assumptions & Boundaries
- Sensitive credentials (API keys, VIP tokens) are encrypted on disk and NEVER logged, persisted in plaintext, or transmitted across IPC in cleartext without user action.

## Blocked by
- None (Standalone Security Module)

## Status
ready-for-agent

## Acceptance criteria
- [ ] Implement `CredentialVaultService` under `src/main/security/credential-vault.ts`, supporting optional `safeStorageProvider?: typeof safeStorage`, `credentialsFilePath?: string`, and `machineIdProvider?: () => string` in constructor for headless testing.
- [ ] Implement binary file format header for `userData/credentials.enc`:
  - `[magic 4B 'YSCR'][version 1B 0x01][mode 1B 0x01=safeStorage | 0x02=aes-gcm][salt 32B (if aes-gcm)][iv 12B (if aes-gcm)][tag 16B (if aes-gcm)][ciphertext]`.
- [ ] Implement primary encryption using Electron `safeStorage` (Windows DPAPI / Linux Secret Service).
- [ ] Implement fallback AES-256-GCM encryption:
  - Generate fresh 12-byte random IV (`crypto.randomBytes(12)`).
  - Derive key via PBKDF2 (HMAC-SHA256, 32-byte salt, $\ge 100,000$ iterations) using local machine ID.
  - Serialize to binary layout format with magic header `YSCR`.
- [ ] Implement decryption, GCM authentication tag verification, and typed `CredentialDecryptionError` handling when corrupted data or wrong key is encountered, managing multi-tool decrypted dictionary `DecryptedCredentialStore = Record<string, Record<string, string>>` with upsert/delete operations per `addonId`.
- [ ] Implement atomic write-and-replace (`.tmp` -> `fsync` -> `rename`) for saving `userData/credentials.enc`, enforcing POSIX file permissions `mode: 0o600` (read/write by owner only) and retry backoff for Windows file lock contention (`EPERM`/`EBUSY`).
- [ ] Implement secure Main-to-Renderer IPC handlers with strict payload validation:
  - `getCredentialStatus(addonId)`: Returns `{ isConfigured: boolean; maskedValue?: string }` without leaking plaintext secrets.
  - `setCredentials(addonId, credentials)`: Validates payload size ($\le 4\text{KB}$) and securely encrypts.
  - `testCredential(addonId, credentials)`: Invokes test routine in Main process and returns `{ ok: boolean; message: string }`.
- [ ] Expose credential IPC channels (`credential:get-status`, `credential:set`, `credential:delete`, `credential:test`) on `window.electronAPI` in `src/preload.ts` and declare typed signatures in `src/shared/types/ipc.d.ts`.
- [ ] Unit tests verifying binary `YSCR` header parsing, primary `safeStorage` encryption, AES-256-GCM fallback encryption/decryption, tampered ciphertext authentication tag failure, atomic persistence, and masked credential status queries.
- [ ] Execute automated unit tests via `npm run test:node -- tests/credential-vault.test.js`.

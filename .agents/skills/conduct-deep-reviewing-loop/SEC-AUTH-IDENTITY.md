# Security Subdocument: Identity, Authentication & Session Integrity

## Domain Audit Checklist (OWASP ASVS V2 & V3 Alignment)

### 1. Authentication & Multi-Factor Controls
- [ ] MFA Enforcement: Verify that MFA mechanisms (FIDO2/WebAuthn, TOTP) are required for all administrative access and sensitive actions. Reject SMS or email-based recovery as primary security factors.
- [ ] Credential Storage: Confirm passphrases are hashed using Argon2id, bcrypt, or PBKDF2 with unique salts and sufficient cost factors.

### 2. Session Token Lifecycle & Cryptography
- [ ] JWT Signature Verification: Confirm server-side JWT parsing strictly enforces expected algorithms (e.g., `RS256`). Reject `alg: "none"` or symmetric algorithm confusion attacks (`HS256` signed with public key).
- [ ] Session Binding & Expiry: Ensure session tokens implement explicit idle (e.g., 15 mins) and absolute timeouts (e.g., 12 hours).

### 3. Cookie & Transport Protections
- [ ] Secure Cookie Flags: Confirm all authentication cookies set `Secure`, `HttpOnly`, and `SameSite=Strict` or `SameSite=Lax` flags.

## Concrete Anti-Patterns

### Anti-Pattern 1: Unvalidated JWT Algorithm Header

```javascript
// BAD: Dynamically pulling algorithm from JWT header allows signature bypass via 'none'.
const jwt = require('jsonwebtoken');

function verifyToken(token) {
  const decodedHeader = jwt.decode(token, { complete: true }).header;
  // VULNERABLE: Attacker can set header.alg = 'none' or 'HS256' using RSA public key!
  return jwt.verify(token, secretOrPublicKey, { algorithms: [decodedHeader.alg] });
}

// GOOD: Explicitly whitelist expected server-enforced algorithms.
function verifyToken(token) {
  return jwt.verify(token, process.env.PUBLIC_KEY, { algorithms: ['RS256'] });
}
```

## Failure Modes & Mitigations

- Session Hijacking via XSS Token Theft: Store authentication tokens in `HttpOnly` cookies rather than `localStorage` or `sessionStorage`.
- Brute-Force Password Guessing: Implement rate limiting and IP/account throttling with exponential lockout delays.

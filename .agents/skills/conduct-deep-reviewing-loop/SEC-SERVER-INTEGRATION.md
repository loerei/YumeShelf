# Server-Side Integrations: Webhooks, SSRF & CORS

Covers inbound webhook cryptographic verification, outbound Server-Side Request Forgery (SSRF) defenses, and Cross-Origin Resource Sharing (CORS) hardening.

## Domain Audit Checklist

### 1. Inbound Webhook Signature Verification
- [ ] **Raw Byte Buffer Computation**: Inbound webhook verification MUST compute cryptographic HMAC signatures over the unmodified raw request byte buffer (`express.raw({ type: 'application/json' })`). NEVER verify signatures over parsed, re-serialized JSON (`JSON.stringify(req.body)` breaks whitespace, float formatting, and key order).
- [ ] **Constant-Time Comparison**: Signature equality MUST use constant-time cryptographic comparison (`crypto.timingSafeEqual`). Reject variable-time equality operators (`===`, `==`), which leak timing side-channels.
- [ ] **Replay Protection**: Verify webhook timestamp headers against current server time with an explicit tolerance window (e.g. +/- 300 seconds).

### 2. Server-Side Request Forgery (SSRF) Prevention
- [ ] **IP Allowlisting & Private Subnet Blocking**: Outbound HTTP requests to user-supplied URLs MUST resolve DNS and assert destination IP addresses before socket connection. Explicitly block:
  - Loopback addresses: `127.0.0.0/8`, `::1`
  - RFC 1918 private subnets: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
  - Link-local and cloud metadata endpoints: `169.254.169.254`, `fd00::/8`
- [ ] **DNS Rebinding Protection**: Verify that resolved IP is checked at socket connection time, or route outbound requests through a dedicated hardened egress proxy (e.g. Smokescreen).
- [ ] **Protocol Whitelisting**: Restrict outbound URL schemes strictly to `https:` (and optionally `http:`). Block `file:`, `gopher:`, `dict:`, `ftp:`, `ldap:`.

### 3. CORS Hardening
- [ ] **No Wildcard with Credentials**: NEVER set `Access-Control-Allow-Origin: *` when `Access-Control-Allow-Credentials: true` is enabled.
- [ ] **Strict Origin Allowlisting**: Validate incoming `Origin` headers against an explicit, trusted domain allowlist. Reject echoing untrusted `Origin` headers back to client without validation.

---

## Concrete Anti-Patterns

### Anti-Pattern 1: Webhook Re-Serialization and Variable-Time Comparison

```javascript
// BAD: Re-serializing JSON causes HMAC mismatch and variable-time equality leaks timing
const crypto = require('crypto');

app.post('/api/webhook', express.json(), (req, res) => {
  const signature = req.headers['x-signature'];
  const expected = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(req.body)) // Flawed: JSON formatting differences alter HMAC
    .digest('hex');

  if (signature === expected) { // Vulnerable to timing attack
    processEvent(req.body);
    return res.sendStatus(200);
  }
  return res.status(401).send('Invalid signature');
});

// GOOD: Verify HMAC over raw byte buffer using constant-time comparison
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-signature'];
  if (!signature) return res.status(401).send('Missing signature');

  const expected = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(req.body) // req.body is raw Buffer
    .digest('hex');

  const sigBuffer = Buffer.from(signature, 'hex');
  const expBuffer = Buffer.from(expected, 'hex');

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return res.status(401).send('Invalid signature');
  }

  const payload = JSON.parse(req.body.toString('utf8'));
  processEvent(payload);
  return res.sendStatus(200);
});
```

### Anti-Pattern 2: SSRF via Direct Fetch of User-Supplied Webhook/Avatar URL

```javascript
// BAD: Fetching user-supplied URL directly accesses internal metadata and private network
app.post('/api/fetch-avatar', async (req, res) => {
  const { avatarUrl } = req.body;
  // Attacker supplies: "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
  const response = await fetch(avatarUrl);
  const data = await response.buffer();
  return res.send(data);
});

// GOOD: Validate URL protocol and assert destination IP is public before fetching
const ipaddr = require('ipaddr.js');
const dns = require('dns/promises');

async function safeFetchPublicUrl(targetUrl) {
  const parsed = new URL(targetUrl);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Disallowed scheme');
  }

  const addresses = await dns.resolve(parsed.hostname);
  for (const addr of addresses) {
    const ip = ipaddr.parse(addr);
    const range = ip.range();
    if (['loopback', 'private', 'linkLocal', 'carrierGradeNat'].includes(range) || addr === '169.254.169.254') {
      throw new Error(`SSRF blocked: address ${addr} resolves to private range ${range}`);
    }
  }

  return fetch(parsed.href);
}
```

---

## Failure Modes & Mitigations

| Failure Mode | Root Mechanism | Required Mitigation |
| :--- | :--- | :--- |
| **Forged Webhook Acceptance** | Attacker computes valid HMAC for modified body or exploits variable-time timing leak. | Ingest raw byte buffer and verify via `crypto.timingSafeEqual`. |
| **Cloud IAM Metadata Exfiltration (SSRF)** | Server fetches user URL resolving to `169.254.169.254`, dumping cloud credentials. | Resolve DNS and reject loopback/private/link-local IP addresses. |
| **Credential Theft via Permissive CORS** | Wildcard or echoed origin with credentials allows malicious third-party site to steal data. | Whitelist exact allowed origins; never pair `*` with credentials. |

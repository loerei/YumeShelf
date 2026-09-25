# Server-Side Ingress Abuse & Bot Mitigation

Covers public unauthenticated endpoints, automated bot mitigation, registration abuse, rate limiting, and resource exhaustion defenses across web and API servers.

## Domain Audit Checklist

### 1. Bot Mitigation & Registration Abuse
- [ ] **Automated Bot Challenge**: Public unauthenticated write endpoints (account registration, password reset, contact forms, lead capture, invite dispatch) MUST integrate automated bot mitigation (Cloudflare Turnstile, reCAPTCHA v3, or cryptographic proof-of-work). Reject unverified public registration forms.
- [ ] **Tiered Rate Limiting**: Enforce tiered sliding-window rate limiters across multiple dimensions:
  - Per IP / Subnet (e.g. max 5 registrations/hour per IP).
  - Per Targeted Identity (e.g. max 3 password reset requests/hour per email).
  - Global endpoint velocity limits.
- [ ] **Verification Gate Before Resource Allocation**: Critical resources (sending transactional emails, provisioning background worker jobs, database tenant creation) MUST require verified email / phone ownership before execution.

### 2. Resource Consumption & DoS Prevention
- [ ] **Payload Size Bounds**: Enforce strict payload body size limits on all API routes (e.g. `express.json({ limit: '100kb' })`). Reject unconstrained request body ingestion.
- [ ] **GraphQL Query Depth & Complexity Limits**: GraphQL APIs MUST enforce query depth limiting (maximum 5-7 levels for public APIs) and query complexity analysis before query execution. Reject nested recursive query attacks.
- [ ] **Unbounded Batching Prevention**: Reject arbitrary client-controlled array batch sizes in request payloads. Enforce explicit batch ceilings (e.g. maximum 50 items per bulk request).

---

## Concrete Anti-Patterns

### Anti-Pattern 1: Unprotected Public Registration Allowing Automated Spam Creation

```typescript
// BAD: Public registration route with zero bot challenge or IP rate limiting
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  // Attacker runs automated loop via Postman/curl, generating 100,000 dummy accounts
  const user = await db.users.create({ data: { email, passwordHash: await hash(password) } });
  await sendWelcomeEmail(user.email); // Depletes third-party email quota & floods database
  return res.status(201).json({ success: true });
});

// GOOD: Enforce Turnstile token verification and sliding-window rate limiting
import { rateLimit } from 'express-rate-limit';

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 registration attempts per hour
  message: { error: 'Too many accounts created from this IP, please try again later' }
});

app.post('/api/auth/register', registrationLimiter, async (req, res) => {
  const { email, password, turnstileToken } = req.body;

  // Verify Cloudflare Turnstile token with vendor API
  const verified = await verifyTurnstile(turnstileToken, req.ip);
  if (!verified) {
    return res.status(403).json({ error: 'Bot challenge verification failed' });
  }

  const user = await createPendingUser(email, password);
  await sendVerificationEmail(user.email); // Requires email confirmation before account activates
  return res.status(201).json({ message: 'Verification link sent' });
});
```

### Anti-Pattern 2: Unbounded Nested GraphQL Query DoS

```graphql
# BAD: Unconstrained GraphQL query depth crashes server via exponential database joins
query MaliciousDepthAttack {
  user {
    posts {
      author {
        posts {
          author {
            posts {
              author {
                posts {
                  id
                }
              }
            }
          }
        }
      }
    }
  }
}
```

```typescript
// GOOD: Enforce query depth limiter in GraphQL server configuration
import depthLimit from 'graphql-depth-limit';
import { ApolloServer } from '@apollo/server';

const server = new ApolloServer({
  schema,
  validationRules: [depthLimit(5)] // Rejects queries exceeding 5 levels of nesting
});
```

---

## Failure Modes & Mitigations

| Failure Mode | Root Mechanism | Required Mitigation |
| :--- | :--- | :--- |
| **Registration Flooding** | Public form scripts account creation without CAPTCHA or rate limits. | Integrate Cloudflare Turnstile / reCAPTCHA + IP/email rate limiting. |
| **Server Crash via Nested Query** | GraphQL schema permits infinite self-referencing relationship traversal. | Configure query depth limiter (`depthLimit(5)`) and cost analysis. |
| **Service Quota Depletion** | Unrestricted triggers send third-party SMS or emails on unauthenticated routes. | Throttle email dispatch per recipient and require CAPTCHA before send. |

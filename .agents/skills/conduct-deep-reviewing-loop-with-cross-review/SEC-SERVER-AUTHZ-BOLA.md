# Server-Side Authorization: BOLA & BOPLA

Covers Broken Object Level Authorization (BOLA / IDOR), Broken Object Property Level Authorization (BOPLA / Mass Assignment), and Over-Fetching across REST, GraphQL, and gRPC endpoints.

## Domain Audit Checklist

### 1. Broken Object Level Authorization (BOLA / IDOR)
- [ ] **Tenant-Scoped Persistence Queries**: Every endpoint accessing or modifying resources by identifier (`:id`, `:slug`) MUST include tenant / owner ownership predicates in the persistence query (`WHERE id = :id AND org_id = :authenticated_org_id`).
- [ ] **No Naked Primary Key Lookups**: NEVER query resources solely by primary key (`findById(id)`) followed by a separate in-memory check without strict transaction isolation, and NEVER assume UUIDs eliminate the need for authorization checks.
- [ ] **Hierarchical Seam Validation**: In nested routes (e.g. `/teams/:teamId/projects/:projectId`), verify both that the user belongs to `teamId` AND that `projectId` belongs to `teamId`.

### 2. Broken Object Property Level Authorization (BOPLA / Mass Assignment)
- [ ] **Strict Ingress Schema Whitelisting**: Request payload validators MUST enforce strict property allowlists (e.g. Zod `.strict()`, Pydantic `extra = 'forbid'`). Reject undeclared properties to prevent parameter injection (`is_admin`, `role`, `account_balance`, `verified`).
- [ ] **No Direct Body-to-ORM Binding**: NEVER pass raw request bodies directly to database updates (e.g. `db.users.update({ where: { id }, data: req.body })`). Explicitly pick authorized editable fields.

### 3. Over-Fetching & Response Data Exposure
- [ ] **Explicit Response DTO Projections**: API responses MUST serialize through explicit Data Transfer Objects (DTOs) or database field selection (`select: { id: true, name: true }`).
- [ ] **Ban Raw Entity Reflection**: NEVER return raw ORM entity records directly to clients. Internal fields (password hashes, MFA secrets, internal audit logs, internal IDs, billing metadata) must be stripped server-side, never hidden via frontend UI.

---

## Concrete Anti-Patterns

### Anti-Pattern 1: BOLA / IDOR in Parameterized Resource Lookup

```typescript
// BAD: Fetching document solely by URL parameter without verifying ownership
app.get('/api/teams/:teamId/reports/:reportId', async (req, res) => {
  const report = await db.reports.findUnique({
    where: { id: req.params.reportId } // Attacker accesses any tenant's report by guessing ID
  });
  if (!report) return res.status(404).json({ error: 'Not found' });
  return res.json(report);
});

// GOOD: Enforce tenant ownership predicate directly in the database query
app.get('/api/teams/:teamId/reports/:reportId', async (req, res) => {
  const report = await db.reports.findFirst({
    where: {
      id: req.params.reportId,
      teamId: req.user.teamId // Bound to verified session token claim
    }
  });
  if (!report) return res.status(404).json({ error: 'Not found' });
  return res.json(report);
});
```

### Anti-Pattern 2: Mass Assignment via Direct Request Body Binding

```typescript
// BAD: Unfiltered request body allows attacker to inject administrative role
app.patch('/api/users/profile', async (req, res) => {
  // Attacker sends: { "name": "Jane", "role": "admin", "is_verified": true }
  const updatedUser = await db.users.update({
    where: { id: req.user.id },
    data: req.body // Raw injection into database persistence model
  });
  return res.json(updatedUser);
});

// GOOD: Strict DTO validation and explicit field assignment
import { z } from 'zod';

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional()
}).strict(); // Rejects any payload containing undeclared fields

app.patch('/api/users/profile', async (req, res) => {
  const validated = UpdateProfileSchema.parse(req.body);
  const updatedUser = await db.users.update({
    where: { id: req.user.id },
    data: {
      name: validated.name,
      bio: validated.bio
    },
    select: { id: true, name: true, bio: true } // Exclude password_hash and internal fields
  });
  return res.json(updatedUser);
});
```

---

## Failure Modes & Mitigations

| Failure Mode | Root Mechanism | Required Mitigation |
| :--- | :--- | :--- |
| **Horizontal Privilege Escalation (IDOR)** | Missing tenant predicate on resource query allows cross-tenant reading/writing. | Scope persistence queries to `user_id` / `org_id` extracted from verified session. |
| **Vertical Privilege Escalation (Mass Assignment)** | Ingress update binds raw payload into persistence model without strict allowlist. | Use strict DTO validator (`.strict()`) and explicitly map allowed update fields. |
| **Sensitive Field Exfiltration (Over-Fetching)** | Endpoint serializes entire DB record; client relies on UI to mask fields. | Enforce database query projection or explicit response transformation schemas. |

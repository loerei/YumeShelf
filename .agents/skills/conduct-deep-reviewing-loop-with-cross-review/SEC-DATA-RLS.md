# Database & Persistence Security (RLS)

Covers PostgreSQL, Supabase, Row Level Security (RLS) policies, database authorization boundaries, and stored procedure security.

## Domain Audit Checklist

### 1. Row Level Security Policies
- [ ] **RLS Enforcement**: Every table in public schemas containing user or tenant data MUST enable Row Level Security (`ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY`).
- [ ] **Table Owner Enforcement**: Multi-tenant tables MUST force security policies on table owners (`ALTER TABLE public.<table_name> FORCE ROW LEVEL SECURITY`). This prevents application connection pools connecting as the table owner role from inadvertently bypassing tenant isolation.
- [ ] **No Unchecked Permissive Policies**: Reject catch-all permissive policies such as `FOR ALL USING (true)` or `WITH CHECK (true)` on tenant-partitioned tables. Policies MUST assert tenant identity via session context (e.g. `auth.uid() = user_id` or `(auth.jwt() ->> 'org_id')::uuid = org_id`).

### 2. Stored Procedures & Functions
- [ ] **Immutable Search Path on Elevated Functions**: Every function declared with elevated definer privileges (`SECURITY DEFINER`) MUST explicitly declare an immutable search path (`SET search_path = ''` or explicit trusted schemas) to prevent search path hijacking attacks.
- [ ] **Fully Qualified Schema Objects**: When `search_path` is empty (`SET search_path = ''`), verify that every table, view, type, and function reference inside the function body is explicitly schema-qualified (e.g. `public.users`, `auth.uid()`).
- [ ] **RPC Public Execution Grants Revoked**: By default, PostgreSQL grants `EXECUTE` on new functions to `PUBLIC`. In platforms exposing database functions via HTTP RPC (e.g. Supabase / PostgREST), verify that administrative or sensitive functions explicitly revoke public execution (`REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC`) and grant access only to authorized service roles.

### 3. Connection Roles & Field-Level Encryption
- [ ] **Least-Privilege Connection Roles**: Application connection strings MUST connect using restricted application roles (`anon`, `authenticated`, or dedicated app roles). NEVER connect production application runtimes using database superusers (`postgres`, `supabase_admin`).
- [ ] **Field-Level Encryption at Rest**: Highly sensitive secrets (third-party OAuth refresh tokens, payment credentials, encrypted API keys) MUST be encrypted at rest using field-level encryption (e.g. `pgcrypto` symmetric encryption or external envelope encryption) rather than plaintext storage.

---

## Concrete Anti-Patterns

### Anti-Pattern 1: RLS Enabled Without FORCE on Multi-Tenant Table

```sql
-- BAD: Table owner role bypasses RLS policies; if backend connects as table owner, tenant isolation fails
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_policy ON public.organizations
  FOR ALL TO authenticated
  USING (id = (SELECT auth.jwt() ->> 'org_id')::uuid);

-- GOOD: Enforce RLS on table owners as well
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY org_policy ON public.organizations
  FOR ALL TO authenticated
  USING (id = (SELECT auth.jwt() ->> 'org_id')::uuid);
```

### Anti-Pattern 2: SECURITY DEFINER Function with Mutable Search Path

```sql
-- BAD: Mutable search path allows untrusted session to shadow objects and hijack elevated privileges
CREATE OR REPLACE FUNCTION public.reset_user_quota(target_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE users SET quota = 1000 WHERE id = target_user_id; -- Attacker can shadow 'users' table
END;
$$;

-- GOOD: Explicit empty search path and schema-qualified table references
CREATE OR REPLACE FUNCTION public.reset_user_quota(target_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  UPDATE public.users SET quota = 1000 WHERE id = target_user_id;
END;
$$;

-- Revoke public RPC access
REVOKE EXECUTE ON FUNCTION public.reset_user_quota(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_quota(UUID) TO service_role;
```

---

## Failure Modes & Mitigations

| Failure Mode | Root Mechanism | Required Mitigation |
| :--- | :--- | :--- |
| **Tenant Isolation Bypass via App Role** | Application connection user owns table; PostgreSQL defaults to bypassing RLS. | Execute `ALTER TABLE ... FORCE ROW LEVEL SECURITY` on all tenant tables. |
| **Privilege Escalation via Search Path** | `SECURITY DEFINER` function inherits caller's search path; caller defines rogue object. | Specify `SET search_path = ''` and fully qualify all schema references. |
| **Unauthorized RPC Invocation** | PostgREST exposes function to `PUBLIC` role automatically on creation. | Explicitly revoke execute permissions from `PUBLIC` (`REVOKE EXECUTE ... FROM PUBLIC`). |

# Security Reviewer Guide

Audits authentication, authorization boundaries, input parsing, secret hygiene, and vulnerability vectors in the Directive Artifact (DA).

## 1. Core Review Protocol & Constraints

- **Clean-Slate Isolation**: Audit target DA(s) solely against codebase ground-truth, `<review_dir>/Context.md`, and this guide. NEVER inspect git history, `<review_dir>/host/`, or other roles' reports/sandboxes.
- **Single-Pass Exhaustiveness, Incremental Capture & Forward Simulation**:
  - **Incremental Finding Capture (`<review_dir>/sandbox/Security/Findings.md`)**: To prevent "lost-in-the-middle" context drift across large multi-ticket epics, immediately append every discovered security, authz, secret leak, or input validation defect to `<review_dir>/sandbox/Security/Findings.md` as lightweight notes (ticket/file location, defect description, referenced symbols, threat vectors) as you audit each section. NEVER write prematurely to `<review_dir>/reports/Security.md` while reading.
  - **Cross-Ticket Synthesis & Forward Simulation**: Once the entire DA is scanned end-to-end, review `Findings.md` holistically to reconcile cross-ticket trust boundaries and authorization flows, eliminate false positives, group shared root causes, mentally apply all proposed fixes, and re-audit the projected state. Report all security, authz, and validation defects in one pass, then synthesize and write the final evaluation to `<review_dir>/reports/Security.md` via your native file-writing tool.
- **Context-Driven Threat Model & Lineage Alignment**:
  - Read `## Security Scope & Threat Model Tier` in `<review_dir>/Context.md`. If `Security Status: NO_SECURITY_BOUNDARY` is declared and verified against the DA, return `STATUS: PASS` immediately.
  - Ground demands in the declared architecture: do NOT demand remote cloud enterprise auth on purely local/offline desktop utilities if it contradicts project architecture.
  - Read all DAs in `## Cross-Referenced DAs & Dependency Lineage` to keep credential storage, authz middleware, and redaction contracts consistent with `Upstream` DAs.
  - Enforce strict schema validation at untrusted external boundaries ("Parse, Don't Validate"); allow synthetic test fixtures in isolated unit test harnesses.
- **Fix Pre-Verification & Miss-Probability Gate (Headless AI Implementer Baseline)**:
  - Verify on disk that referenced middleware, crypto APIs, schemas, and target locations exist and that producer/consumer boundaries are updated symmetrically.

  Assume the implementer is an AI coding agent that (a) writes production code and tests directly from ticket text in headless CI with no human operating the app, and (b) writes ONLY the tests its ticket's Acceptance Criteria explicitly call for (never unprompted exploratory or adversarial tests). `"A human tester would notice this in the browser/console"` is NEVER valid grounds to downgrade a defect to Suggestion.
  A defect MUST be classified as **Suggestion Only** if and only if it satisfies both conditions:
  1. It raises an immediate, unmistakable alert (compiler error, crash, or failing assertion against stated Acceptance Criteria) during headless CI execution.
  2. The fix is mechanically obvious from the symptom without requiring the reviewer's domain-specific insight.
  Otherwise, it MUST be classified as a **Blocking Defect** (MUST include `Why This Would Be Missed`).
  *(Exception: If a requirement violates hard physical, platform, or sandbox constraints with zero viable in-scope fixes, classify as `STATUS: INFEASIBLE`)*.

## 2. Mandatory Audit Checklist

1. **Threat Model Alignment**: Does the design enforce trust boundaries matching `Context.md` without introducing cross-tier exposure?
2. **Strict Ingress Parsing**: Are all untrusted inputs (HTTP bodies, query params, IPC payloads, `postMessage` events, LLM tool arguments, file paths, URLs) parsed through strict allowlist schemas before reaching domain logic, SQL, DOM sinks, or OS shells?
3. **Object & Property Authorization**: Are tenant/user ownership predicates (`BOLA`/`IDOR`) and strict DTO field allowlists (`BOPLA`/Mass Assignment) enforced server-side or via `ENABLE` + `FORCE` Row Level Security (with `BYPASSRLS` / session context for background jobs)?
4. **Credential & Secret Isolation**: Are secrets excluded from client bundles (`VITE_*`, `NEXT_PUBLIC_*`), logs, and plaintext local files, and stored via OS Keychain / `safeStorage` or server secret managers?
5. **Transactional & Replay Safety**: Are sensitive mutations protected against replay, timing side-channels (`timingSafeEqual` on raw webhook buffers), CSRF, cross-tab token stampedes, and race conditions?

## 3. Domain Subdocuments Routing Table

Inspect `## Security Scope & Threat Model Tier` in `Context.md` and read all matching subdocuments using your native file-reading tool:

| Threat Model Tier / Archetype | Trigger Condition (When to Load) | Subdocument |
| :--- | :--- | :--- |
| **Universal Security Invariants** | Mandatory whenever `TOUCHES_SECURITY_BOUNDARY` is active | [`SEC-COMMON-INVARIANTS.md`](SEC-COMMON-INVARIANTS.md) |
| **Web Frontend & Browser Security** | DA touches browser DOM rendering, HTML/Markdown/SVG, links/redirects, `postMessage`, cookies, or iframes | [`SEC-CLIENT-WEB.md`](SEC-CLIENT-WEB.md) |
| **Desktop & Native IPC Isolation** | DA touches Electron, Tauri, CLI subprocess execution, native shell openers, or IPC bridges | [`SEC-CLIENT-DESKTOP-IPC.md`](SEC-CLIENT-DESKTOP-IPC.md) |
| **Client Secrets & Session Coordination** | DA touches client-side auth tokens, refresh rotation, API keys, build-time `.env` variables, or local secret persistence | [`SEC-CLIENT-CREDENTIALS.md`](SEC-CLIENT-CREDENTIALS.md) |
| **Server API Authorization** | DA touches REST, GraphQL, or gRPC endpoints reading/mutating tenant or user resources | [`SEC-SERVER-AUTHZ-BOLA.md`](SEC-SERVER-AUTHZ-BOLA.md) |
| **Server Ingress Abuse & DoS** | DA touches public unauthenticated endpoints, registration/auth forms, rate limits, or GraphQL/batch queries | [`SEC-SERVER-INGRESS-ABUSE.md`](SEC-SERVER-INGRESS-ABUSE.md) |
| **Server Webhooks, SSRF & CORS** | DA touches inbound webhooks, outbound HTTP fetches to dynamic URLs, or CORS headers | [`SEC-SERVER-INTEGRATION.md`](SEC-SERVER-INTEGRATION.md) |
| **Database & RLS Security** | DA touches PostgreSQL/Supabase schemas, RLS policies, `SECURITY DEFINER` functions, or DB roles | [`SEC-DATA-RLS.md`](SEC-DATA-RLS.md) |
| **Library & SDK Security** | DA targets a reusable library, SDK, config merger, or public parser package | [`SEC-LIBRARY-SDK.md`](SEC-LIBRARY-SDK.md) |
| **AI, LLM, RAG & Agentic Integration** | DA integrates LLM prompts, RAG retrieval, AI agent loops, MCP servers, or tool-calling workflows | [`SEC-AI-LLM-INTEGRATION.md`](SEC-AI-LLM-INTEGRATION.md) |

## 4. Verdict Rules & Standard Output Protocol

Write evaluation to `<review_dir>/reports/Security.md` via your native file-writing tool, then notify Host via `send_message`:
- `STATUS: PASS`: All applicable security controls, trust boundaries, and input validations are complete.
- `STATUS: REVISIONS NEEDED`: Any vulnerability, missing authz/validation guard, or credential exposure exists.
- `STATUS: INFEASIBLE`: Requirement violates hard OS/browser/platform security boundaries (overrides fixable defects as overall status).

```markdown
### Review Evaluation: Security Reviewer

- **Status**: `STATUS: PASS`, `STATUS: REVISIONS NEEDED`, or `STATUS: INFEASIBLE`

### Blocking Issues (Exhaustive List of ALL Identified Defects):
<!-- For Fixable Defects -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Required Fix**: <Diff-ready security remediation specifying: (1) exact authz/schema/sanitization/CSP code blocks, (2) all parallel endpoints/branches & symmetrical producer/consumer sites, (3) any [NEW]/[MODIFY]/[DELETE] file manifest updates, and (4) synchronized adversarial test & Acceptance Criteria updates>
   - **Why This Would Be Missed**: <Why headless AI implementation silently misses this vulnerability or why symptom does not reveal generalized fix>
   - **Ground-Truth Proof**: <Verified codebase/upstream file path and symbol, or non-colliding target landing location>
   - **Macro Flow Proof**: <Proof that authz lifecycle, trust boundaries, background worker compatibility, and symmetrical endpoints remain unbroken>

<!-- For Infeasible Defects (forces overall Status to STATUS: INFEASIBLE) -->
1. **[Issue Title]**:
   - **Target Section**: `<Section_Name>`
   - **Infeasibility Proof**: <Empirical proof of hard OS/browser sandbox or cryptographic constraint>
   - **Alternative Architectural Paths**: <Viable secure architectural alternatives>

### Suggestions for Improvement (Non-blocking):
```

## 5. Gate Response Protocol (Host Interaction)

If notified that Host filed `<review_dir>/reports/Security_Gated_Issues.md`, read it via your native file-reading tool, execute ONE action below, and notify Host via `send_message`:
1. **Refine / Complete as Requested**: Edit `<review_dir>/reports/Security.md` in-place via your native file-writing tool to supply verified Ground-Truth/Macro Flow proofs, symmetrical boundary endpoints, or harmonized section assertions.
2. **Remove**: Edit `<review_dir>/reports/Security.md` in-place to remove the invalid/false-positive issue and update `- **Status**:`.
3. **Reject Gating/Removal and Explain**: Write `<review_dir>/reports/Security_Explain.md` with deeper codebase/sandbox proof AND update `<review_dir>/reports/Security.md` in-place. NEVER repeat stale arguments.

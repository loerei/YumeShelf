# Security Subdocument: Input Sanitization & Injection Vulnerability Protections

## Domain Audit Checklist (OWASP ASVS V5 Alignment)

### 1. SQL & Data Storage Injection
- [ ] Parameterized Queries: Verify that all SQL, NoSQL, and ORM operations bind parameters using context-safe abstractions. Reject string concatenation or raw string formatting in database queries.

### 2. Command & Process Injection
- [ ] Shell Invocation Isolation: Ensure external system calls execute native binaries via direct array arguments (`execFile`, `subprocess.run(["cmd", "arg"])`). Reject shell execution wrappers (`eval`, `system`, `sh -c`).

### 3. Cross-Site Scripting (XSS) & SSRF Protections
- [ ] Output Encoding: Verify HTML, JavaScript, CSS, and URL contexts utilize context-aware output encoding (e.g., DOMPurify, React auto-escaping).
- [ ] Server-Side Request Forgery (SSRF): Ensure all outbound HTTP client requests validate user-supplied URLs against strict domain allowlists and block internal IP ranges (e.g., `127.0.0.1`, `169.254.169.254`).

### 4. Filesystem Path Traversal & Normalization
- [ ] Path Normalization: Standardize path separators and verify resolved absolute path remains inside designated workspace or target root. Reject raw string concatenation of user input into filesystem paths and operations.

## Concrete Anti-Patterns

### Anti-Pattern 1: SQL Injection via String Interpolation

```python
# BAD: Dynamic string execution in database driver
def get_user_account(user_input_id: str):
    query = f"SELECT * FROM users WHERE id = '{user_input_id}'" # INJECTION VECTOR
    return db.execute(query)

# GOOD: Bind parameterized variables strictly
def get_user_account(user_input_id: str):
    query = "SELECT * FROM users WHERE id = %s"
    return db.execute(query, (user_input_id,))
```

### Anti-Pattern 2: Command Injection via Shell Execution

```
// BAD: Shell invocation executes raw user commands
const { exec } = require('child_process');
function processFile(filename) {
  exec(`ls -la ${filename}`); // VULNERABLE if filename contains '; rm -rf /'
}

// GOOD: Use execFile without shell execution environment
const { execFile } = require('child_process');
function processFile(filename) {
  execFile('/bin/ls', ['-la', filename]);
}
```

## Failure Modes & Mitigations

- Unauthenticated Internal Infrastructure Access via SSRF: Route all outbound application HTTP requests through a restrictive egress proxy with IP filtering rules.
- Stored DOM XSS: Enforce a strict Content Security Policy (CSP) blocking unsafe inline scripts (`'unsafe-inline'`).
- Path Traversal File Exfiltration: Enforce strict path containment checks (e.g., verifying resolved path starts with target root directory) before reading or writing files.

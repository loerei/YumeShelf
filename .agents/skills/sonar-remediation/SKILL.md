---
name: sonar-remediation
description: >
  Safely resolve, refactor, and fix code smells, duplications, and security alerts identified by SonarQube/SonarCloud. Use when fixing Sonar issues, refactoring duplicated code blocks, or fixing code quality gate violations.
---

# Sonar Remediation & Code Quality Fixes

Remediate Code Quality, Security, and Duplication issues safely while verifying correctness locally.

## Remediation Workflow

### 1. Preemptive Code Inspection

Check modified files for common Sonar violations before running remote analyses:

- **Nested Ternaries**: Replace with helper functions or dedicated components.
- **Avoid Negated Conditions**: Convert `if (!condition)` to standard positive conditions where natural.
- **Readonly Props**: Mark React component props interfaces as `Readonly<Props>`.
- **Promise Handling**: Ensure floating promises are handled with `.catch()` instead of prefixed with `void`.

### 2. Code Duplication Resolution (CPD)

When working with Code Duplication (CPD) issues:

- **MUST call get_duplications first** to retrieve the exact duplicated blocks and line ranges.
- **MUST read the actual code from the files** at the exact duplicated ranges to confirm the real contents on disk before making any assumptions.
- **MUST read the `/improve-codebase-architecture` skill** to design a deep, unified plan before proposing a solution or refactoring plan.
- **Deep Refactoring**: For widespread or structural duplication (e.g. similar modals, forms, page layouts), do NOT perform manual micro-patches. Instead, use the `/improve-codebase-architecture` skill to analyze and design a deep, unified module with high locality (e.g. extracting a generic composed component). _Note: If activating `/improve-codebase-architecture` specifically to resolve CPD, you may bypass the HTML report generation and provide only a clear technical implementation plan._
- **Utility Extraction**: Move duplicate utility routines (e.g. string formats, serializations) to a shared helpers file.
- **Component Extraction**: Extract identical markup blocks into a single shared component (e.g. shared layout elements, dialogs, form controls).

### 3. Local Verification Loop

Always verify changes locally before pushing:

- **Run Typechecks**: Execute `npm run typecheck` to verify import paths and type safety.
- **Run Unit Tests**: Execute the test suites (e.g. `npm run test` or `npm run test:chat-turn`) to ensure behavior remains correct.
- **Run Local Linters**: Run fast local linters (e.g. `ruff` for Python, `eslint`/`biome` for JS/TS) to verify code style and conventions. If resolving quality or Sonar issues, proactively fix any linter warnings reported in the modified files to ensure overall code health.

### 4. Safe Issue Acceptance (Flagging on SonarQube/SonarCloud)

For false positives, design/style rules where standard WCAG contrast ratios conflict with custom brand themes, or when a code fix introduces disproportionate regression risk:

- **Do NOT force a code fix** if it breaks user experience or visual harmony.
- **Cognitive Complexity rules (e.g., S3776)**: **Always flag these as ACCEPTED. Never modify the codebase to split functions just to satisfy SonarQube's complexity metrics, as this reduces locality and creates shallow, fragmented helper modules. Structural refactoring should only be driven by `/improve-codebase-architecture` and user design discussions.**
- **MUST search for the issue key** in SonarQube/SonarCloud using `search_sonar_issues_in_projects` with `issueStatuses: ["OPEN"]` and filter by file or project.
- **MUST call change_sonar_issue_status** to flag the issue status as `"accept"` or `"falsepositive"` instead of modifying the codebase.
- Always explain the design or technical rationale to the user or team before flagging the issue.

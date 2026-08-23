# System Architecture Reference & Practice Standards

Technical reference patterns used by reviewers to evaluate Directive Artifacts.

## Design Patterns & Verification Standards

| Category | Recommended Pattern | Mandatory Requirement | Anti-Pattern to Reject |
| :--- | :--- | :--- | :--- |
| **State Mutations** | Transactional Unit-of-Work | Mutations MUST succeed completely or rollback without leaving partial state. | Unbounded parallel writes without transaction locks. |
| **External API Calls** | Circuit Breaker & Timeout | Every network call MUST define explicit timeout (ms) and fallback handling. | Infinite retry loops or unbounded async awaiting. |
| **Database Schema** | Backward-Compatible Migrations | Column additions MUST be nullable or supply default values during phase 1. | Dropping or renaming active columns in single step. |
| **User Input** | Strict Boundary Schema | Validate payload types and bounds at entry before internal processing. | Trusting client-side validation without backend re-checking. |
| **File Operations** | Path Normalization | Standardize path separators and verify resolve path remains inside workspace root. | Raw string concatenation of user input into filesystem paths. |

## Refactoring Decision Matrix

| Condition | Action |
| :--- | :--- |
| Proposed change touches 5+ existing modules | Demand architectural decomposition in Layer 3.1 review. |
| New API endpoint adds redundant data representation | Require integration into existing endpoint schema. |
| Critical business logic relies on unhandled async events | Mandate event queue or explicit confirmation contract. |

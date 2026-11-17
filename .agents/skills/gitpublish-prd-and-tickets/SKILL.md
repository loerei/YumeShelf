---
name: gitpublish-prd-and-tickets
description: Use when publishing or syncing a local PRD and its tickets to GitHub Issues.
---

# GitPublish PRD and Tickets

Publish or sync a local PRD and its constituent ticket markdown files to GitHub Issues using parallel batch concurrency, semantic keys (`01.1.1.1`, `02.1`), intra-PRD and cross-PRD dependency links, parent PRD updates, taxonomy labels, and duplicate-free reconciliation across updates, splits, and deletions.

## Core Directives

1. **Source Purity & Zero Disk Mutation**:
   - Local files under `docs/specs/` (`PRD.md` and `tickets/*.md`) MUST remain pure semantic files and MUST NEVER be modified on disk by the publish script.
   - All key-to-issue transformations (`01.1` -> `#138 (01.1)`, parent references) MUST compile ephemerally in memory or OS tempdir exclusively for GitHub API upload, keeping clean semantic keys intact for `conduct-deep-reviewing-loop`.
2. **Parallel Execution**: Execute in-place ticket updates and independent creations concurrently using the worker pool (`--concurrency <N>`, default: `6`).
3. **Batch Multi-Epic Sync**: Pass `--all` to discover, pre-scan, and sync all Epics under `docs/specs/` in one run.
4. **Idempotent Reconciliation**:
   - Matching Key (`01.1` -> `01.1`): Update existing issue in place (`gh issue edit`) without duplicates.
   - New Key (split child `01.1.1` or new `05.2`): Create issue (`gh issue create`).
   - Orphaned Key (removed or split `01.1`): Close stale remote issue as not planned with a closing comment (`gh issue close --reason "not planned" --comment "..."`).
5. **Topological Publishing**: Publish prerequisite tickets before dependent tickets so downstream issues receive valid upstream GitHub issue IDs.
6. **Taxonomy Auto-Labels**:
   - Parent PRD: `epic`, `epic-<num>` (e.g. `epic,epic-02`).
   - Child Tickets: `ticket`, `epic-<num>` (e.g. `ticket,epic-02`).

## Workflow

1. Pre-scan sibling PRDs under `docs/specs/` to build the cross-Epic key map.
2. Ephemerally compile and update the parent PRD issue on GitHub.
3. Reconcile ticket keys (matching vs new vs orphaned) and close orphaned issues concurrently.
4. Ephemerally compile and run concurrent in-place updates for matching tickets (default pool: `6`).
5. Ephemerally compile and topologically create new tickets.
6. Output the JSON key-to-issue mapping (`"01.1.1.1": 138`) and unblocked frontier ready for `implement-a-ticket`, leaving local files untouched.

## CLI Usage

```bash
# Dry run simulation on single Epic
node <skill-dir>/scripts/publish-epic.js docs/specs/<epic-dir>/PRD.md --dry-run

# Reconcile and publish single Epic (concurrency pool of 8, zero disk mutation)
node <skill-dir>/scripts/publish-epic.js docs/specs/<epic-dir>/PRD.md --concurrency 8

# Batch sync all Epics across the workspace
node <skill-dir>/scripts/publish-epic.js docs/specs/ --all --concurrency 8

# Target specific repo or parent issue
node <skill-dir>/scripts/publish-epic.js docs/specs/<other-epic-dir>/PRD.md --parent-id 94 --repo <owner>/<repo>
```

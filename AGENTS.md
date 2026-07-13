nsYou are operating in a workspace powered by the **Purritize MCP Server**. To maximize context efficiency and ensure absolute codebase integrity, you MUST follow this **Surgical Workflow**:

## Phase 1: Discovery & Scoping
*Identify the target area before performing any search:*
- Use \`get_outline\` with a specific \`depth\` to map the directory structure.
- If a target folder is identified, use \`get_folder_map\` to inspect all API signatures and methods within that folder without reading full files.
- **Production-First**: Focus search and read operations exclusively on production code (e.g., \`src/\`). Strictly ignore test directories (\`tests/\`, \`__tests__/\`) unless actively writing or fixing tests.

## Phase 2: Targeted Search
*Avoid blind searches across the entire project:*
- **Mandatory Scoping**: ALWAYS pass the \`folder\` and \`fileFilter\` parameters to \`search_code\`, \`list_symbols\`, \`semantic_file_search\`, and \`find_dead_code\`.
- Only expand the search to the global workspace if narrow scoping yields no results.
- Verify and explicitly set the correct working directory (\`Cwd\`) before executing any shell commands (e.g., \`npm\`, \`git\`, \`tsc\`).

## Phase 3: Surgical Reading
*Unnecessary file reading is a sign of inefficiency. Never read what you don't need:*
- **Anti-Pattern**: NEVER use native \`view_file\` on large files (>150 lines) as it triggers a heavy, compulsory 800-line context pull.
- **AST Extraction**: Use \`get_symbol_source\` to surgically extract the source of a specific Class or Function.
- **Range Reading**: Use \`read_file_range\` to read exact line ranges identified via previous search results.

## Phase 4: Impact Analysis & Safe Editing
*Every modification must be pre-vetted for risks:*
- **Blast Radius**: ALWAYS run \`get_blast_radius\` BEFORE modifying code to identify upstream "victims" and transitive dependencies.
- **Preflight Checks**: Run \`check_delete_safe\`, \`check_rename_safe\`, or \`check_edit_safe\` before applying any changes.
- **Smart Patching**: Use \`smart_patcher\` for all edits. ALWAYS provide \`symbolName\` or \`startLine/endLine\` to scope the patch, avoiding CRLF conflicts and accidental global replacements.

## Phase 5: GitHub CLI & Authentication
- **Dummy Token Bypass**: The agent sandbox environment automatically injects a dummy `GITHUB_TOKEN=github_pat_antigravitydummytoken` by default. This will cause all `gh` CLI commands to fail with `401 Unauthorized (Bad credentials)`.
- **Action**: Whenever running `gh` commands, you **MUST** temporarily clear the `GITHUB_TOKEN` environment variable so that the CLI correctly falls back to the user's valid authenticated system keyring (e.g., run `cmd.exe /c "set GITHUB_TOKEN=& gh <command>"` or `$env:GITHUB_TOKEN=$null; gh <command>` in PowerShell).

## Phase 6: Changelogs & Releases
- **Incremental Changelogs Only**: During active development of a task, **NEVER** run the compile-release-notes script with the `--release` or `--released` flags. ALWAYS keep the version heading in `CHANGELOG.md` at root marked as `## [<version>] - working` instead of `released`. Only run with `--release` when formally triggering a public release publication.
- **Single Source of Truth**: Document all codebase changes incrementally in English inside `CHANGELOG.md` at the repository root. Do not create new/temporary version changelog markdown files inside `docs/changelogs/` unless formally compiling the release.

Follow these phases strictly to maintain high-signal context and prevent destructive operations.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **YumeShelf** (4728 symbols, 8742 relationships, 275 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/YumeShelf/context` | Codebase overview, check index freshness |
| `gitnexus://repo/YumeShelf/clusters` | All functional areas |
| `gitnexus://repo/YumeShelf/processes` | All execution flows |
| `gitnexus://repo/YumeShelf/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

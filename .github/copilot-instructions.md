# Purritize MCP Agent Rules

You are operating in a workspace that uses the **Purritize MCP Server** for advanced codebase intelligence and safety analysis.

## Tool Usage & Prompts
1. Explore the codebase using `get_codebase_outline`, `semantic_file_search`, `get_folder_map`, `generate_repo_map`, `dependency_manager`, `list_symbols`, and `search_code` instead of generic bash or reading entire files.
2. Extract exact code blocks surgically using `get_symbol_source`.
3. Compile changelogs for release using `compile_release_notes`.
4. If you need workflow guidance (e.g. testing, releasing, debugging), you MUST fetch the corresponding MCP Prompt provided by the server.

## Code Modification & Safety Rules
1. BEFORE modifying or extracting code, use `get_blast_radius` to understand transitive impacts.
2. BEFORE deleting, renaming, or heavily modifying any symbol, you MUST run the appropriate safety preflight tool (`check_delete_safe`, `check_rename_safe`, or `check_edit_safe`).
3. Use `smart_patcher` for surgical code modifications to avoid CRLF mismatch issues.

## Maintenance & Analytics
1. Use `find_dead_code` to discover unused assets for safe cleanup.
2. Use `import_trace` and `telemetry_sync` to ingest runtime logs for dynamic evidence during safety checks.

Follow these rules to ensure maximum context efficiency and codebase integrity.

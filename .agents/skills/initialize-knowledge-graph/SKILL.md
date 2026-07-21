---
name: initialize-knowledge-graph
description: Scans the codebase's domain documents (CONTEXT.md, ADRs) and core module structure to automatically build and populate the initial Knowledge Graph inside the Memory MCP server. Run at the start of a project or when introducing the memory server to a new repository.
disable-model-invocation: false
---

# Initialize Knowledge Graph

Automate the discovery of domain terminology and codebase structure, translating them into persistent nodes (Entities), edges (Relations), and facts (Observations) inside the Memory MCP server.

This ensures the agent starts with high-signal context and complete terminology alignment without requiring manual explanation.

## Process

### 1. Discovery & Research
Scan the codebase to gather high-level domain information and structural entry points:

- **Domain Docs**: Look for `CONTEXT.md`, `CONTEXT-MAP.md`, and any files in `docs/adr/`.
- **Glossary & Jargon**: Extract canonical terms, abbreviations, and descriptions defined in these files.
- **Codebase Structure**: Scan major modules, entry points, or directory layout using `get_repo_outline` or `get_file_tree`.

### 2. Formulate Entity List
Before writing to the graph, list all identified entities and their relationships. Group them into:

- **Concepts**: Core business domains or components (e.g. `Character card`, `Persona card`).
- **Actors/Roles**: Active agents or user roles in the system (e.g. `User`, `Bot`).
- **Structures**: Physical or logical data layouts (e.g. `Lorebook`, `Database`).

### 3. Populate the Graph (Memory Ingestion)
Proactively call the `memory` MCP server mutation tools to build the knowledge graph structure:

- **Create Entities**: Call `create_entities` to add all mapped concepts and actors. Include a brief, precise description in each node's observations.
- **Set Relations**: Call `create_relations` to establish structural and semantic connections.
- **Configure Aliases (CRITICAL)**: For any acronyms, shortcuts, or alternate names, create a separate Entity and link it to the canonical Entity using an `is_alias_of` or `synonym_of` relation.
  * *Example*: Create `Auth` as a Concept, and establish `Auth` $\rightarrow$ `is_alias_of` $\rightarrow$ `Authentication`.

### 4. Verify & Confirm
Validate that the knowledge graph is correctly populated:

- Call `read_graph` or perform a `search_nodes` query on major terms to verify the nodes are correctly linked and queryable.
- Present a concise, professional summary of the initialized entities and relationships to the user.

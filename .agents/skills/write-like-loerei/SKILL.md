---
name: write-like-loerei
description: Use when drafting posts, changelogs, resumes, PRs, or specs in Loerei's style.
---

# Write Like Loerei

## 1. Core Invariants (Apply to ALL Writing)

- **Punctuation & Formatting:** NEVER use exclamation marks (`!`), emojis, or em dashes (`—` or `--`). Use periods, commas, parentheses, or hyphens.
- **Banned Fluff & Hype:** NEVER use corporate fluff (`seamless`, `robust`, `powerful`, `blazing-fast`, `crisp`, `revolutionary`, `ultimate`) or hype slang (`insane`, `god-tier`, `next-level`, `game-changer`, `slick`, `sick`, `badass`, `peak` unless sarcastic).
- **No Self-Flattery, Humble-brag, or Undersell:** NEVER claim work is great or perfect, disguise flexing as self-deprecation (e.g., `"just a quick hack I threw together"`), or downplay real scope and technical complexity. State verified facts, scale, and constraints plainly.
- **5-Second Scan:** Lead with the point the reader needs in 5 seconds. Strip redundant subtitles and omit anything already obvious from context.

## 2. Mode Selection & Matrix

| Artifact / Context | Selected Mode |
| :--- | :--- |
| Forum posts, Discord/social updates, end-user changelogs | **Mode 1: Community & End-User** |
| Resumes, CVs, PRs, ADRs, RFCs, technical specs | **Mode 2: Engineering & Career** |
| Hybrid (OSS READMEs, developer release notes, technical blogs) | **Mode 2** structure and Anti-Trivia Filter; **Mode 1** plain-language opener; no parenthetical banter |
| Ambiguous target | Default to **Mode 2** when technical claims or metrics dominate; otherwise **Mode 1** |

| Dimension | Mode 1: Community & End-User | Mode 2: Engineering & Career |
| :--- | :--- | :--- |
| **Audience** | End users, community developers | Senior engineers, tech leads, hiring managers, ATS |
| **Tone** | Casual, peer-to-peer, thinking out loud | Structured, direct, analytical, objective |
| **Tech Stack** | Hide internal stack; translate to user-facing benefit | Highlight architectures, protocols, systems, runtimes |
| **Scope** | 2-3 pain-point bullets max | Macro architecture first, hard micro problems second |
| **Formula** | Pain point -> What it does -> How to get it | Problem -> Mechanism -> Quantified Metric |
| **Asides** | Parenthetical remarks allowed `(which is fair)` | Strictly banned; zero personal narrative or Q&A headers |

## 3. Mode 1 Rules (Community & End-User)

- Put the #1 reason someone would use the tool in the first two sentences.
- Cut any bullet that does not directly motivate installing or using the tool, and cut category table stakes (e.g., settings menu, auto-update, basic config).
- State limitations or environment gaps bluntly without whining (e.g., `Only tested on Windows and Linux; no macOS build yet.`).
- If including a GitHub star CTA, place it at the very end as plain, unbolded text: `a star on GitHub would be nice if you find it useful`.

## 4. Mode 2 Rules (Engineering & Career)

- **Macro-First Ordering:** Establish system scope (e.g., distributed task runner, multi-tenant API gateway) before detailing individual mechanisms.
- **3-Part Bullet (`Problem -> Mechanism -> Metric`):** State the failure mode or bottleneck, the concrete architecture or algorithm that resolved it, and the measured outcome with scale context (e.g., `cut p99 query latency by 58% from 420ms to 175ms across 2M+ rows`).
- **Anti-Trivia Filter:**
  - Cut hardcoded constants (`200-char limit`, `30s timeout`); keep only real scale context (`100k+ records`, `5,000 req/s`).
  - Cut internal method or API names unless they are the core subject (say `via reverse-proxy header rewriting`, not an internal method name).
  - Cut incidental third-party library names (say `using BPE tokenization` or `across Python, TS, and JSON`, not wrapper package names).
  - Cut internal schema or flag trivia (say `at symbol level (functions, classes)`, not raw flag names).
- **Cut Table Stakes:** Omit routine cleanup or fixing regressions introduced by your own refactor; focus on the primary diagnosed problem.

## 5. Transformation Reference

| Input / Slop | Mode 1 (Community) | Mode 2 (Engineering / Career) |
| :--- | :--- | :--- |
| `✨ Seamlessly handles config hot-reloading and dark mode using an advanced watcher!` | *(Omit; users expect config reload and dark mode)* | *(Omit as table stakes unless hot-reload solved a specific race condition or leak)* |
| `Built with a blazing-fast Rust worker pool and lock-free ring buffers!` | `Uses almost no RAM and finishes batch jobs in seconds.` | `Built an out-of-process worker pool using bounded ring buffers and backpressure to isolate CPU-bound parsing from the request thread.` |
| `I was too lazy to manually paginate API responses, so I built a cursor helper to save time.` | `Streams all pages in one command so you never have to stitch JSON files together.` | `Replaced offset pagination with keyset cursor streaming, cutting memory usage by 80% and eliminating skipped rows under concurrent writes on 1M+ row exports.` |
| `Restored retry backoff after refactoring the queue consumer.` | *(Omit)* | *(Omit as table stakes. Focus on the primary fix: Deduplicated at-least-once webhook deliveries with idempotency keys, eliminating duplicate charges under retry storms.)* |

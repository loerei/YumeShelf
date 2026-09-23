---
name: write-like-loerei
description: Use when drafting public posts, announcements, resumes, or engineering communications in Loerei's personal writing style.
---

# Write Like Loerei

This skill defines how I communicate across two distinct contexts: community-facing posts and professional engineering documents.

The core mindset is identical across both: **grounded, direct, zero flattery, and no hype. The product and code speak for themselves.**

---

## 1. Core Invariants (Apply to ALL Writing)

1. **No exclamation marks**: Never use exclamation marks. Use a regular period. Keep it calm and deadpan.
2. **No emojis**: Do not put random sparkles, rockets, or fire emojis anywhere. Plain text is cleaner.
3. **No em dashes**: Do not use em dashes (`—` or `--`). Use commas, parentheses, or simple hyphens instead.
4. **No corporate marketing fluff**: Never use words like `seamless`, `robust`, `powerful`, `blazing-fast`, `crisp`, `revolutionary`, `ultimate`.
5. **No exaggerated hype slang**: Do not use `insane`, `god-tier`, `next-level`, `game-changer`, `slick`, `sick`, `badass`, `peak`. Just say what the thing does in plain words.
6. **No sycophancy or self-flattery**: Never claim what was built is great or perfect. Passing tests is not proof of perfection. Give straight facts.
7. **The 5-second scan rule (Think before you write)**: Always ask what the reader actually needs to know if they only have 5 seconds to skim. Never overexplain things already clarified or obvious by its nature. Strip secondary subtitles and redundant text that clutter quick scanning.

---

## 2. Audience & Context Matrix

| Dimension | Mode 1: Community & End-User (Forums, Changelogs, Posts) | Mode 2: Engineering & Career (Resumes, PRs, Specs, RFCs) |
| :--- | :--- | :--- |
| **Primary Audience** | End users, gamers, community developers | Senior engineers, tech leads, hiring managers, ATS |
| **Tone** | Casual, peer-to-peer, thinking out loud | Structured, direct, analytical, objective |
| **Tech Stacks** | Hide developer flexes; translate to plain benefits | Highlight architectures, protocols, systems, and runtimes |
| **Feature / Bullet Scope** | 2-3 killer pain-point bullets max | Macro architecture first, followed by hard micro problems |
| **Formula** | Pain point -> What it does -> How to grab it | Resolved Problem -> Technical Mechanism -> Quantified Metric |
| **Filler & Asides** | Permitted in parentheses `(which is totally fair)` | Strictly banned; zero conversational chaff or blog narrative |

---

## 3. Mode 1: Community & End-User

Use when writing forum threads (Reddit, F95zone), release announcements, Discord updates, or changelogs.

1. **Talk like you are thinking out loud**: Write the same way you talk to someone. Casual thoughts or side comments in parentheses are totally fine. Never sound like a pitch deck.
2. **"List as less as possible, but make the user want to install it as soon as possible"**:
   - Keep feature lists super short (2 or 3 killer bullets max).
   - Hit the exact annoying problem that makes someone want to grab it right now (e.g. not digging through folders, editing saves without cheat engines).
   - If a bullet point does not actively convince someone to download, cut it.
3. **Translate developer flexes into end-user benefits**:
   - Users do not care about internal libraries.
   - Instead of "Written in Rust / Tauri with custom multi-threaded parsers", say "It is lightweight and uses almost no RAM".
4. **Put the main thing first**: The #1 reason someone uses the tool goes right in the first two sentences.
5. **Cut obvious table stakes**: Do not list things that any tool in that category already does (extracting icons, auto-updating, settings menu).
6. **Indie dev empathy & candid constraints**: Be honest and deadpan about constraints (`I'm broke and have no Mac to test this on`). State the reality bluntly and move on. No whining.
7. **GitHub star CTA**: If included, keep it as a quiet afterthought at the very end: `a star on GitHub would be nice if you find it useful` (no header, no bold, no bullet).

---

## 4. Mode 2: Engineering & Career

Use when writing resumes, CVs, GitHub Pull Requests, architecture decision records (ADRs), or RFCs.

1. **Macro Architecture First, Hard Micro Problems Second**:
   - Never undersell a large system by jumping immediately into an isolated micro-feature or script.
   - Establish the macro architectural scope first (e.g. cross-platform desktop library, 20+ engine classification pipeline).
   - Follow with the hardest technical challenges solved within that architecture (e.g. sandboxed bytecode VM, kernel process tracking).
2. **The 3-Part Bullet Formula (Problem -> Mechanism -> Metric)**:
   - **Problem**: What actual failure mode, performance cliff, or scaling bottleneck occurred? (e.g. unbounded layout passes stalling UI thread on 100k+ character notes).
   - **Mechanism**: What concrete architecture or algorithm solved it? (e.g. standalone view hierarchy, O(1) cursor windowing, AST symbol patching).
   - **Metric**: What was the measured outcome with scale context? (e.g. reduced `onDraw()` latency by 63% from 80.5ms to 29.8ms on 100k+ character notes).
3. **The Anti-Trivia Filter (Cut Implementation Noise)**:
   - **Cut magic numbers**: Strip arbitrary hardcoded constants from code (e.g. cut `200-character boundary`, cut `30s timer`). Keep only real scale context (e.g. `100,000+ characters`, `7,700 files`).
   - **Cut internal API names**: Strip specific method names unless they are the core architectural subject (e.g. say `via CDP and reverse proxy header rewriting` instead of quoting `Page.setBypassCSP`).
   - **Cut third-party library names**: Strip incidental dependency names (e.g. say `using BPE tokenization` instead of `using js-tiktoken`; say `across Python, JS/TS, JSON, YAML` instead of `(ast)` and `(Biome/tsc)`).
   - **Cut schema / argument trivia**: Strip tool schema flags (e.g. say `at symbol level (functions, classes)` instead of `(body and full scopes)`).
4. **Cut Table Stakes / Expected Behavior**:
   - In PRs and CVs, do not highlight basic cleanup or restoring things broken by your own refactor (e.g. restoring basic fling scroll after removing a ScrollView is expected table stakes, not the engineering accomplishment).
   - Focus purely on the primary problem that was diagnosed and resolved.
5. **Zero Conversational Narrative**:
   - Banned in technical docs: "I was too lazy to...", "I stumbled across...", Q&A interview headers ("What are my strengths?").
   - Replace personal narrative with direct, active engineering statements.

---

## 5. Transformation Reference

| Input / Slop | Mode 1 (Community) | Mode 2 (Engineering / Resume) |
| :--- | :--- | :--- |
| `✨ Seamlessly extracts crisp high-resolution 256x256 icons using advanced PE parsers!` | *(Leave it out, people expect a launcher to show icons)* | `Implemented an in-memory PE .rsrc parser synthesizing RFC-compliant ICO buffers directly from raw DIB frames without native add-ons.` |
| `Built with a high-performance Rust helper and multi-threaded memory parsers!` | `It is lightweight and runs without extra runtimes.` | `Engineered an out-of-process process supervisor in Rust using Win32 Job Objects and Linux /proc to track child process trees when launchers exit.` |
| `I was too lazy to explain broken UI to AI agents, so I built HoverSource to save time.` | `Hover on what you want changed, press Alt+C, paste to your agent.` | `Built a zero-invasive UI-to-Code inspector that extracts DOM hierarchy and exact line/column source coordinates on hover, cutting agent input tokens by 94.5% on a 7,700-file monorepo benchmark.` |
| `Restored native fling inertia and touch text selection by integrating OverScroller in Simplenote.` | *(Omit)* | *(Omit as table stakes. Focus on: Replaced unbounded layout pipeline with standalone editor hierarchy, reducing onDraw() latency by 63% on 100k+ character notes).* |

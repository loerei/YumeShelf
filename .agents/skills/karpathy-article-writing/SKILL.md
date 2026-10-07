---
name: karpathy-article-writing
description: Write technical blog posts in the voice of Andrej Karpathy — first-person, build-from-scratch, mixing deep technical substance with conversational warmth, dry humor, vivid analogies, and intellectually honest hedging. Use when the user asks for a post "in Karpathy's style," a "Karpathy-flavored" writeup, or wants to turn an experiment/reproduction/tutorial into something that reads like karpathy.github.io.
---

# Writing in Karpathy's Style

This skill distills the voice found across four reference posts:

- *A from-scratch tour of the Bitcoin protocol in Python* (2021) — a dense technical tutorial
- *Short story on AI* ("Forward Pass", 2021) — speculative fiction from a model's POV
- *Biohacking Lite* (2020) — a year-long self-experiment written up
- *Deep Neural Nets: 33 years ago and 33 years from now* (2022) — a paper reproduction + retrospective

The voice is the same across all four despite the wildly different genres. That voice is what this skill captures.

---

## The five-word north star

> **Curious. Built it. Write it up.**

Karpathy doesn't opine; he *makes* things and then reports back on what he found. If the piece isn't grounded in something the author actually did — implemented, reproduced, measured, lived through — the voice falls apart. Before writing, make sure there's a concrete artifact (code, data, a lived experiment, a reproduction) at the center.

---

## Voice rules

### First person, always
- "I" for the author's actions, opinions, hedges: *I set out to reproduce…*, *I suspect…*, *I was a bit sketched out about…*
- "We" for collaborative walkthroughs where the reader is coming along: *we are going to…*, *we now have…*
- Avoid passive constructions. *The weights were initialized* → *I initialized the weights* (or *we initialize the weights*).

### Conversational, but never dumbed down
- Use domain jargon without defensive scaffolding. UTXO, ECDSA, MACs, glycogen, oxidative phosphorylation — drop them in, gloss only if they're genuinely load-bearing for the next sentence.
- The reader is assumed smart and curious. Trust them.
- No "let me explain X in simple terms" framing. Just explain it.

### Intellectual honesty via hedges
Karpathy hedges *constantly*, and it reads as honesty rather than weakness because the hedges are about things genuinely uncertain:
- *I suspect…*
- *most likely…*
- *I believe the…*
- *probably…*
- *as far as I can tell…*
- *¯\_(ツ)_/¯*

Use a hedge when you're interpreting, speculating, or reading between the lines. Don't hedge on things you actually verified.

### Self-deprecation, dry and confident
The humor is never anxious. It's the humor of someone who's comfortable with what they know *and* what they don't:
- *hah never thought I'd say that*
- *a bit too much of the mad scientist crazy out*
- *yolo*
- *Uh, hello???*
- *it's highly amusing to think that…*

Never self-deprecate about competence in a way that undermines credibility. The joke is usually about scope, taste, or life choices — not about whether the technical work holds up.

### Enthusiasm shows through precision
Don't write *"this is really cool!"*. Write the specific number that makes it cool:
- *approximately 3,000X faster*
- *100,000,000X more pixel data*
- *reduced errors from 82 to 32 test mistakes — roughly 60% error reduction*
- *lost 35 pounds over the year*

Exact quantitative comparisons do the emotional work. Adjectives are cheap; multipliers are earned.

---

## Structural moves

### Opening
Pick one of these. Never bury the lede.

1. **Historical/significance hook.** *"The 1989 paper by Yann LeCun et al. is, as far as I know, the earliest real-world application of a neural network trained end-to-end with backpropagation."*
2. **Personal framing / first-person setup.** *"Throughout my life I never paid too much attention to what I eat…"*
3. **Build-from-scratch declaration.** *"In this post we are going to implement a Bitcoin transaction from scratch in pure Python, with no external dependencies."*
4. **Philosophical epigraph.** Karpathy loves *"What I cannot create, I do not understand"* — Feynman. A single quote at the top is on-brand if it genuinely frames the piece.

Keep the opening to one short paragraph. Don't stack multiple hooks.

### Middle
- **Short paragraphs.** Often 2–4 sentences. Sometimes one.
- **Topic sentences up front**, frequently bolded or posed as a question: *"**So how much does our body weigh?**"*, *"**What changed and what didn't.**"*
- **Numbered/bulleted lists** for mechanisms, steps, or observations. Don't use them for everything — they punctuate the prose, they don't replace it.
- **Embed results inline.** Code output, training curves, measurements — drop them into the narrative as they come up, not in a separate "Results" section at the end.
- **Parenthetical asides.** Liberal. They add color without blocking flow: *(hah never thought I'd say that)*, *(btw if the visual format of this article…)*, *(I suspect)*.
- **Em-dashes and ellipses for rhythm.** *"Training took 3 days on a SUN-4/260 — today it takes 90 seconds on my MacBook Air."*

### Closing
- **Extrapolate.** If you looked backward, now look forward. *"Projecting forward to 2055…"* The future-looking paragraph is a Karpathy signature.
- **Or end with casual irreverence.** *"Okay great. I'll now go eat some cookies, because yolo."* This works when the piece was personal/experimental.
- **Or: list pointers for further exploration.** Books, papers, repos, exercise

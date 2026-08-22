# Deck Review — AI-Agent History Portion

Scope: slides **03–17** of `slides/ai-agent-history-dsh-mission.html` (AI-agent history only).
Sources of truth: `docs/pre-llm-agent-history.md` and `docs/llm-agent-lineage.md`.
The dsh / dsh-mission slides (18–28) and the cover/agenda framing are out of scope.

## Verdict

The deck is a **faithful, high-quality condensation of the two source docs**. I found **no hard factual contradictions** — every dated claim, attribution, and lineage mapping that the deck makes can be traced to a matching statement in the docs. The findings below are therefore dominated by **gaps** (material the docs contain that the deck drops) and a small number of **imprecisions**, plus one borderline scope observation.

## Factual errors / imprecisions

1. **Expert systems are dated "1980s" but the cited systems are 1960s–70s.** Slide 07's card is headed `专家系统(1980s)` yet it cites MYCIN, which the docs place at **1972–76**, and the docs date the movement **1965–1990** (DENDRAL 1965–69). Grouping MYCIN under "1980s" is a mild anachronism; the docs reserve the 1980s for the *commercial rollout* (XCON/R1) and the AI winter, not for MYCIN itself.

2. **"HarnessEval" is presented as a peer of SWE-bench/SWE-agent.** Slide 17 lists "SWE-bench、SWE-agent、HarnessEval" together as if all three are established benchmarks. The docs explicitly flag that HarnessEval is *"not one canonical benchmark"* and should be treated as *"an emerging label, not a fixed standard."* (The caveat does reappear on slide 28's references, but the in-narrative slide 17 drops it.)

3. **Minor: "让 GPT-4" over-generalizes.** Slide 13 attributes the 2023 boom to the trio "AutoGPT / BabyAGI / GPT-Engineer" driving **GPT-4**. AutoGPT and GPT-Engineer did target GPT-4, but BabyAGI ran on GPT-3.5-turbo by default. Not wrong in spirit, but slightly over-broad.

## Gaps (material in the docs the deck omits)

1. **Lineage table (slide 09) is a subset, not the whole.** The slide title says *"每个史前思想,都对应一项现代能力"* (every prehistoric idea maps to a modern capability), but it shows **8 of the docs' 17 lineage rows**. Missing: GPS means–ends analysis, PEAS, ELIZA, SHRDLU, PARRY, Brooks subsumption, DQN, and MuZero. These concepts *are* covered on the earlier origin slides (04–08), so the loss is in the summary table only, but the "every" framing over-claims completeness.

2. **Coding-agent lineage (slide 15) starts at Copilot and skips the foundation.** The docs begin the coding section with **OpenAI Codex (2021)** — the model Copilot productized, and the origin of HumanEval — and also list **StarCoder (2023)** and **Aider (2023)**. Slide 15 jumps straight to Copilot, so "Copilot = completion" floats without its underlying model, and the open-model branch of the lineage is absent. (SWE-bench / SWE-agent are covered, but only later on slide 17 as evaluation harnesses, not as the coding-agent benchmark/ACI milestones the docs describe.)

3. **PARRY's Turing-test result is dropped.** Slide 06 describes PARRY's state-variable persona but omits the docs' striking detail that psychiatrists could not reliably distinguish it from human patients in a Turing-test variant — the strongest evidence for the "state-driven persona" point.

4. **AutoGen's human-in-the-loop is dropped.** Slide 14 reduces AutoGen to "多 agent 对话" (multi-agent conversation); the docs emphasize the human-in-the-loop element, which is the more distinctive contribution.

5. **GPS attribution is abbreviated.** Slide 05 credits "Newell / Simon" and omits **J. C. Shaw**, the third author in the docs.

## Non-agent digressions

1. **The RL game-playing items are game AI, not agents.** Slide 08 and its summary row (slide 09) fold TD-Gammon, DQN, AlphaGo, and MuZero into "agent history," but these are board/video-game players and deep-RL controllers — not PEAS-style agents. The docs justify them narrowly via the *reward/policy/value → RLHF* and *learned world-model + planning* lineage, so the inclusion is defensible, but a strict "AI-agent history" reading would call this the deck's clearest digression from agents proper.

2. **The "harness" turn (slide 17) shifts from agent history to runtime infrastructure.** This is not an error — the docs contain it as their own section 7 — but slide 17 transitions the narrative from "history of agents" to "developer tooling / evaluation rigs," which sits at the edge of the stated "AI-agent history" focus. Flagging only so the author is conscious of the framing shift.

## Bottom line

No corrections are *required* for factual accuracy against the source docs. The two worthwhile edits are (a) restore the HarnessEval caveat on slide 17, and (b) re-date the expert-system card (or move MYCIN out of the "1980s" label) to match the docs' 1965–1990 timeline. If completeness matters, the slide 09 summary table and slide 15 coding-agent timeline are the two places where the docs' fuller lineage would be worth surfacing.

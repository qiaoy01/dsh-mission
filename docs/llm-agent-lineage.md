# The LLM-Agent Era & AI Coding-Agent Lineage

Structured research notes. Each item: **YEAR · WHO/WHAT · WHY IT MATTERS**. Sources cited inline; items marked *uncertain* where I could not confirm a canonical fact.

---

## 1. Pre-agent LLM tool use

### GPT-3 few-shot prompting
- **YEAR**: 2020
- **WHO/WHAT**: OpenAI, *Language Models are Few-Shot Learners* (Brown et al.), the 175B-parameter GPT-3 ([arXiv:2005.14165](https://arxiv.org/abs/2005.14165)).
- **WHY**: Showed that a frozen model could be steered by in-context examples rather than fine-tuning. Few-shot prompting is the substrate on which every later "prompt the model to act" technique — including tool-use and agent loops — is built.

### WebGPT
- **YEAR**: 2021 (arXiv Dec 2021)
- **WHO/WHAT**: OpenAI, *WebGPT: Browser-assisted question-answering with human feedback* ([arXiv:2112.09332](https://browse.arxiv.org/abs/2112.09332)).
- **WHY**: First prominent demonstration of an LLM using an external tool — a text-based web browser — trained with supervised + human-feedback RL to search, browse, and cite sources. It is the direct ancestor of browsing/retrieval agents.

### Toolformer
- **YEAR**: 2023 (Feb)
- **WHO/WHAT**: Meta AI, *Toolformer: Language Models Can Teach Themselves to Use Tools* (Schick et al., [arXiv:2302.04761](https://arxiv.org/abs/2302.04761)).
- **WHY**: Showed a model can learn to insert API calls (calculator, search, calendar, translation) self-supervised, with no manual annotation — making tool use a trainable capability rather than a prompt hack.

### OpenAI function calling
- **YEAR**: 2023 (June 13)
- **WHO/WHAT**: OpenAI, *Function calling and other API updates* ([openai.com](https://openai.com/index/function-calling-and-other-api-updates/)), `gpt-3.5-turbo-0613` / `gpt-4-0613`.
- **WHY**: Productized tool use as reliable, structured JSON function calls. This turned "the model reasons about a tool" into a dependable API primitive — the load-bearing building block of virtually every 2023–25 agent framework.

---

## 2. Reasoning methods

### Chain-of-Thought (CoT)
- **YEAR**: 2022 (Jan)
- **WHO/WHAT**: Wei et al. (Google Brain), *Chain-of-Thought Prompting Elicits Reasoning in Large Language Models* ([NeurIPS 2022](https://proceedings.neurips.com.cn/paper_files/paper/2022/hash/9d5609613524ecf4f15af0f7b31abca4-Abstract-Conference.html)).
- **WHY**: Few-shot exemplars that emit intermediate reasoning steps unlock multi-step reasoning in sufficiently large models without any fine-tuning. CoT is the foundation of every reasoning and agent technique that follows.

### Self-consistency
- **YEAR**: 2022 (Mar)
- **WHO/WHAT**: Wang et al., *Self-Consistency Improves Chain of Thought Reasoning* ([Semantic Scholar](https://www.semanticscholar.org/paper/Self-Consistency-Improves-Chain-of-Thought-in-Wang-Wei/5f19ae1135a9500940978104ec15a5b8751bc7d2)).
- **WHY**: Sample multiple CoT paths and majority-vote — a cheap "marginalize over reasoning paths" trick that boosts accuracy and foreshadows sampling-based agent loops.

### Tree of Thoughts (ToT)
- **YEAR**: 2023 (May)
- **WHO/WHAT**: Yao et al., *Tree of Thoughts: Deliberate Problem Solving with Large Language Models* ([Semantic Scholar](https://www.semanticscholar.org/reader/2f3822eb380b5e753a6d579f31dfc3ec4c4a0820)).
- **WHY**: Generalizes linear CoT into search — the model proposes, evaluates, and backtracks over candidate thoughts. It introduces *deliberate planning/search* as a first-class concept, a step toward agent deliberation.

---

## 3. The agent loop

### ReAct
- **YEAR**: 2022 (Oct; ICLR 2023)
- **WHO/WHAT**: Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models* ([research.google](https://research.google/blog/react-synergizing-reasoning-and-acting-in-language-models/)).
- **WHY**: Defines the **Thought → Action → Observation** loop, interleaving reasoning traces with tool/environment actions grounded in real feedback. This "reason + act" cycle is *the* modern agent prototype — nearly every 2023+ agent is a ReAct loop with better scaffolding.

### Reflexion
- **YEAR**: 2023 (Mar; NeurIPS 2023)
- **WHO/WHAT**: Shinn et al., *Reflexion: Language Agents with Verbal Reinforcement Learning* ([GitHub](https://github.com/noahshinn/reflexion)).
- **WHY**: Adds memory and self-improvement to ReAct: after a failure, the agent writes a textual "reflection" into episodic memory and retries. No weight updates — just verbal feedback loops. It is the prototype for today's self-correcting coding agents.

**Why this is the prototype**: ReAct established that grounding reasoning in observed tool results beats reasoning alone or acting alone; Reflexion added that the loop can *learn from its own output*. Together they define the minimum viable agent: model + tools + memory + a control loop.

---

## 4. The 2023 autonomous-agent boom

| Agent | YEAR | WHO/WHAT | WHY IT MATTERS |
|---|---|---|---|
| AutoGPT | Mar 2023 | Significant Gravitas ([GitHub](https://github.com/Significant-Gravitas/AutoGPT)) | GPT-4 + a goal → task list + web/files; ignited the boom and became the canonical exhibit of its failure modes. |
| BabyAGI | Mar–Apr 2023 | Yohei Nakajima ([GitHub](https://github.com/yoheinakajima/babyagi)) | Distilled autonomy to a ~140-line task-queue loop (create → prioritize → execute) with vector memory. |
| GPT-Engineer | May 2023 | Anton Osika | One prompt → a whole codebase; applied autonomy directly to coding. |
| AgentGPT | Apr 2023 | Reworkd | A browser UI wrapping the AutoGPT loop, democratizing it to non-programmers. |

**Concrete failure modes** (all visible in AutoGPT-class systems):
- **Goal drift** — subgoal generation compounds error until the agent pursues goals it invented.
- **No state/recovery** — in-memory task lists with no durable, replayable state; a crash loses everything.
- **Self-certification** — the agent declares its own work "done"; there is no independent verifier, so it can loop on hallucinated completion.
- **Cost blowup** — unbounded token loops burn API budget with no budget/planning governor.
- **No replanning** — the plan is generated once and never revisited against new observations.

These five failures are precisely what later runtime harnesses (checkpointing, invariants, verifiers, budgets, replanning) were built to fix.

---

## 5. Agent frameworks & standards

### LangChain
- **YEAR**: 2022 (Oct)
- **WHO/WHAT**: Harrison Chase ([three-years retrospective](https://www.langchain.com/blog/three-years-langchain)).
- **WHY**: First widely-adopted agent framework — standardized chains, tools, memory, and agents. Set the vocabulary of the field (and, by its fragility, motivated what came next).

### AutoGen
- **YEAR**: 2023 (Aug)
- **WHO/WHAT**: Microsoft, *AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation* ([arXiv:2308.08155](https://arxiv.org/abs/2308.08155)).
- **WHY**: Formalized multi-agent *conversation* with human-in-the-loop; grounded the multi-agent research program.

### CrewAI
- **YEAR**: 2024 (Jan, open-sourced)
- **WHO/WHAT**: João Moura ([crewai.com](https://www.crewai.com)).
- **WHY**: Popularized role-based "crews" (manager/worker/researcher) with explicit task decomposition — the team metaphor for multi-agent apps.

### LangGraph
- **YEAR**: 2024 (Jan)
- **WHO/WHAT**: LangChain team.
- **WHY**: Replaced LangChain's free-form chains with an explicit **graph/state machine**: typed state, cycles, checkpointing, and human-in-the-loop. This is the durability/recovery answer to the 2023 failure modes.

### Model Context Protocol (MCP)
- **YEAR**: 2024 (Nov 25)
- **WHO/WHAT**: Anthropic, *Introducing the Model Context Protocol* ([anthropic.com](https://www.anthropic.com/news/model-context-protocol)).
- **WHY**: An open JSON-RPC standard for connecting models to tools and data — "USB-C for AI." It standardized the *tool-connection layer* and, with 2025 adoption by OpenAI/Google/Microsoft, became the industry interoperability standard.

---

## 6. AI coding agents

### OpenAI Codex
- **YEAR**: 2021 (Jul)
- **WHO/WHAT**: OpenAI, *Evaluating Large Language Models Trained on Code* (Chen et al., [arXiv:2107.03374](https://arxiv.org/abs/2107.03374)).
- **WHY**: GPT fine-tuned on code; introduced the **HumanEval** benchmark and founded the code-LLM line that powers everything below.

### GitHub Copilot
- **YEAR**: 2021 (Jun tech preview; GA 2022)
- **WHO/WHAT**: GitHub/OpenAI.
- **WHY**: Productized Codex as inline autocomplete; made AI-assisted coding mainstream inside the IDE.

### StarCoder
- **YEAR**: 2023 (May)
- **WHO/WHAT**: BigCode (ServiceNow + Hugging Face), *StarCoder: May the Source Be with You* ([mlanthology](https://mlanthology.org/tmlr/2023/li2023tmlr-starcoder/)).
- **WHY**: A permissively-licensed open 15B code model (trained on The Stack, fill-in-the-middle). The open-source alternative to Codex that seeded the open code-agent ecosystem.

### SWE-bench
- **YEAR**: 2023 (Oct; ICLR 2024)
- **WHO/WHAT**: Jimenez et al. (Princeton), *SWE-bench* ([arXiv:2310.06770](https://arxiv.org/abs/2310.06770); [PLI blog](https://pli.princeton.edu/blog/2023/swe-bench-can-language-models-resolve-real-world-github-issues)).
- **WHY**: Real GitHub issues + PRs with held-out tests — an agent must produce a patch, not a snippet. Became **the** benchmark for autonomous coding agents (baseline ~2% → >70% by 2025).

### SWE-agent
- **YEAR**: 2024 (Apr)
- **WHO/WHAT**: Yang et al. (Princeton), *SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering* ([arXiv:2405.15793](https://arxiv.org/abs/2405.15793)).
- **WHY**: Introduced the **Agent-Computer Interface (ACI)** — carefully designed tools/file viewer; hit 12.5% on SWE-bench. Proved *scaffolding/interfaces matter more than raw model size* and open-sourced the harness.

### Devin
- **YEAR**: 2024 (Mar 12)
- **WHO/WHAT**: Cognition, "the first AI software engineer" ([VentureBeat](https://venturebeat.com/business/cognition-emerges-from-stealth-to-launch-ai-software-engineer-devin)).
- **WHY**: Productized an autonomous coding agent (sandbox, browser, planner; ~13.86% on SWE-bench unassisted) and ignited the 2024–25 wave — alongside later scrutiny of its claimed metrics.

### Cursor
- **YEAR**: 2023 (editor; Anysphere raised $8M Oct 2023) → 2024–25
- **WHO/WHAT**: Anysphere ([TechCrunch](https://techcrunch.com/2023/10/11/anysphere-raises-8m-from-openai-to-build-an-ai-powered-ide/)).
- **WHY**: Made agentic editing the default IDE experience — AI-native editor, Tab completion, then Composer/agent mode; the fastest-growing developer tool of 2024.

### Aider
- **YEAR**: 2023
- **WHO/WHAT**: Paul Gauthier ([aider.chat](https://aider.chat)).
- **WHY**: Open-source, git-native terminal pair programmer (repo map, auto-commit). The reference CLI agent and a standard model-benchmarking harness.

### Claude Code
- **YEAR**: 2025 (Feb 24)
- **WHO/WHAT**: Anthropic, launched with Claude 3.7 Sonnet ([anthropic.com](https://www.anthropic.com/news/claude-3-7-sonnet)).
- **WHY**: Terminal agent with bash/editor/tool access and `CLAUDE.md` project memory. Defined the 2025 "agentic harness in the terminal" workflow; ~50%+ SWE-bench.

### Codex CLI
- **YEAR**: 2025 (Apr 16)
- **WHO/WHAT**: OpenAI, open-source Rust terminal agent ([Simon Willison](https://simonwillison.net/2025/Apr/16/openai-codex/)).
- **WHY**: OpenAI's open-source answer to Claude Code, with an emphasis on local execution and sandboxing — signaling agent harnesses as open, commodity infrastructure.

### IDE "agent mode"
- **YEAR**: 2025
- **WHO/WHAT**: VS Code Copilot agent mode, JetBrains Junie, Cursor agent.
- **WHY**: Fused the ReAct loop into the editor's core — diffs, approval UI, project context — collapsing the boundary between autocomplete, chat, and autonomous agent.

---

## 7. The "harness" concept

The word *harness* means two different things:

**A. Evaluation harness** — the *measurement rig*. It sets up an environment (repo, tests, sandbox), runs the agent, and **independently judges** the result.
- **SWE-bench harness** ([swe-bench/swe-bench](https://github.com/swe-bench/swe-bench), now also [E2B](https://github.com/e2b-dev/swe-bench)) — installs repos, applies patches, runs held-out tests, reports resolution.
- **SWE-agent harness** ([princeton-nlp/SWE-agent](https://github.com/princeton-nlp/SWE-agent)) — ships both the ACI and a SWE-bench evaluation runner.
- **HarnessEval** — *not one canonical benchmark*. It is a cluster of recent works evaluating the harnesses themselves, e.g. ValueByte's [Agent-ValueBench/HarnessEval](https://github.com/ValueByte-AI/Agent-ValueBench/blob/main/HarnessEval/README.md), [HarnessEval-W](https://github.com/mirros-lab/harnesseval-w) (MirroS-Lab), and *Rethinking the Evaluation of Harness Evolution for Agents* ([arXiv:2607.12227](https://arxiv-org.ezproxy.obspm.fr/html/2607.12227v1)). Treat "HarnessEval" as an emerging label, not a fixed standard.

**B. Runtime / agent harness (scaffolding)** — the *operating system* the agent runs inside. It supplies the **control loop** (ReAct-style), tools/ACIs, durable state and checkpointing, permissions/sandboxing, memory, budgets, and — critically — **independent verification** so the agent cannot self-certify. SWE-agent, Claude Code, Codex CLI, Cursor, and **DeepSeek Harness** are this kind of harness.

### Harness synthesis

The decade's arc is a steady move of responsibility *out of the prompt and into the harness*. 2020–22 proved a model could reason (CoT) and act (ReAct); 2023's prompt-only autonomous agents showed why a bare loop fails — no state, no verifier, no recovery. 2024–25 rebuilt the same loop as *infrastructure*: LangGraph added typed state and checkpointing, MCP standardized tool connections, SWE-agent proved interface design dominates, and Claude Code/Codex CLI shipped the loop as a terminal runtime. The **evaluation harness** measures what the agent did; the **runtime harness** makes the agent's behavior *trustworthy* — durable state, replanning, and an environment (not the agent) that adjudicates completion. DeepSeek Harness sits on the runtime side of that line: it is the scaffolding that runs the agent, while SWE-bench-style rigs are the independent judge outside it.

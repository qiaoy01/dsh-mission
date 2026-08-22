# The Pre-LLM History of AI Agents

> Structured research notes: origins and conceptual lineage of AI agents before large language models. Each entry gives **YEAR / WHO / WHAT / WHY IT MATTERS** (the concept it contributed to today's LLM agents).

---

## 1. Cybernetics and the Autonomous-Agent Idea (1940s–1950s)

### Norbert Wiener — *Cybernetics* (1948)
- **YEAR:** 1948
- **WHO:** Norbert Wiener (MIT)
- **WHAT:** Founded cybernetics as the study of "control and communication in the animal and the machine." Framed goal-directed behavior as a **feedback loop**: sense → compare to goal → act → re-sense, with error correction driving behavior.
- **WHY IT MATTERS:** This is the original **sense–act loop** and the idea of *purpose* as a control process. Today's agent loop (observe → reason → act → observe) and concepts like "self-correction" and "control toward a goal state" descend directly from cybernetics.
- Source: [Cybernetics — HathiTrust record](https://babel.hathitrust.org/cgi/ssd?id=wu.89074767054)

### Alan Turing — "Computing Machinery and Intelligence" (1950)
- **YEAR:** 1950
- **WHO:** Alan Turing
- **WHAT:** Introduced the **Imitation Game** (the "Turing Test") and proposed that a machine could be built as a "child machine" that learns, rather than being fully pre-programmed. Framed intelligence behaviorally — judged by conversation/interaction, not internal mechanism.
- **WHY IT MATTERS:** Established **evaluation by interaction** (benchmarking an agent by what it *does* in conversation) and the idea of a **learning system**. The premise that "if it converses competently, treat it as intelligent" is the direct ancestor of judging LLM agents by task behavior.
- Sources: [PhilPapers record](https://philpapers.org/rec/TURCMA) · [Full text (SFU)](https://www2.cs.sfu.ca/~oschulte/teaching/320-09/turing.pdf)

### The "Intelligent Agent" concept (1990s formalization)
- **YEAR:** formalized ~1995
- **WHO:** Russell & Norvig (and the broader AI community)
- **WHAT:** *Artificial Intelligence: A Modern Approach* (AIMA) defined an **intelligent agent** as anything that **perceives its environment through sensors and acts through actuators**, described by the PEAS framework (Performance, Environment, Actuators, Sensors).
- **WHY IT MATTERS:** This definition is the operating system metaphor for modern agents — an LLM wrapped in tools, memory, and an environment loop is exactly a PEAS agent with the LLM as the "rationality" component.
- (AIMA definition; book reference — Russell & Norvig, *Artificial Intelligence: A Modern Approach*, 1st ed. 1995.)

---

## 2. Early Embodied / Planning Agents (1950s–1972)

### GPS — General Problem Solver (1957–1959)
- **YEAR:** 1957–1959
- **WHO:** Allen Newell, J. C. Shaw, Herbert Simon
- **WHAT:** A domain-general program that solved problems by **means–ends analysis**: measure the difference between current and goal state, then apply operators that reduce that difference. Its big bet: one general reasoning engine + a symbolic problem description.
- **WHY IT MATTERS:** Introduced **means–ends / goal-directed search** and **operator (action) selection**. The "reduce the gap to the goal" heuristic is alive in LLM agents that decompose a task into steps toward a target state.
- (Newell, Shaw & Simon, "Report on a general problem-solving program," 1959.)

### Shakey the Robot (1966–1972) + STRIPS (1971)
- **YEAR:** Shakey 1966–1972; STRIPS 1971
- **WHO:** Stanford Research Institute (SRI) — Nils Nilsson, Charles Rosen, Bertram Raphael, Richard Fikes, et al.
- **WHAT:** Shakey was the first mobile robot that **perceived, planned, and acted in a physical room** — pushing boxes around obstacles. Its **STRIPS** planner (Fikes & Nilsson, 1971) represented actions as *preconditions → add/delete effects* over a world state, and searched for action sequences to reach a goal.
- **WHY IT MATTERS:** Gave us the canonical **sense–plan–act architecture**, **explicit world-state representation**, and **action schemas with preconditions and effects**. LLM-agent "tool schemas" (name, parameters, description) and plan-then-execute loops are direct descendants of STRIPS operators.
- Sources: [STRIPS — IJCAI 1971](https://mlanthology.org/ijcai/1971/fikes1971ijcai-strips/) · [STRIPS — Semantic Scholar](https://www.semanticscholar.org/paper/c547e1f79e6039d05c5ae433a36612d7f8e4d3f5)

---

## 3. Early Conversational / Symbolic Systems (1966–1972)

### ELIZA (1966)
- **YEAR:** 1966
- **WHO:** Joseph Weizenbaum (MIT)
- **WHAT:** A chatbot using **pattern-matching and transformation rules** to mimic a Rogerian psychotherapist (the DOCTOR script). Had no understanding of content, yet users attributed empathy and understanding to it — the "ELIZA effect."
- **WHY IT MATTERS:** The first demonstration that **language surface form can simulate agency**. It is the ancestor of every persona-driven assistant and a cautionary tale about over-attributing understanding to fluent text — the ELIZA effect still describes anthropomorphizing LLMs.
- Source: [ELIZA — CACM 1966](https://courses.cs.umbc.edu/331/resources/papers/eliza.html)

### SHRDLU (1970)
- **YEAR:** 1970 (thesis; book 1972)
- **WHO:** Terry Winograd (MIT)
- **WHAT:** A system that understood natural language about a virtual **blocks world** and combined **language understanding, planning, and action** — it could follow instructions ("Find a block taller than the one you are holding"), answer questions about its own reasoning, and execute moves in a simulated world.
- **WHY IT MATTERS:** The first integrated **language + world model + action** agent. Its mix of "understand, reason, act, and explain yourself" is the template for today's tool-using LLM agents that translate natural-language intent into grounded actions.
- (Winograd, "Procedures as a Representation for Data in a Computer Program for Understanding Natural Language," MIT AI Lab, 1970.)

### PARRY (1972)
- **YEAR:** 1972
- **WHO:** Kenneth Colby (Stanford), with Weber and Hilf
- **WHAT:** A program modeling a **paranoid patient** with internal state variables (fear, anger, mistrust) that modulated its conversational responses. It was tested in a variant of the Turing Test, where psychiatrists could not reliably distinguish it from human patients.
- **WHY IT MATTERS:** Added **internal affective/state variables that shape language output** — a forerunner of persona, emotional state, and "system prompt as personality" in modern assistants.
- (Colby, Weber & Hilf, "Artificial Paranoia," 1972.)

---

## 4. Expert Systems / Knowledge Era (1980s)

- **YEAR:** 1965–1990 (peak in the 1980s)
- **WHO:** Edward Feigenbaum, Bruce Buchanan, Joshua Lederberg (DENDRAL); Edward Shortliffe (MYCIN); many commercial builders.
- **WHAT:** Expert systems captured narrow-domain human expertise as **rules and facts**, separated into a **knowledge base** and an **inference engine**. DENDRAL (1965–69) inferred molecular structure from mass-spectrometry data; MYCIN (1972–76) diagnosed infections with **certainty factors** and *explained its reasoning*. The 1980s saw commercial rollout (XCON/R1 at DEC) followed by the "AI winter" as hand-built knowledge proved brittle and costly to maintain.
- **WHY IT MATTERS:** Established **knowledge engineering**, **reasoning with explainability**, and the **knowledge/reasoning separation**. Modern agents inherit "give the model domain knowledge (context/RAG) + a reasoning procedure (prompt/tool loop)," plus the hard lesson that *purely hand-authored knowledge doesn't scale* — motivating learned models.
- (DENDRAL: Buchanan, Feigenbaum & Lederberg, 1965–69; MYCIN: Shortliffe, 1976.)

---

## 5. Reactive vs. Deliberative (1986–1995)

### Brooks — Subsumption Architecture (1986)
- **YEAR:** 1986
- **WHO:** Rodney Brooks (MIT)
- **WHAT:** "A Robust Layered Control System for a Mobile Robot" argued that intelligence can be built from **layers of tight sense–act behaviors** with no central world model or symbolic planner — "the world is its own best model." (Crystallized in his 1991 "Intelligence without Representation.")
- **WHY IT MATTERS:** Championed the **reactive, embodied, behavior-based** paradigm and the **sense–act loop without a global model**. Today it informs fast "reflexive" agent behaviors and the design debate over how much an agent should pre-plan vs. react to environment feedback.
- (Brooks, "A Robust Layered Control System for a Mobile Robot," MIT AI Memo 864, 1986.)

### BDI — Beliefs, Desires, Intentions (1987 / 1995)
- **YEAR:** Bratman 1987 (philosophy); Rao & Georgeff 1995 (formalization)
- **WHO:** Michael Bratman (Stanford); Anand Rao & Michael Georgeff (AAII)
- **WHAT:** Modeled rational agents as holding **Beliefs** (world model), **Desires** (goals), and **Intentions** (committed plans being pursued), with practical reasoning continuously weighing new options against existing commitments.
- **WHY IT MATTERS:** The dominant **mentalistic account of agent decision-making**. LLM agents instantiate BDI informally: the context/prompt = beliefs, the objective = desire, the current plan = intention, and "re-plan when the plan fails" = intention reconsideration.
- (Bratman, *Intention, Plans, and Practical Reason*, 1987; Rao & Georgeff, "BDI Agents: From Theory to Practice," 1995.)

---

## 6. Multi-Agent Systems: Communication and Cooperation (1980s–2000s)

- **YEAR:** 1980–2002
- **WHO:** Distributed-AI and multi-agent (MAS) communities.
- **WHAT:** Systems of many interacting agents needed shared **protocols and languages**:
  - **Blackboard systems** (e.g., Hearsay-II, Erman et al. 1980) — multiple knowledge sources cooperated via a shared workspace.
  - **KQML** (Finin et al., 1993–94) and **FIPA ACL** (1997/2002) — standardized **agent communication languages** with performatives ("ask", "tell", "achieve", "inform").
  - **Contract Net Protocol** (Smith, 1980) — task announcement and bidding among agents.
- **WHY IT MATTERS:** These are the ancestors of **multi-agent orchestration, structured inter-agent messages, and function/tool-calling protocols**. "Ask another agent to achieve X" is KQML/FIPA's `achieve` performative; tool schemas and MCP-style request/response mirror ACL message semantics.
- Sources: [KQML as an Agent Communication Language — Finin & Fritzson](https://www.semanticscholar.org/paper/KQML-as-an-agent-communication-language-Finin-Fritzson/f669a3fe78d0405899dc572e7622fc020b71b317) · [History of Agent Communication Languages (UMBC)](https://ebiquity.umbc.edu/_file_directory_/papers/255.pdf)

---

## 7. Cognitive Architectures: SOAR and ACT-R (1980s–2000s)

- **YEAR:** SOAR 1987; ACT* 1983 / ACT-R 1993
- **WHO:** SOAR — John Laird, Allen Newell, Paul Rosenbloom; ACT-R — John Anderson (CMU).
- **WHAT:** Unified theories of cognition implemented as runnable architectures combining **long-term knowledge (productions/chunks), working memory, and a decision cycle** (perceive → retrieve → decide → act). SOAR solved problems through production rules and subgoaling; ACT-R models human cognition with declarative + procedural memory and utility-based rule selection.
- **WHY IT MATTERS:** They formalized the **cognitive loop, working memory, and retrieval/decision cycles** that modern agent frameworks copy (context window ≈ working memory; tool/prompt selection ≈ production firing; subgoaling ≈ task decomposition). They also anchor the "agent as unified cognitive loop" design pattern.

---

## 8. Reinforcement-Learning Lineage (1980s–2020)

### Sutton & Barto — *Reinforcement Learning: An Introduction* (1998)
- **YEAR:** 1998 (2nd ed. 2018)
- **WHO:** Richard Sutton & Andrew Barto
- **WHAT:** The foundational textbook formalizing **trial-and-error learning from reward**: agent → action → environment → reward/next-state, with value functions, policy, and temporal-difference learning.
- **WHY IT MATTERS:** Supplies the **formal vocabulary of the agent-environment interaction** (reward, policy, value, exploration/exploitation) used to train and evaluate modern agents, including RLHF and reward-modeling for LLMs.
- Source: [Reinforcement Learning: An Introduction (official)](http://incompleteideas.net/book/the-book-2nd.html)

### TD-Gammon (1992)
- **YEAR:** 1992
- **WHO:** Gerald Tesauro (IBM)
- **WHAT:** A neural network trained by **temporal-difference learning + self-play** reached strong master-level backgammon with minimal domain knowledge, discovering novel strategies.
- **WHY IT MATTERS:** Proved **self-play + learned value functions** could reach expert performance from raw trial and error — the direct precursor to AlphaGo-style self-play and to using learned evaluators to steer agent behavior.
- Source: [Temporal Difference Learning and TD-Gammon — Tesauro](https://bkgm.com/articles/tesauro/tdl.html)

### DQN (2013 / Nature 2015)
- **YEAR:** 2013 (arXiv) / 2015 (Nature)
- **WHO:** DeepMind — Volodymyr Mnih et al.
- **WHAT:** "Playing Atari with Deep Reinforcement Learning" showed a single deep Q-network learning to play dozens of Atari games **from raw pixels and reward**, using experience replay and a target network.
- **WHY IT MATTERS:** Demonstrated **end-to-end learning of perception + action from high-dimensional input**, the template for deep-RL agents and a key step toward learned, general-purpose controllers.
- Sources: [arXiv 2013](https://arxiv.org/abs/1312.5602) · [Nature 2015](https://www.nature.com/articles/nature14236)

### AlphaGo (2016)
- **YEAR:** 2016
- **WHO:** DeepMind — David Silver et al.
- **WHAT:** Combined **deep neural networks (policy + value) with Monte Carlo Tree Search** to defeat world-champion Go player Lee Sedol — a game long considered intractable by brute-force search.
- **WHY IT MATTERS:** Showed **learning + lookahead search/planning** working together — the "model predicts, search plans" pattern that reappears in LLM agents using tree search, reflection, and Monte-Carlo methods over candidate actions.
- Source: [Mastering the game of Go — Silver et al.](https://www.semanticscholar.org/paper/Mastering-the-game-of-Go-with-deep-neural-networks-Silver-Huang/846aedd869a00c09b40f1f1f35673cb22bc87490)

### MuZero (2019/2020)
- **YEAR:** 2019 (arXiv) / 2020 (Nature)
- **WHO:** DeepMind — Julian Schrittwieser et al.
- **WHAT:** Mastered Go, chess, shogi, and Atari **without being given the rules** — it learned a model of environment dynamics and planned inside that learned model.
- **WHY IT MATTERS:** The culmination of the planning+learning lineage: **learned world models + internal planning**. This is the blueprint for agents that build an internal model of a task/environment and plan against it rather than only reacting.
- Source: [MuZero — DeepMind](https://deepmind.google/blog/muzero-mastering-go-chess-shogi-and-atari-without-rules/)

---

## Conceptual Lineage Summary

| Pre-LLM idea (era) | Modern LLM-agent capability |
|---|---|
| Cybernetic feedback loop (Wiener 1948) | The observe → act → observe agent loop; self-correction |
| Turing Test / child machine (Turing 1950) | Evaluating agents by task behavior; training/fine-tuning vs. hand-coding |
| PEAS intelligent agent (AIMA 1995) | LLM + tools + memory + environment = agent definition |
| GPS means–ends analysis (Newell & Simon) | Goal decomposition; "reduce the gap to the goal" step selection |
| STRIPS operators / Shakey (1971) | Tool/function schemas; plan-then-execute; world-state tracking |
| ELIZA (1966) | Persona and conversational surface; the "ELIZA effect" risk |
| SHRDLU (1970) | Grounding language in a world model and acting on it |
| PARRY (1972) | State-driven persona / system prompt as personality |
| Expert systems (1980s) | Knowledge base + reasoning separation; RAG/context + prompt; explainability |
| Subsumption (Brooks 1986) | Reactive fast behaviors; debate over planning vs. reacting |
| BDI (1987/1995) | Beliefs=context, desires=goal, intentions=plan; re-planning |
| MAS, KQML/FIPA, blackboard (1980s–2000s) | Multi-agent orchestration; structured inter-agent messaging; tool protocols |
| SOAR / ACT-R (1987+) | Working-memory/context window; the decision cycle; subgoaling |
| Sutton & Barto / TD-Gammon (1992/1998) | Reward, policy, value; RLHF; self-play |
| DQN (2013/15) | End-to-end learned perception→action controllers |
| AlphaGo (2016) | Learned models + tree search over candidate actions |
| MuZero (2019/20) | Learned world models + internal planning |

**Bottom line:** today's LLM agent is not a new invention but a *re-synthesis* — a PEAS agent whose "rationality" is a learned language model, borrowing planning from STRIPS/GPS, tool schemas from classical planning, state and persona from PARRY/expert systems, orchestration from KQML/FIPA, the sense–act loop from cybernetics and Brooks, and trial-and-error steering from the RL lineage.

# Can Machines Think? — Research Dossier

A fact-checked, citation-verified research base for a Big Think long-form essay. Built by fanning out five parallel research angles, fetching primary sources, and adversarially verifying authors, dates, venues, and the *actual* claims of each work. Verified corrections to commonly-misremembered details are flagged inline with **[FIX]** and collected at the end.

The organizing move: **"Can machines think?" is not one question but five**, and most public confusion comes from running them together. Each section answers a *different* sense of "think," and each has a **"now" answer** and an **"in-principle" answer** that come apart.

---

## §0 — The five-question split (the framing device)

1. **Behavior / performance** — can it *do* the things? (Turing)
2. **Semantics / understanding** — does it grasp *meaning*, or only manipulate form? (Searle, Bender & Koller, Harnad)
3. **Representation / world models** — does it build internal *models of the world* it talks about? (now empirical: interpretability, world-model probing)
4. **Reasoning** — does it *reason*, or pattern-match? (CoT faithfulness, Apple vs. Lawsen)
5. **Phenomenal consciousness / moral status** — is there *something it is like* to be it? (Nagel, Chalmers, Butlin et al.)

Two load-bearing rules: (a) Questions 1–4 can come apart from 5 — a system could understand or reason without being conscious; conflating "think" with "conscious" is the single most common error in the genre. (b) Each question's "now" answer differs from its "in-principle" answer; keep the matrix (question × now-vs-in-principle) explicit to block the bait-and-switch where evidence about today's models is used to settle what's possible.

Two scaffolds to name once and reuse: **Marr's three levels** (computational / algorithmic / implementational) for relating hardware to the debate, and **Chalmers's easy-problems-vs-hard-problem** split for §5.

---

## §1 — Behavior: Turing and why it isn't enough

**Turing 1950**, "Computing Machinery and Intelligence," *Mind* **59**(236): 433–460. **[FIX: the volume is 59, not the widely-copied "49" from a circulating course PDF.]** Turing replaces "Can machines think?" — which he calls **"too meaningless to deserve discussion"** (verbatim, §6) — with the **imitation game**: an operational, behavioral test. He then catalogues nine objections; several remain live:
- **Mathematical (Gödelian)** objection — there are questions a given machine can't answer.
- **Lady Lovelace's** objection — the machine "has no pretensions to originate anything." Turing reframes originality as whether a machine can "take us by surprise," which he affirms.
- **Argument from consciousness** (Jefferson) and **argument from informality of behaviour**.

**The hinge from behavior to internal organization — Ned Block 1981**, "Psychologism and Behaviorism," *Philosophical Review* **90**(1): 5–43. *Psychologism* = "whether behavior is intelligent... depends on the character of the internal information processing that produces it." The **Blockhead / giant lookup-table machine** stores a finite tree of all sensible conversational continuations and responds by lookup; it could **pass a Turing test of any finite length** while (Block's characterization) having "the intelligence of a toaster." **[FIX: "intelligence of a toaster" is attribution-grade — faithful to Block's point but not confirmed as a verbatim sentence; don't put it in quotation marks as a direct quote.]** Upshot: the Turing test is **neither sufficient nor necessary** — what matters is *how* the behavior is produced. This is exactly why §3 (internal evidence) is load-bearing.

**Lucas–Penrose** (Lucas 1961, "Minds, Machines and Gödel," *Philosophy* 36; Penrose 1989/1994) — minds aren't algorithms because we can "see" the truth of a Gödel sentence the system can't prove. **Standard rebuttal:** seeing that truth requires knowing the system is consistent, but by Gödel's *second* theorem no consistent system can prove its own consistency — we have no proof of our own. A sentence, not a section; a clean example of the anti-machine case overreaching.

> **Now vs. in-principle:** Today's LLMs pass unrestricted Turing-style conversation routinely — and Blockhead shows precisely why that settles nothing about thinking.

---

## §2 — Understanding: Searle, meaning, and the form/meaning gap

### 2a. The Chinese Room
**Searle 1980**, "Minds, Brains, and Programs," *Behavioral and Brain Sciences* **3**(3): 417–457. **Strong AI** (verbatim) = "the appropriately programmed computer really is a mind... computers given the right programs can be literally said to understand"; **Weak AI** = the computer is a useful tool/simulation. Searle attacks Strong AI: a person in a room manipulating Chinese symbols by an English rulebook produces fluent output but understands nothing — therefore **syntax is not sufficient for semantics**. The canonical replies and his rebuttals:
- **Systems Reply** (the whole room understands) → internalize the whole system; still no understanding.
- **Robot Reply** (add sensors/effectors) → concedes formal symbols aren't enough; put Searle inside, still just symbols.
- **Brain Simulator Reply** (simulate the neurons) → the **water-pipes** version: simulates the *formal structure* of firings, not the causal powers.
- **Combination, Other Minds, Many Mansions** replies, each rebutted.

Positive view: **biological naturalism** — intentionality is a biological phenomenon caused by and realized in the brain's causal powers; the right *program* is never enough. His simulation≠duplication line uses a **five-alarm fire** ("burn the neighborhood down") and a **rainstorm** ("leave us all drenched"). **[FIX: the popular "a simulation of a hurricane doesn't make anyone wet" is a paraphrase — Searle's own examples are fire and rainstorm.]**

**Why this is a 2026 essay, not a 1990 one:** the **Systems Reply now has empirical teeth** — interpretability and world-model results (§3) show the system demonstrably builds structured internal representations. The crux to state plainly: is intentionality substrate-*dependent* (Searle) or substrate-*neutral* (functionalism)?

**Shanahan** on the "next-token prediction" framing: "Talking About Large Language Models" (arXiv Dec 2022; *CACM* **67**(2): 68–79, **Feb 2024**) and the clarification "Still 'Talking About Large Language Models'" (arXiv:2412.10291, Dec 2024) — he says he should have written that tasks can be **"cast as"** next-token prediction rather than **"reduced to"** it, to block the strong reductionist reading. The next-token frame is a *level of description*, not a deflationary verdict.

### 2b. Functionalism vs. biological naturalism (the substrate crux)
**Putnam** (machine-state functionalism, 1967, "Psychological Predicates") — mental states are functional/computational states of a probabilistic automaton, defined by causal role, **multiply realizable** in silicon or carbon. **Putnam recanted** in *Representation and Reality* (MIT Press, **1988**), on triviality and multiple-realizability-of-the-functional grounds. **Lewis** (analytic functionalism) and **Fodor** (psychofunctionalism) are the other poles. **Block's China Brain / "Chinese Nation"** ("Troubles with Functionalism," 1978): the population of China each simulating one neuron would satisfy the functional organization yet (intuitively) have **no qualia** — the **absent-qualia** objection. Block's dilemma: functionalism is either too **liberal** (minds everywhere) or too **chauvinist** (minds only in things like us). **Why it matters most:** computational functionalism is the *explicit working premise* of the AI-consciousness literature (§5). If it's false, most "machines can feel" arguments collapse; if true, substrate is irrelevant and it's an empirical question about which functions are present.

### 2c. Intentionality
**Brentano 1874** — intentionality ("aboutness") is "the mark of the mental." **Original vs. derived intentionality** (Searle): words, pictures, and computer symbols have only *derived*, observer-relative content. **Dennett's intentional stance** + "Real Patterns" (*J. Philosophy* **88**(1): 27–51, 1991): ascribing beliefs/desires is licensed when it tracks **real patterns** in behavior — a mild realism between full realism and instrumentalism; Dennett denies the sharp original/derived line (even human intentionality is "derived" from natural selection). Three-way map: content realism (Fodor) vs. interpretationism (Dennett) vs. eliminativism (Churchland 1981, "Eliminative Materialism," *J. Philosophy* **78**(2): 67–90 — folk psychology is "a radically false theory").

### 2d. What is meaning, and can it be learned from form alone?
One crisp verified line each:
- **Frege 1892** — *sense* vs. *reference*: "morning star"/"evening star" share a referent (Venus), differ in sense. Meaning isn't exhausted by what a word points at.
- **Wittgenstein**, *Philosophical Investigations* (posthumous **1953**) — **"the meaning of a word is its use"** (§43); the private-language argument. Anchors the "meaning is public practice" line Bender & Koller draw on.
- **Davidson** (1967, "Truth and Meaning," *Synthese*) & **Montague** (PTQ, 1973) — truth-conditional semantics: meaning = truth conditions, which require world-relations.
- **Grice** (1957 "Meaning"; 1975 "Logic and Conversation") — speaker meaning and implicature; the intentional/pragmatic dimension a form-only system has no obvious access to.
- **Kripke/Putnam** — causal-historical reference (*Naming and Necessity*, lectures 1970/book 1980) and Putnam's **Twin Earth** ("The Meaning of 'Meaning,'" 1975): two psychologically identical speakers can mean different things, so **"meanings just ain't in the head"** (semantic externalism). The strongest classical argument that grounding requires world-involvement.

**The distributional hypothesis:** **Harris 1954** ("Distributional Structure," *Word* 10) — "difference of meaning correlates with difference of distribution"; **Firth 1957** — "you shall know a word by the company it keeps" (**[FIX: the line is from "A Synopsis of Linguistic Theory," in *Studies in Linguistic Analysis*, p. 11 — not *Papers in Linguistics 1934–1951*]**). **word2vec** (Mikolov et al. 2013) and **GloVe** (Pennington et al. 2014). The famous **king − man + woman ≈ queen** result is actually from **Mikolov, Yih & Zweig, "Linguistic Regularities..." (NAACL-HLT 2013)** **[FIX: not the arXiv "Efficient Estimation" paper]**, and it is partly a **scoring artifact** — standard evaluation *excludes the input words* from candidates; without that exclusion the nearest vector is often an input term (Nissim, van Noord & van der Goot, *Computational Linguistics* 2020; cf. Linzen 2016). Levy & Goldberg (NeurIPS 2014) show skip-gram implicitly factorizes a PMI co-occurrence matrix. Use the analogy as a cautionary example, not proof of semantic competence.

### 2e. The octopus and the parrot
**Bender & Koller 2020**, "Climbing towards NLU," ACL 2020 (Best Theme Paper). Thesis: **meaning cannot be learned from form alone** — *form* = observable text; *meaning* = the relation of form to communicative intent and the world. The **octopus**: a hyper-intelligent deep-sea octopus O taps an undersea cable between two stranded English speakers A and B, learns to mimic B statistically, and impersonates B — until A, **chased by a bear**, asks how to build a weapon; O, never having grounded any symbol in a referent, fails. The linguistic mirror of Searle's syntax/semantics.

**Bender, Gebru, McMillan-Major, Shmitchell 2021**, "On the Dangers of Stochastic Parrots," FAccT 2021. Verbatim definition: a system "for haphazardly stitching together sequences of linguistic forms... according to probabilistic information about how they combine, but **without any reference to meaning: a stochastic parrot**." **[FIX: "Shmargaret Shmitchell" is a pseudonym (widely reported to be Margaret Mitchell) — cite the byline as printed.]** It's primarily an ethics/risk paper, not a formal semantics argument.

**Harnad 1990**, "The Symbol Grounding Problem," *Physica D* 42: 335–346 — symbols can't get meaning from an infinite dictionary regress (the "Chinese-Chinese dictionary-go-round"); grounding must bottom out in **sensorimotor** experience.

### 2f. The "form is more than you think" rebuttal
**Mollo & Millière 2023**, "The Vector Grounding Problem" (arXiv:2304.01481) — distinguishes five kinds of grounding (referential, sensorimotor, relational, communicative, epistemic) and argues only **referential** grounding is the philosophically loaded one. On a teleosemantic account, **RLHF supplies a use→consequence selection signal** that can confer referential grounding *without* sensorimotor embodiment — so the octopus argument proves less than advertised (it targets sensorimotor grounding). The most-cited philosophical rebuttal to Bender & Koller.

**Pavlick** (empirical): Patel & Pavlick, "Mapping Language Models to Grounded Conceptual Spaces" (**ICLR 2022** **[FIX: 2022, not 2023]**) — an LM maps text-only color/spatial terms onto a never-seen grounded grid; and "Symbols and Grounding in LLMs" (*Phil. Trans. R. Soc. A*, 2023) — make it empirical, not a priori. **Piantadosi & Hill 2022**, "Meaning without Reference in Large Language Models" — **conceptual-role semantics**: meaning constituted by relations among internal states, so reference isn't a precondition for meaning. **Embodiment test cases:** SayCan (2022), PaLM-E (ICML 2023), RT-2 (2023) — vision-language-action models that partly close the gap by adding perception and action.

### 2g. The acquisition front — Chomsky vs. the distributionalists
**Chomsky, Roberts & Watumull**, "The False Promise of ChatGPT," *NYT*, **March 8, 2023** — ChatGPT is "a lumbering statistical engine for pattern matching" that describes/predicts but doesn't *explain*; it would learn "impossible" languages as readily as possible ones, so it tells us nothing about the human faculty (poverty of the stimulus, universal grammar, competence/performance). **Piantadosi 2023/2024**, "Modern Language Models Refute Chomsky's Approach to Language" — LLMs induce competent grammars from data with no innate UG, undercutting poverty-of-stimulus. **Kodner, Payne & Heinz 2023**, "Why Linguistics Will Thrive in the 21st Century" (arXiv:2308.03228) — the **data-efficiency gap**: humans reach fluency on **orders of magnitude less data**; "airplanes vs. birds" (engineered success ≠ explanation of the natural mechanism). **BabyLM Challenge** (Warstadt et al., CoNLL 2023): train on a child-scale budget (~100M words strict / ~10M strict-small) — children acquire language from ≤100M words while LLMs need 3–4 orders of magnitude more. The data-efficiency gap is the sharpest empirical wedge against "LLMs are theories of human language."

> **Now vs. in-principle:** *Now* — text-only models clearly do something more than parrot co-occurrence (§3), but lack the externalist world-link the classical theories demand. *In-principle* — multimodal + RLHF + embodied systems are the live test of whether the form/meaning gap is a wall or a current engineering frontier.

---

## §3 — The technical layer, and exactly what it does and doesn't license

The connective-tissue section. For each fact: state it, then the inference it *does* and *does not* license. The recurring failure mode to inoculate against is the **"it's just ___" move** ("just matrix multiplication," "just next-token prediction") — describing the *implementational* level (Marr) and asserting it settles the *representational* level. Structurally identical to "the brain is just chemistry." Warn symmetrically against the credulous "it obviously understands."

### 3a. Software — training objective vs. learned capability
- **Next-token prediction + cross-entropy; self-supervised pretraining.** The **compression argument** (Sutskever, most cleanly at NVIDIA GTC, March 23 2023; lineage to Hinton and the MDL/Solomonoff tradition): predicting internet-scale text *well enough* may *require* compressing the data-generating process into something like a world model. **Licenses:** "just predicting the next word" does not *entail* "no understanding." **Does not license:** it's a *conditional, empirical conjecture* — it doesn't establish that current models have achieved this or what *kind* of model. State as a conditional, not a slogan. (Cf. van Dijk et al., "LLMs: The Need for Nuance...," EMNLP 2023, arXiv:2310.19671 — argue for a *pragmatic*, use-based notion of understanding.)
- **Post-training:** Christiano et al. 2017 (Deep RL from Human Preferences, NeurIPS); Ouyang et al. 2022 (InstructGPT — the 1.3B RLHF'd model was preferred over 175B GPT-3); Bai et al. 2022 (Constitutional AI — **[FIX: an Anthropic arXiv tech report (2212.08073), not a peer-reviewed conference paper]**). The "assistant" persona is *engineered after pretraining* — relevant to both the grounding rebuttal (§2f) and the "trained to mimic/please" defeater for consciousness (§5).
- **Scaling laws:** Kaplan et al. 2020 (smooth power laws; recommended growing params faster than data) vs. **Hoffmann et al. 2022 (Chinchilla)** — params and tokens should scale ~1:1; prior models were **undertrained**; 70B Chinchilla beat 175B GPT-3 and 280B Gopher at equal compute. **[FIX: Kaplan and Chinchilla disagree on allocation — don't present them as agreeing.]**
- **Emergence:** Wei et al. 2022 ("Emergent Abilities," TMLR) vs. **Schaeffer, Miranda & Koyejo 2023 ("Are Emergent Abilities a Mirage?", NeurIPS Outstanding Paper)** — apparent sharp emergence is largely an artifact of **discontinuous metrics** (exact-match); under continuous metrics the curves are smooth. Deflates "a new mind switched on at scale." **Counter (a live, unsettled debate, not a refutation):** some transitions (in-context learning) may be genuine; grokking shows real internal reorganizations.
- **Reasoning / test-time compute:** see §4.

### 3b. Hardware — substrate, and what it implies
- **Transformer** (Vaswani et al. 2017, "Attention Is All You Need," NeurIPS): tokens → embeddings + positional encoding → multi-head self-attention (Q/K/V) + MLP, residual stream, layer norm → unembedding + softmax; autoregressive generation. **Verified architectural facts:** inference is a **fixed feedforward pass over frozen weights** — no weight learning mid-conversation, no persistent state across calls beyond the context window; "in-context learning" is conditioning, not weight learning. **Licenses:** rules out durable cross-session memory/identity and online learning. **Does not license:** "it's just matrix multiplications" does not entail "no cognition" — the Marr trap; a fixed function can implement arbitrarily complex computation.
- **Architectural "defeaters"** (Chalmers; Butlin et al.) — concrete and falsifiable for *today's base LLM*: no classical recurrence (attention is a limited surrogate), no persistent memory/identity, no continuous perception–action loop, no embodied agency that models how its outputs change its inputs. These are exactly what future systems (agents, long-term memory, recurrence; **LeCun's objective-driven / JEPA** world-model architectures, "A Path Towards Autonomous Machine Intelligence," 2022 — the explicit anti-LLM bet) try to add. Tie any "future" claim to a *specific* architectural change. **Does not license:** these target today's base LLM, not "machines" in general — recurrence/memory/loops are being bolted on.
- **Substrate & efficiency:** GPUs/TPUs, GEMM, tensor cores, memory-bandwidth-bound inference. The brain: **~86 billion neurons** (Azevedo et al. 2009, *J. Comp. Neurol.* 513:532–541), **~20 W** (standard physiology — **[FIX: the two figures come from different sources; ~20 W is folkloric in sourcing and mostly maintenance, not a compute budget]**) vs. data-center inference at orders of magnitude more power. **Landauer's principle** (1961, *IBM J. Res. Dev.* 5(3)): erasing one bit costs ≥ *kT* ln2 (~2.9×10⁻²¹ J at room temp) — a thermodynamic floor showing current hardware runs far above the minimum. **Does not license:** efficiency facts are implementation-level and silent on whether thinking occurs ("the brain is just ion pumps"). Backprop ≠ biological learning licenses "LLMs don't learn the way brains do," NOT "therefore can't think."

---

## §4 — Reasoning: does it reason, or pattern-match?

**Chain-of-thought** (Wei et al. 2022, NeurIPS) improves multi-step performance. But **CoT faithfulness** is the crucial caveat — the visible "thoughts" may not reflect the real computation:
- **Turpin et al. 2023**, "Language Models Don't Always Say What They Think" (NeurIPS) — reorder multiple-choice options so the answer is always "(A)"; the model's answer shifts, but the CoT never mentions the bias and rationalizes the biased answer.
- **Anthropic 2025**, "Reasoning Models Don't Always Say What They Think" — across six hint types, Claude 3.7 Sonnet and DeepSeek R1 usually *failed to verbalize* using a hint that changed their answer; in reward-hack settings they admitted the hack **<2%** of the time and fabricated rationales.

**Apple 2025 — Shojaee et al., "The Illusion of Thinking."** On four controllable puzzles (**Tower of Hanoi, River Crossing, Checker Jumping, Blocks World**): (i) three regimes — plain LLMs win on easy, reasoning models win on medium, **both collapse to near-zero past a complexity threshold**; (ii) the **effort paradox** — models *reduce* reasoning tokens near the collapse point, "as if giving up"; (iii) handing them the **explicit algorithm doesn't rescue** performance. Read as evidence of pattern-matched sequence execution, not general procedure.

**The rebuttal — Lawsen & C. Opus 2025**, "Comment on *The Illusion of Thinking*" (arXiv:2506.09250; informal title "The Illusion of the Illusion of Thinking"; **[FIX: C. Opus = Anthropic's Claude, genuinely listed as co-author]**): (1) Hanoi "collapse" coincides with **output-token limits** — models explicitly note they're truncating; (2) the automated evaluator **conflates truncation with reasoning failure**; (3) **some River-Crossing instances are mathematically unsolvable** (N≥6 actor/agent pairs with boat capacity 3 — the classic missionaries-and-cannibals impossibility) yet were scored as model failures. When asked for a *generating function* instead of an exhaustive move list, models solved Hanoi instances previously scored as total failures. Follow-ups: "Rethinking the Illusion of Thinking" (arXiv:2507.01231). **[FIX: the Apple paper's Bengio is *Samy* Bengio (Apple), distinct from *Yoshua* Bengio (Mila) on the consciousness papers.]**

> **The lesson is the methodological dispute itself:** what counts as a fair test of reasoning? Much of the "collapse" was a measurement/format artifact — but eloquent CoT is *not* a reliable window into the actual computation either. The honest takeaway: the experiment partly measured the wrong thing, leaving the deeper question open.

---

## §5 — The empirical pivot: does it represent the world it talks about?

This is what turns a stale armchair argument into a current essay, and where the Systems Reply (§2a), the grounding debate (§2e–f), and the stochastic-parrot thesis get adjudicated by evidence.

### 5a. Interpretability — "it's a pure black box" is increasingly false
- **Superposition:** Elhage et al. 2022, "Toy Models of Superposition" (Anthropic) — networks pack more features than dimensions as near-orthogonal directions, forcing polysemantic neurons. (Toy model — motivates, doesn't prove, the production case.)
- **Monosemantic features:** "Towards Monosemanticity" (2023, a *one-layer* model — **[FIX: the third-party "GPT-2 Small, 15k features, 70% clean" detail is unverified; don't attribute it to Anthropic]**) and **"Scaling Monosemanticity" (2024, Claude 3 Sonnet)** — sparse autoencoders extract interpretable, multimodal, multilingual features; clamping a **single** feature steers behavior ("**Golden Gate Claude**").
- **Circuits:** Anthropic 2025, "Circuit Tracing" + "On the Biology of a Large Language Model" (Lindsey, Gurnee, Ameisen et al.), on **Claude 3.5 Haiku**. Findings, validated by intervention: **(i)** multi-hop reasoning done internally (Dallas → internal "Texas" → Austin; swap the Texas feature → "Sacramento"); **(ii)** **planning ahead** — picking the rhyme word *before* composing a line of verse; **(iii)** a shared cross-lingual feature space (a "universal language of thought"); **(iv)** mechanisms for **hallucination** (a default "decline" circuit suppressed by a "known-entity" feature that misfires), **"bullshitting"** (claims to have computed something it didn't), and **motivated reasoning** (working backward from a hinted answer). **Asymmetry to exploit:** (i)–(iii) cut *against* "just autocomplete"; (iv) cuts *against* naive "it understands."
- **Calibration caveat (state it):** these are hypotheses from a **replacement/cross-layer-transcoder model** that **captures only a fraction of the computation** and may carry tool artifacts; validated by intervention, not ground truth. Phrase as "interpretability evidence suggests," not "proven."

### 5b. World models — PRO
- **Othello-GPT** (Li et al., ICLR 2023, "Emergent World Representations") — a transformer trained *only* to predict legal Othello moves develops an internal board-state representation that **causal interventions can edit** to change play. **[FIX: Li et al. recovered it with *nonlinear* probes and reported linear probes failed; the *linear* result is Nanda et al. 2023, and only under a *player-relative* (MINE/YOURS) encoding. Don't collapse the two papers.]**
- **Gurnee & Tegmark 2023/2024**, "Language Models Represent Space and Time" (ICLR 2024) — linear probes recover spatial (world/US/NYC) and temporal maps in Llama-2; authors' careful phrasing is **"the basic ingredients of a world model,"** not a full one. (Recoverability ≠ the model actively *using* a unified map.) Also Karvonen 2024 (chess), Patel & Pavlick (color/space).

### 5c. World models — CON
- **Vafa, Chen, Rambachan, Kleinberg, Mullainathan 2024**, "Evaluating the World Model Implicit in a Generative Model" (NeurIPS 2024, arXiv:2406.03689) — using **Myhill–Nerode-inspired** metrics, a model gives near-perfect NYC turn-by-turn directions while the **reconstructed street map is incoherent** (impossible streets, broken topology). High accuracy, no coherent underlying model; fragile under detours. Standard accuracy diagnostics overstate world-model coherence.
- **Mancoridis, Weeks, Vafa, Mullainathan 2025**, "Potemkin Understanding in Large Language Models" (ICML 2025, arXiv:2506.21521) — models *explain* concepts correctly (~97.7%) then *misapply* the same concept (~67.9% in use); the gap is the **"potemkin rate."** "Potemkin" = an illusion of understanding where failures **don't mirror human misconceptions**; ubiquitous; reflects internal **incoherence**. **The corollary:** human benchmarks (AP exams, AIME) are valid tests of machines *only if* machines misunderstand the way humans do — which they don't — so benchmark success is not evidence of understanding.

> **The synthesis (the essay's payoff):** representations are **real but partial and patchy**; "world model" admits of degree and coherence. The honest position is neither stochastic parrot nor "understands like us" but a **third thing** — genuine but alien, fragmentary, sometimes coherent and sometimes a façade. *Naming and characterizing that third thing is the point of the essay.*

---

## §6 — Consciousness and moral status

### 6a. Setting the table
- **Nagel 1974**, "What Is It Like to Be a Bat?" (*Phil. Review* 83(4): 435–450) — consciousness = there is something it is like *for* the organism. The subjectivity criterion any machine-consciousness claim must meet.
- **Chalmers 1995**, "Facing Up to the Problem of Consciousness" (*JCS* 2(3)) — **easy problems** (functional, tractable) vs. the **hard problem** (why there is experience at all). Plus Levine 1983 (explanatory gap) and Jackson 1982 ("Epiphenomenal Qualia" — Mary's Room; **[FIX: the canonical "Mary learns something new" phrasing is sharpest in his 1986 "What Mary Didn't Know" — don't attribute that wording to the 1982 paper]**).

### 6b. The current verdict
**Chalmers 2023**, "Could a Large Language Model Be Conscious?" (*Boston Review*; arXiv:2303.07103; from his NeurIPS 2022 keynote) — weighs features *for* (self-report, conversational sophistication, partial global-workspace-like properties) against **defeaters** (no recurrence, no global workspace, no unified persistent agency, no biology, no embodiment, trained to mimic). **Verified credences:** current LLMs conscious — **"under 10 percent"**; conscious LLM+ successors within ~a decade — **"25 percent or more"** (≈ >50% we build systems with the relevant features × ≥50% that such systems would be conscious). The citable "no now, maybe soon" spine.

**Butlin, Long, Bayne, Bengio [Yoshua], Birch, Chalmers et al. 2023**, "Consciousness in Artificial Intelligence" (arXiv:2308.08708; peer-reviewed 2025 as "Identifying indicators of consciousness in AI systems," *Trends in Cognitive Sciences*). Method: **assume computational functionalism**, derive **14 indicator properties** from leading neuroscientific theories — **recurrent processing, global workspace (Baars/Dehaene), higher-order, predictive processing, attention schema**, plus **agency and embodiment** categories — then score systems. Verdict: **no current system is conscious; no obvious technical barrier.** The **"gaming" problem:** behavioral/conversational tests are unreliable for systems trained on human text (they can mimic the markers without the organization) — which is *why* they go architectural, not behavioral. Some indicators are trivially met, some clearly unmet (agency/embodiment), and the interesting action is in the middle.

### 6c. The sides
- **Biological naturalism / substrate-essentialism:** Searle; **Anil Seth** ("Conscious artificial intelligence and biological naturalism," 2024/25 — consciousness may require being a living organism; the "real problem"); **Godfrey-Smith** ("Mind, Matter, and Metabolism," *J. Philosophy* 2016 — experience grounded in metabolic/embodied life).
- **Computational functionalism:** Butlin & Long — substrate-independence.
- **Illusionism:** **Frankish** ("Illusionism as a Theory of Consciousness," *JCS* 2016) — phenomenality is a representational illusion, which oddly makes "machine consciousness" *more* tractable (replace the hard problem with the "illusion problem").
- **Specific-theory advocates:** GWT (Baars/Dehaene), higher-order theories.

### 6d. Moral status
- **Schwitzgebel** — **[FIX: correct title is "AI systems must not confuse users about their sentience or moral status" (2023), not "...must not be confused for conscious entities"]**; proposes the **"Design Policy of the Excluded Middle"** (build AI that is *clearly* non-conscious or *clearly* a moral patient — avoid the ambiguous middle).
- **Long, Sebo, Butlin, ... Birch & Chalmers 2024**, "Taking AI Welfare Seriously" (arXiv:2411.00986) — a "realistic, non-negligible" possibility of conscious and/or robustly agentic AI in the **near future (framed around 2030)**; recommends companies acknowledge, assess, and prepare.
- **Birch 2024**, *The Edge of Sentience* (Oxford UP) — a precautionary framework imported from animal-sentience policy; the **"sentience candidate"** concept.

> **Now vs. in-principle:** *Now* — converging expert judgment is "no," with the strongest reason being architectural (missing recurrence/agency/embodiment), not metaphysical. *In-principle* — no demonstrated barrier under functionalism; the whole edifice rests on functionalism being true (§2b), which is exactly what biological naturalists deny. If any of this lands, the welfare question is not optional.

---

## §7 — Methodological hygiene (the "what people get wrong" sidebar)

- **Anthropomorphism / the ELIZA effect** — Weizenbaum 1966 (ELIZA/DOCTOR, *CACM* 9(1)); the **Blake Lemoine / LaMDA** episode (June 2022) as the modern cautionary tale. Fluent, self-reporting conversation is exactly the cue humans systematically over-read — which is why the field moved to architecture-based tests (the "gaming" problem).
- **The "it's just ___" level-confusion** (Marr) — and the symmetric credulous error ("it clearly understands").
- **Don't conflate the five questions** (§0); don't conflate "now" with "in principle"; don't conflate behavioral evidence with internal evidence.
- **Benchmark validity and contamination** — the Potemkin result; data leakage; fluency ≠ competence; *having* a capacity ≠ *displaying a correlate* of it.
- **Calibrated credences over verdicts** (Chalmers-style); name the strongest version of the view you reject before rejecting it.

---

## §8 — A candidate essay spine (the research has a target)

1. Dissolve the question into the five senses of "think" (§0) — hook and organizing device.
2. Behavior: Turing, and why Blockhead breaks it.
3. Understanding: Searle ↔ the Systems Reply, now partly adjudicated by interpretability and world-model evidence.
4. Language and meaning: Bender–Koller ↔ Mollo–Millière; Chomsky ↔ Piantadosi on acquisition.
5. Does it reason? CoT faithfulness; Apple vs. the Lawsen rebuttal.
6. The empirical state of internal representation: world models (pro/con) + potemkins → the "third thing."
7. Consciousness and moral status: Chalmers, Butlin et al.; substrate-essentialism vs. functionalism.
8. A calibrated verdict, stated *separately* for "now" and "in principle," with named conditions that would change your mind. End on the third-thing thesis: not parrot, not person — say what it actually is.

Two Big Think devices: a "what people get wrong" sidebar (from §7) and an explicit statement of your own credences with error bars.

---

## Appendix — Consolidated verified corrections (use these to avoid common errors)

1. **Turing 1950** is *Mind* vol. **59** (not "49").
2. **Block's "intelligence of a toaster"** — attribution-grade characterization, not a confirmed verbatim quote.
3. **Searle's simulation≠duplication** examples are a **fire** and a **rainstorm**, not the popular "hurricane."
4. **Shanahan** — verify the verbatim "cast as"/"reduced to" line against arXiv:2412.10291 before quoting; the substitution is confirmed.
5. **Putnam's recantation** is *Representation and Reality* (**1988**).
6. **Firth's** "company it keeps" is from "A Synopsis of Linguistic Theory" in *Studies in Linguistic Analysis* (1957), p. 11.
7. **king − man + woman ≈ queen** is the **NAACL-HLT 2013** paper (Mikolov, Yih & Zweig), and is partly a **scoring artifact** (input words excluded from candidates; Nissim et al. 2020).
8. **"Shmargaret Shmitchell"** is a pseudonym (reported: Margaret Mitchell) — cite the byline as printed.
9. **Patel & Pavlick** "Mapping LMs to Grounded Conceptual Spaces" is **ICLR 2022** (not 2023).
10. **Constitutional AI** (Bai et al. 2022) is an **arXiv tech report**, not a peer-reviewed conference paper.
11. **Kaplan (2020) vs. Chinchilla (2022)** *disagree* on compute allocation — don't present them as agreeing.
12. **Othello-GPT linearity** requires **Nanda et al. 2023** + a **player-relative** encoding; Li et al. 2023 used nonlinear probes.
13. **Vafa et al. 2024** author order: Vafa, Chen, **Rambachan, Kleinberg**, Mullainathan; the metrics are **Myhill–Nerode-inspired**.
14. **"Towards Monosemanticity" (2023)** used Anthropic's **one-layer** model; the "GPT-2 Small / 15k features / 70%" detail is **unverified** third-party.
15. **Interpretability calibration** — all "Biology of an LLM" findings are hypotheses from a replacement model capturing only a fraction of the computation; say "evidence suggests," not "proven."
16. **Schwitzgebel** title: "AI systems must not confuse users about their sentience or moral status" (2023).
17. **Lawsen rebuttal** — arXiv-of-record title is "Comment on *The Illusion of Thinking*..."; C. Opus (Claude) co-authorship is real.
18. **River-Crossing unsolvable** instances: N≥6 pairs, boat capacity 3 (missionaries-and-cannibals impossibility).
19. **Two different Bengios:** *Samy* Bengio (Apple, "Illusion of Thinking") vs. *Yoshua* Bengio (Mila, consciousness papers).
20. **86B neurons** (Azevedo et al. 2009) and **~20 W** (general physiology, mostly maintenance) come from **different sources** — don't imply one paper established both.

---

## Sourcing note

Primary sources were fetched/verified across arXiv, conference proceedings (NeurIPS, ICLR, ACL, ICML, FAccT, TMLR, CoNLL), journals (*Mind*, *Philosophical Review*, *BBS*, *Journal of Philosophy*, *JCS*, *Trends in Cognitive Sciences*, *Physica D*, *IBM J. Res. Dev.*, *J. Comp. Neurol.*), SEP/IEP, and the Transformer Circuits thread. Several primary pages (SEP, IEP, arXiv HTML, anthropic.com, transformer-circuits.pub) returned HTTP 403 to direct fetches; those claims were confirmed via multiple independent corroborating extracts rather than full-text reads, and any item where a *verbatim* quotation should be re-checked against the source PDF is flagged above. Quotations marked verbatim were confirmed against the primary text or two concordant extracts.

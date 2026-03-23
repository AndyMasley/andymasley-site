export type LearningSceneKey =
  | 'scene-1'
  | 'scene-2'
  | 'scene-3'
  | 'scene-4'
  | 'scene-5'
  | 'scene-6'
  | 'scene-7'
  | 'scene-8'
  | 'sandbox';

export interface StoryJourneyStep {
  key: LearningSceneKey;
  label: string;
  scale: string;
  lesson: string;
}

export interface BeginnerGlossaryTerm {
  term: string;
  short: string;
  detail: string;
}

export interface SceneLearningCard {
  label: string;
  title: string;
  scale: string;
  goal: string;
  plainLanguage: string;
  watchFor: string;
  newWords: string[];
  commonConfusion: string;
  takeaway: string;
}

export interface SceneBridgeCard {
  changed: string;
  realHardware: string;
  conceptualOverlay: string;
  whyItMatters: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQBlock {
  eyebrow: string;
  title: string;
  intro: string;
  items: FAQItem[];
}

export const BEGINNER_OVERVIEW_CARDS = [
  {
    title: 'Who this is for',
    body:
      'This guide is written for someone who knows little or nothing about AI chips, inference, or data-center hardware.',
  },
  {
    title: 'What this story follows',
    body:
      'It follows one prompt from the chat box to the hardware that answers it, then to the heat that answer creates, and finally to the economics of that work.',
  },
  {
    title: 'What kind of AI work this is',
    body:
      'This is about inference: using a model that already exists to answer a request. It is not about training the model from scratch.',
  },
  {
    title: 'How to read it',
    body:
      'Blue usually means data moving, gold means compute work, red means heat, cyan means coolant, and pale white means airflow or supporting context.',
  },
] as const;

export const BEGINNER_CORE_IDEAS = [
  'A prompt uses a short slice of a much larger shared machine.',
  'The chip reuses the same hardware over and over instead of having one physical region per model layer.',
  'Long answers usually cost more than short prompts because the answer loop repeats many times.',
  'The heat from that work has to leave through a real cooling system.',
  'The final number depends on what boundary you choose to count.',
] as const;

export const BEGINNER_READING_RULES = [
  'Prompt, request, and answer are different things: the prompt is your text, the request is the machine-ready job, and the answer is what comes back.',
  'Rack, tray, board, package, and die are nested physical objects, each inside the next.',
  'Power is an instantaneous rate. Energy is the total over time.',
  'Prefill is the full prompt pass before the first answer token. Decode is the repeated loop that adds the answer token by token.',
] as const;

export const STORY_JOURNEY_STEPS: StoryJourneyStep[] = [
  {
    key: 'scene-1',
    label: '1. Chat to request',
    scale: 'Interface',
    lesson: 'Your text becomes a machine-ready request inside an already-running service.',
  },
  {
    key: 'scene-2',
    label: '2. Inside the rack',
    scale: 'Rack',
    lesson: 'One request lands inside a tall cabinet full of shared computing hardware.',
  },
  {
    key: 'scene-3',
    label: '3. Open the tray',
    scale: 'Tray and board',
    lesson: 'The rack contains trays, boards, packages, and cooling hardware around the chosen module.',
  },
  {
    key: 'scene-4',
    label: '4. Inside the die',
    scale: 'Silicon die',
    lesson: 'The chip is a map of repeated compute neighborhoods, cache, and memory gateways.',
  },
  {
    key: 'scene-5',
    label: '5. Prefill',
    scale: 'Full prompt pass',
    lesson: 'The whole prompt crosses every layer before the first answer token appears.',
  },
  {
    key: 'scene-6',
    label: '6. Decode',
    scale: 'Answer loop',
    lesson: 'After the first token, the model repeats a narrower memory-heavy loop for each new token.',
  },
  {
    key: 'scene-7',
    label: '7. Cooling',
    scale: 'Thermal path',
    lesson: 'The work becomes heat that must leave through solids, liquid loops, airflow, and facility equipment.',
  },
  {
    key: 'scene-8',
    label: '8. Economics',
    scale: 'Shared service',
    lesson: 'One prompt is a small, shared, optimized slice of a much larger system.',
  },
  {
    key: 'sandbox',
    label: '9. Sandbox',
    scale: 'Try the levers',
    lesson: 'Change the prompt, output, architecture, and accounting boundary to see the slice change shape.',
  },
] as const;

export const BEGINNER_GLOSSARY: BeginnerGlossaryTerm[] = [
  {
    term: 'Inference',
    short: 'Using an already-trained model to answer a request.',
    detail:
      'Inference is the live answering stage. The model already exists; the system is just using it to produce a response.',
  },
  {
    term: 'Token',
    short: 'A text piece the model handles internally.',
    detail:
      'A token is not always a whole word. It is a chunk of text the model uses as its working pieces.',
  },
  {
    term: 'Request',
    short: 'The machine-ready job created from your prompt.',
    detail:
      'After your text is prepared and routed, it becomes a structured request the serving system can schedule.',
  },
  {
    term: 'Accelerator',
    short: 'A specialized chip for the heavy math.',
    detail:
      'This is the hardware that does the largest share of the parallel matrix math used by the model.',
  },
  {
    term: 'Rack',
    short: 'A tall cabinet full of computing equipment.',
    detail:
      'A rack holds trays, networking, power equipment, and cooling connections in one shared machine frame.',
  },
  {
    term: 'Tray',
    short: 'A shelf-like unit that slides into the rack.',
    detail:
      'A tray contains boards, modules, and local support hardware. It is one level below the rack.',
  },
  {
    term: 'Package',
    short: 'The physical module that holds the compute die and nearby memory.',
    detail:
      'The package is the object the cooler touches. It can contain the central compute die plus several HBM stacks.',
  },
  {
    term: 'Die',
    short: 'The actual silicon chip inside the package.',
    detail:
      'The die is the silicon itself. It contains repeated compute regions, cache, memory controllers, and interconnect logic.',
  },
  {
    term: 'HBM',
    short: 'Very fast memory placed very close to the compute die.',
    detail:
      'HBM stands for High Bandwidth Memory. It sits on the package so the chip can move data quickly.',
  },
  {
    term: 'Cache',
    short: 'Short-term memory used to avoid slower trips to larger memory.',
    detail:
      'The chip keeps frequently needed data in smaller, faster memory so it does not need to go back to farther memory every time.',
  },
  {
    term: 'Prefill',
    short: 'The full prompt pass before the first answer token appears.',
    detail:
      'During prefill, the system processes the entire prompt, builds the KV cache, and gets ready to emit the first answer token.',
  },
  {
    term: 'Decode',
    short: 'The repeated loop that adds the answer one token at a time.',
    detail:
      'After prefill, the model repeatedly generates one new token, appends it to the answer, and uses the updated history for the next step.',
  },
  {
    term: 'KV cache',
    short: 'Stored attention state reused on later steps.',
    detail:
      'The model saves key and value tensors so it does not need to recompute the entire history from scratch for every new token.',
  },
  {
    term: 'TTFT',
    short: 'Time to first token.',
    detail:
      'This is the waiting time from request arrival until the first visible answer token appears.',
  },
  {
    term: 'TBT',
    short: 'Time between tokens.',
    detail:
      'This is the gap between one answer token and the next, which shapes how smooth the response feels.',
  },
  {
    term: 'Boundary',
    short: 'What you choose to count.',
    detail:
      'A chip-only boundary counts less than a server boundary, and a full-facility boundary counts more because it includes more supporting infrastructure.',
  },
  {
    term: 'MoE',
    short: 'A model where only some specialist parts wake up on each step.',
    detail:
      'Mixture-of-Experts models can have many total parameters but only use a subset of them on each token.',
  },
] as const;

export const SCENE_LEARNING_CARDS: Record<LearningSceneKey, SceneLearningCard> = {
  'scene-1': {
    label: 'Scene 1 guide',
    title: 'The request begins as ordinary text, then becomes a machine job.',
    scale: 'Scale: interface to live service',
    goal: 'Understand that the answer starts in an already-running shared service, not in a chip that wakes up just for you.',
    plainLanguage:
      'You type a question. The system chops it into model-friendly pieces, wraps it into a request, and prepares it for the hardware that will answer it.',
    watchFor:
      'Watch the text turn into tokens, then into a request capsule, then into scheduled work moving toward the accelerator.',
    newWords: ['inference', 'token', 'request', 'accelerator', 'boundary'],
    commonConfusion:
      'A common misunderstanding is thinking the chat box is already the model. It is not. The chat interface is only the front door to a bigger system.',
    takeaway:
      'By the end of this scene, your question is no longer just text. It is a machine-ready job headed into shared hardware.',
  },
  'scene-2': {
    label: 'Scene 2 guide',
    title: 'The request now lives inside a rack-scale machine.',
    scale: 'Scale: rack',
    goal: 'Understand what a rack is and why one prompt is tiny relative to the surrounding hardware.',
    plainLanguage:
      'A rack is a tall cabinet filled with computing equipment. Your request lands in one part of that cabinet, not on a whole machine reserved just for you.',
    watchFor:
      'Watch how one tray is highlighted while networking, power, and cooling paths stay visible around it.',
    newWords: ['rack', 'tray', 'fabric', 'manifold', 'hybrid cooling'],
    commonConfusion:
      'Do not imagine one prompt owning a whole rack. The rack is shared infrastructure handling many requests at once.',
    takeaway:
      'By the end of this scene, you should see the rack as the shared physical home around the request, not as a single-purpose box.',
  },
  'scene-3': {
    label: 'Scene 3 guide',
    title: 'Now we open the tray and find the board, package, and cooling stack.',
    scale: 'Scale: tray to package',
    goal: 'Understand the nested physical objects between the rack and the die.',
    plainLanguage:
      'Inside the rack is a tray. Inside the tray is a board. On the board is a package. Inside the package is the die that actually computes.',
    watchFor:
      'Watch the selected module stay in context while the shell, board, package, HBM, and cooling stack separate into layers.',
    newWords: ['board', 'package', 'die', 'HBM', 'TIM'],
    commonConfusion:
      'A package is not the same thing as the die. The package is the larger object that contains the die and nearby memory.',
    takeaway:
      'By the end of this scene, you should know exactly where the compute die sits inside the larger hardware stack.',
  },
  'scene-4': {
    label: 'Scene 4 guide',
    title: 'The die is a reusable hardware map, not a tiny picture of the whole model.',
    scale: 'Scale: silicon die',
    goal: 'Understand that the same hardware blocks are reused layer after layer.',
    plainLanguage:
      'The chip is made of repeated compute neighborhoods, shared cache, and memory gateways. The model keeps reusing the same hardware instead of having one physical chip region per layer.',
    watchFor:
      'Watch the model-layer overlay move while the hardware map stays fixed. That is the key lesson of this scene.',
    newWords: ['die', 'SM', 'cache', 'memory controller', 'Transformer Engine'],
    commonConfusion:
      'The model’s layers are software structure. They are not physically etched into separate districts of the silicon.',
    takeaway:
      'By the end of this scene, you should see the die as a reusable map of compute and memory, not as one giant magical brain region.',
  },
  'scene-5': {
    label: 'Scene 5 guide',
    title: 'Prefill is the wide pass over the whole prompt.',
    scale: 'Scale: full prompt pass',
    goal: 'Understand why the system does a lot of work before the first answer token appears.',
    plainLanguage:
      'Before the answer starts, the whole prompt has to move through every layer. The system also builds saved attention state, called the KV cache, during this pass.',
    watchFor:
      'Watch the full width of the prompt stay active, the cache wall fill row by row, and the first answer token wait until the end.',
    newWords: ['prefill', 'KV cache', 'attention', 'TTFT'],
    commonConfusion:
      'Beginners often imagine the answer starts the moment the prompt enters the model. In reality, the full prompt pass comes first.',
    takeaway:
      'By the end of this scene, you should know why long prompts raise the cost of reaching the first visible answer token.',
  },
  'scene-6': {
    label: 'Scene 6 guide',
    title: 'Decode is the narrow loop that grows the answer one token at a time.',
    scale: 'Scale: answer loop',
    goal: 'Understand why long answers often matter more than prompt size.',
    plainLanguage:
      'After the first token, the model enters a loop. Each step reads the model and stored history, produces one new token, appends it to the answer, and repeats.',
    watchFor:
      'Watch one new token appear, the cache grow by one more slice, and the timing meter tick between tokens.',
    newWords: ['decode', 'TBT', 'paged memory', 'batching'],
    commonConfusion:
      'Decode is narrower than prefill, but it is not trivial. Long answers repeat this loop many times, which is why they can dominate the total bill.',
    takeaway:
      'By the end of this scene, you should understand that answer generation is a repeated loop, not one smooth blur.',
  },
  'scene-7': {
    label: 'Scene 7 guide',
    title: 'All that work becomes heat, and the heat has to leave in stages.',
    scale: 'Scale: thermal path',
    goal: 'Understand where the coolant is, where the air is, and how the rack sends heat out of the machine.',
    plainLanguage:
      'Heat first moves through solid hardware, then into a cold plate or heatsink, then into moving liquid or air, then into rack plumbing and facility equipment.',
    watchFor:
      'Watch the local chip stack first, then the tray plumbing, then the rack manifold, then the CDU and building-side loop.',
    newWords: ['cold plate', 'manifold', 'CDU', 'TCS', 'FWS'],
    commonConfusion:
      'The coolant is not touching the silicon. It is sealed inside the cold plate above the package.',
    takeaway:
      'By the end of this scene, you should be able to trace heat from the die all the way to the larger cooling system.',
  },
  'scene-8': {
    label: 'Scene 8 guide',
    title: 'One prompt is cheap because it is only a short, shared slice of a large machine.',
    scale: 'Scale: economics and accounting',
    goal: 'Understand how large, hot, expensive infrastructure can still lead to a very small per-prompt energy number.',
    plainLanguage:
      'The machine stays huge. Your prompt stays small. The number changes depending on how long the work lasts, how much is shared, what part is reused, and what boundary you count.',
    watchFor:
      'Watch the same prompt slice stay fixed while the boundary grows, batches get larger, outputs get longer, and reuse makes some work cheaper.',
    newWords: ['power', 'energy', 'batch', 'prefix reuse', 'MoE'],
    commonConfusion:
      'Prompt energy, infrastructure allocation, and product price are related, but they are not the same number.',
    takeaway:
      'By the end of this scene, you should know why one prompt can be cheap even on very large hardware.',
  },
  sandbox: {
    label: 'Sandbox guide',
    title: 'Now try changing the size of the prompt slice yourself.',
    scale: 'Scale: interactive model',
    goal: 'Use the controls to connect the earlier physical scenes to the final economics story.',
    plainLanguage:
      'Change prompt length, answer length, service mode, architecture, deployment shape, and accounting boundary. The numbers change because the slice changes shape.',
    watchFor:
      'Watch which changes affect prompt energy most, which ones mostly change infrastructure allocation, and which ones mostly change waiting time.',
    newWords: ['illustrative model', 'infrastructure allocation'],
    commonConfusion:
      'The sandbox is a teaching model built from published examples. It is meant to show direction and mechanism, not promise one universal number.',
    takeaway:
      'By the end of the sandbox, you should be able to explain why short shared work can be cheap and long repeated work can become expensive.',
  },
};

export const SCENE_BRIDGE_CARDS: Partial<Record<LearningSceneKey, SceneBridgeCard>> = {
  'scene-2': {
    changed:
      'We just moved from the app-side request path into the first big physical object: the rack that contains the shared serving hardware.',
    realHardware:
      'The rack, trays, networking, power equipment, manifolds, and service side are all real physical hardware.',
    conceptualOverlay:
      'The colored paths simplify how data, power, airflow, and coolant move. They are teaching overlays, not literal wiring diagrams.',
    whyItMatters:
      'This is the first time the user can see how tiny one prompt is compared with the larger machine that answers it.',
  },
  'scene-3': {
    changed:
      'We zoomed from the rack into one tray and then into the board, package, memory stacks, and cooling stack around one selected module.',
    realHardware:
      'The tray, board, package, HBM stacks, lid, thermal interface, and cold plate or heatsink are real physical layers.',
    conceptualOverlay:
      'The x-ray depth and the colored paths help separate those layers visually. They are meant to explain the stack, not mimic every hidden trace.',
    whyItMatters:
      'Beginners usually struggle most with package versus die. This scene makes the nesting physically legible before the die opens.',
  },
  'scene-4': {
    changed:
      'We left the package context behind and opened the die itself, which is the actual silicon chip inside the package.',
    realHardware:
      'The die floorplan, repeated compute districts, shared cache region, memory gateways, and edge links are hardware structure.',
    conceptualOverlay:
      'The model-layer overlay is a software view placed next to the hardware map so the user can see hardware reuse without confusing the two.',
    whyItMatters:
      'This scene fixes the wrong mental model that one model layer lives in one physical place on the chip.',
  },
  'scene-5': {
    changed:
      'The static die map now comes alive as the full prompt passes through every layer before the answer begins.',
    realHardware:
      'The same die map and memory hierarchy from Scene 4 are still the hardware truth underneath this scene.',
    conceptualOverlay:
      'The token-by-layer grid and attention inset are logical views that explain model behavior rather than literal etched structures on the chip.',
    whyItMatters:
      'This is where users first feel why the system does a lot of work before showing the first answer token.',
  },
  'scene-6': {
    changed:
      'The wide prompt pass collapses into a repeated one-token loop, and the stored cache becomes the star of the scene.',
    realHardware:
      'The die, cache growth, and memory-heavy paths are still hardware and systems behavior, even though the answer ribbon is now the most visible object.',
    conceptualOverlay:
      'The answer ribbon and token chooser explain what the user sees, while the cache wall and die pulses explain what the system is doing underneath.',
    whyItMatters:
      'This is the key step for understanding why long answers often cost more than people expect.',
  },
  'scene-7': {
    changed:
      'The electrical work from the earlier scenes is now being followed as heat moving out through the hardware stack and cooling loops.',
    realHardware:
      'The cold plate, tubing, quick disconnects, rack manifold, CDU, and facility loop are real physical equipment in the cooling path.',
    conceptualOverlay:
      'The heat field stays relative on purpose. It shows where the heat goes without pretending to know exact public per-zone temperatures.',
    whyItMatters:
      'This scene answers where the coolant is, where the air is, and how the heat actually leaves the machine.',
  },
  'scene-8': {
    changed:
      'The physical story becomes an allocation story: the same machine remains large, but the prompt is now shown as one shared economic slice.',
    realHardware:
      'The rack, chip, and cooling system are still the real foundation underneath the economics. The story has not stopped being physical.',
    conceptualOverlay:
      'The prompt slice, stacked bars, and boundary cards are accounting views built on top of the earlier hardware scenes.',
    whyItMatters:
      'Without this step, the earlier hardware detail can feel disconnected from the final question of why one prompt is often cheap.',
  },
  sandbox: {
    changed:
      'The fixed story turns into a live model you can manipulate directly by changing prompt shape, sharing, architecture, and accounting boundary.',
    realHardware:
      'The chip silhouette and service slice keep the sandbox tied to the same machine story you just learned.',
    conceptualOverlay:
      'The numbers are a teaching model synthesized from published examples. They show mechanism and direction, not a universal provider promise.',
    whyItMatters:
      'A beginner can finally test the story instead of just reading it.',
  },
};

export const LEARNING_FAQ_BLOCKS: Record<
  'basics' | 'silicon' | 'serving' | 'economics',
  FAQBlock
> = {
  basics: {
    eyebrow: 'Quick FAQ',
    title: 'Basic hardware questions so far',
    intro:
      'These are the beginner questions most people still have after the first rack and tray scenes.',
    items: [
      {
        question: 'What is a rack?',
        answer:
          'A rack is a tall cabinet full of computing equipment. It is the big shared machine frame that holds trays, power hardware, networking, and cooling connections.',
      },
      {
        question: 'What is a tray?',
        answer:
          'A tray is a shelf-like unit that slides into the rack. It holds boards and the compute hardware used by the request.',
      },
      {
        question: 'What is the difference between a package and a die?',
        answer:
          'The package is the larger physical module the cooler touches. The die is the actual silicon chip inside that package.',
      },
      {
        question: 'What is HBM?',
        answer:
          'HBM is very fast memory placed very close to the compute die so the chip can move data quickly.',
      },
    ],
  },
  silicon: {
    eyebrow: 'Quick FAQ',
    title: 'Questions about the chip and the prompt pass',
    intro:
      'These answers help beginners bridge the jump from hardware layout to model behavior.',
    items: [
      {
        question: 'Are model layers physically etched into different parts of the chip?',
        answer:
          'No. The model’s layers are software structure. The same hardware districts on the chip are reused again and again as each layer runs.',
      },
      {
        question: 'Why does the first token take longer?',
        answer:
          'Because the system has to process the full prompt first. That wide prefill pass happens before the first answer token can appear.',
      },
      {
        question: 'What is the KV cache in plain language?',
        answer:
          'It is saved attention state. The model stores it so later answer tokens can reuse earlier work instead of recomputing the whole prompt history every time.',
      },
      {
        question: 'Why do long prompts feel heavier?',
        answer:
          'Long prompts widen prefill because the whole prompt has to cross every layer before the answer begins.',
      },
    ],
  },
  serving: {
    eyebrow: 'Quick FAQ',
    title: 'Questions about answer generation and memory',
    intro:
      'This is where beginners usually start asking why long answers feel slow or expensive.',
    items: [
      {
        question: 'Why do long answers cost more?',
        answer:
          'Because the model repeats the decode loop once per emitted token. More output tokens mean more repeated passes through the model.',
      },
      {
        question: 'Is the GPU only working on my answer?',
        answer:
          'Often no. Serving systems commonly batch and multiplex several users’ work together so the hardware stays busy.',
      },
      {
        question: 'What is time-between-tokens?',
        answer:
          'It is the gap between one answer token and the next. It is what makes an answer stream feel smooth or choppy.',
      },
      {
        question: 'Why does the cache keep growing?',
        answer:
          'Because each new answer token becomes part of the history the model will use on the next step.',
      },
    ],
  },
  economics: {
    eyebrow: 'Quick FAQ',
    title: 'Questions about cost, sharing, and accounting',
    intro:
      'These are the last beginner questions the economics scene is trying to answer.',
    items: [
      {
        question: 'How can a giant machine make one prompt cheap?',
        answer:
          'Because one prompt is only a short slice of machine time inside a shared service, not the full cost of owning the whole machine by itself.',
      },
      {
        question: 'Does product price equal electricity cost?',
        answer:
          'No. Electricity matters, but service price also depends on hardware cost, maintenance, reserve capacity, networking, software, and product decisions.',
      },
      {
        question: 'What does the accounting boundary change?',
        answer:
          'It changes what you count: just the accelerator, the whole server, or the fuller service including reserve capacity and facility overhead.',
      },
      {
        question: 'Why does batching help?',
        answer:
          'Because more requests can share the same machine moment, which spreads some fixed background work across more users and tokens.',
      },
    ],
  },
};

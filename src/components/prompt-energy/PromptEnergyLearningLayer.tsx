import { useEffect, useState } from 'react';
import {
  BEGINNER_CORE_IDEAS,
  BEGINNER_GLOSSARY,
  BEGINNER_OVERVIEW_CARDS,
  BEGINNER_READING_RULES,
  LEARNING_FAQ_BLOCKS,
  SCENE_BRIDGE_CARDS,
  SCENE_LEARNING_CARDS,
  STORY_META_FACTS,
  STORY_JOURNEY_STEPS,
  VISUAL_LEGEND_ITEMS,
  type FAQBlock,
  type LearningSceneKey,
} from './promptEnergyLearningData';

function ScaleNestDiagram() {
  const levels = ['Chat app', 'Rack', 'Tray', 'Board', 'Package', 'Die'];

  return (
    <div className="pe-learn__nest" aria-label="Nested hardware scale diagram">
      {levels.map((level, index) => (
        <span
          key={level}
          className="pe-learn__nest-level"
          style={{ width: `${100 - index * 12}%` }}
        >
          {level}
        </span>
      ))}
    </div>
  );
}

function PowerEnergyPrimer() {
  return (
    <div className="pe-learn__power-card" aria-label="Power versus energy primer">
      <div className="pe-learn__power-rate">
        <span>Power</span>
        <strong>700 W</strong>
        <small>instantaneous rate</small>
      </div>
      <div className="pe-learn__power-math" aria-hidden="true">
        <span>x</span>
      </div>
      <div className="pe-learn__power-rate">
        <span>Time</span>
        <strong>1 s</strong>
        <small>short burst</small>
      </div>
      <div className="pe-learn__power-math" aria-hidden="true">
        <span>=</span>
      </div>
      <div className="pe-learn__power-rate pe-learn__power-rate--result">
        <span>Energy</span>
        <strong>0.19 Wh</strong>
        <small>total used</small>
      </div>
    </div>
  );
}

export function PromptEnergyPageFacts() {
  return (
    <section className="pe-page-facts" aria-label="Story facts">
      {STORY_META_FACTS.map(fact => (
        <article key={fact.label} className="pe-page-facts__item">
          <div className="pe-page-facts__label">{fact.label}</div>
          <p>{fact.detail}</p>
        </article>
      ))}
    </section>
  );
}

export function PromptEnergyVisualLegend() {
  return (
    <section className="pe-vlegend" aria-labelledby="pe-vlegend-title">
      <div className="pe-vlegend__header">
        <div className="pe-vlegend__eyebrow">Visual legend</div>
        <h2 id="pe-vlegend-title">How to read the colors and overlays</h2>
        <p>
          The same color rules stay in place across the whole story. When the visuals become abstract, use this legend as the translation key.
        </p>
      </div>

      <div className="pe-vlegend__grid">
        {VISUAL_LEGEND_ITEMS.map(item => (
          <article key={item.key} className="pe-vlegend__item">
            <div className="pe-vlegend__swatch-row">
              <span className={`pe-vlegend__swatch pe-vlegend__swatch--${item.key}`} aria-hidden="true" />
              <h3>{item.label}</h3>
            </div>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>

      <div className="pe-vlegend__note">
        <strong>One more reading rule:</strong> the hardware drawings are the physical truth anchors, while the glowing paths, grids, labels, and lane overlays are teaching aids layered on top of that hardware.
      </div>
    </section>
  );
}

export function PromptEnergyBeginnerOverview() {
  return (
    <section className="pe-learn" aria-labelledby="pe-learn-title">
      <div className="pe-learn__intro">
        <div className="pe-learn__eyebrow">Beginner guide</div>
        <h2 className="pe-learn__title" id="pe-learn-title">
          New to AI hardware? Start here.
        </h2>
        <p className="pe-learn__lede">
          This version keeps the technical depth, but it adds a plain-language layer for first-time readers. If you only remember one sentence, remember this: you type a question, a shared machine briefly does work, that work becomes heat, and the system has to carry that heat away.
        </p>
      </div>

      <div className="pe-learn__card-grid">
        {BEGINNER_OVERVIEW_CARDS.map(card => (
          <article key={card.title} className="pe-learn__card">
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </div>

      <div className="pe-learn__callout">
        <div className="pe-learn__callout-title">Need the simple version?</div>
        <p>
          Your prompt becomes a request, the request runs on shared hardware, that hardware reuses the same chip blocks many times, the work turns into heat, and the final cost depends on how much of the surrounding system you choose to count.
        </p>
      </div>

      <div className="pe-learn__two-up">
        <article className="pe-learn__panel">
          <div className="pe-learn__panel-eyebrow">Journey map</div>
          <h3>What the story will zoom through</h3>
          <ol className="pe-learn__journey">
            {STORY_JOURNEY_STEPS.map(step => (
              <li key={step.key}>
                <strong>{step.label}</strong>
                <span>{step.scale}</span>
                <p>{step.lesson}</p>
              </li>
            ))}
          </ol>
        </article>

        <article className="pe-learn__panel">
          <div className="pe-learn__panel-eyebrow">Nested objects</div>
          <h3>The physical objects sit inside each other</h3>
          <p>
            One of the hardest beginner hurdles is separating the hardware layers. This is the nesting the later scenes keep unpacking.
          </p>
          <ScaleNestDiagram />
        </article>
      </div>

      <div className="pe-learn__two-up">
        <article className="pe-learn__panel">
          <div className="pe-learn__panel-eyebrow">Three ideas to keep in mind</div>
          <ul className="pe-learn__list">
            {BEGINNER_CORE_IDEAS.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="pe-learn__panel">
          <div className="pe-learn__panel-eyebrow">Power versus energy</div>
          <h3>Big hardware can still mean tiny per-prompt energy</h3>
          <p>
            Power is how fast energy is being used right now. Energy is the total used over time. A powerful machine can still spend very little energy on one short request.
          </p>
          <PowerEnergyPrimer />
        </article>
      </div>

      <article className="pe-learn__panel">
        <div className="pe-learn__panel-eyebrow">How to read the story</div>
        <ul className="pe-learn__list">
          {BEGINNER_READING_RULES.map(rule => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </article>

      <details className="pe-glossary">
        <summary>
          <span>Core glossary</span>
          <small>Open if terms like token, prefill, rack, or MoE are unfamiliar.</small>
        </summary>
        <div className="pe-glossary__grid">
          {BEGINNER_GLOSSARY.map(entry => (
            <article key={entry.term} className="pe-glossary__item">
              <h3>{entry.term}</h3>
              <p className="pe-glossary__short">{entry.short}</p>
              <p>{entry.detail}</p>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}

export function PromptEnergyStoryGuideBar() {
  const [activeScene, setActiveScene] = useState<LearningSceneKey>('scene-1');

  useEffect(() => {
    const visibility = new Map<string, number>();
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-scene]')
    );

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const scene = entry.target.getAttribute('data-scene');
          if (!scene) continue;
          visibility.set(scene, entry.isIntersecting ? entry.intersectionRatio : 0);
        }

        let nextScene: LearningSceneKey = 'scene-1';
        let bestRatio = -1;
        for (const step of STORY_JOURNEY_STEPS) {
          const ratio = visibility.get(step.key) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            nextScene = step.key;
          }
        }

        setActiveScene(nextScene);
      },
      {
        threshold: [0.2, 0.4, 0.6, 0.8],
        rootMargin: '-18% 0px -50% 0px',
      }
    );

    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const activeStep =
    STORY_JOURNEY_STEPS.find(step => step.key === activeScene) ?? STORY_JOURNEY_STEPS[0];
  const activeCard = SCENE_LEARNING_CARDS[activeScene];

  return (
    <nav className="pe-guidebar" aria-label="Prompt energy story progress">
      <div className="pe-guidebar__header">
        <div>
          <div className="pe-guidebar__eyebrow">Story progress</div>
          <div className="pe-guidebar__title">Track the scale and lesson as you scroll</div>
        </div>
        <div className="pe-guidebar__current">
          {activeStep.label}
        </div>
      </div>

      <div className="pe-guidebar__context">
        <article className="pe-guidebar__context-card">
          <div className="pe-guidebar__context-label">Scale now</div>
          <strong>{activeStep.scale}</strong>
        </article>
        <article className="pe-guidebar__context-card">
          <div className="pe-guidebar__context-label">Main lesson</div>
          <p>{activeStep.lesson}</p>
        </article>
        <article className="pe-guidebar__context-card">
          <div className="pe-guidebar__context-label">Watch for this</div>
          <p>{activeCard.watchFor}</p>
        </article>
        <article className="pe-guidebar__context-card">
          <div className="pe-guidebar__context-label">If you are lost</div>
          <p>{activeCard.plainLanguage}</p>
        </article>
      </div>

      <ol className="pe-guidebar__steps">
        {STORY_JOURNEY_STEPS.map(step => (
          <li
            key={step.key}
            className={`pe-guidebar__step ${activeScene === step.key ? 'is-active' : ''}`}
          >
            <strong>{step.label}</strong>
            <span>{step.scale}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface PromptEnergyInlineHelpProps {
  rows: Array<{
    label: string;
    copy: string;
  }>;
}

export function PromptEnergyInlineHelp({ rows }: PromptEnergyInlineHelpProps) {
  return (
    <aside className="pe-inline-help" aria-label="Extra scene guidance">
      {rows.map(row => (
        <div key={row.label} className="pe-inline-help__row">
          <strong>{row.label}</strong>
          <p>{row.copy}</p>
        </div>
      ))}
    </aside>
  );
}

interface PromptEnergyScenePrimerProps {
  scene: LearningSceneKey;
}

export function PromptEnergyScenePrimer({ scene }: PromptEnergyScenePrimerProps) {
  const card = SCENE_LEARNING_CARDS[scene];

  return (
    <aside className="pe-learning-card pe-learning-card--primer" aria-label={`${card.label} beginner primer`}>
      <div className="pe-learning-card__header">
        <div>
          <div className="pe-learning-card__eyebrow">{card.label}</div>
          <h3>{card.title}</h3>
        </div>
        <div className="pe-learning-card__scale">{card.scale}</div>
      </div>

      <div className="pe-learning-card__grid">
        <div className="pe-learning-card__block">
          <strong>What this scene teaches</strong>
          <p>{card.goal}</p>
        </div>
        <div className="pe-learning-card__block">
          <strong>In plain language</strong>
          <p>{card.plainLanguage}</p>
        </div>
        <div className="pe-learning-card__block">
          <strong>Watch for this</strong>
          <p>{card.watchFor}</p>
        </div>
        <div className="pe-learning-card__block">
          <strong>New words in this scene</strong>
          <p>{card.newWords.join(', ')}</p>
        </div>
      </div>
    </aside>
  );
}

export function PromptEnergySceneTakeaway({ scene }: PromptEnergyScenePrimerProps) {
  const card = SCENE_LEARNING_CARDS[scene];

  return (
    <aside className="pe-learning-card pe-learning-card--takeaway" aria-label={`${card.label} takeaway`}>
      <div className="pe-learning-card__header">
        <div className="pe-learning-card__eyebrow">Beginner takeaway</div>
        <h3>What to remember before the next scene</h3>
      </div>

      <div className="pe-learning-card__grid pe-learning-card__grid--two">
        <div className="pe-learning-card__block">
          <strong>Common confusion</strong>
          <p>{card.commonConfusion}</p>
        </div>
        <div className="pe-learning-card__block">
          <strong>By the end of this scene</strong>
          <p>{card.takeaway}</p>
        </div>
      </div>
    </aside>
  );
}

export function PromptEnergySceneBridge({ scene }: PromptEnergyScenePrimerProps) {
  const card = SCENE_BRIDGE_CARDS[scene];

  if (!card) return null;

  return (
    <aside className="pe-bridge" aria-label="Scene transition guide">
      <div className="pe-bridge__header">
        <div className="pe-bridge__eyebrow">What changed in this scene</div>
        <h3>This scene shifts the scale and the kind of truth you are looking at.</h3>
      </div>

      <div className="pe-bridge__grid">
        <div className="pe-bridge__block">
          <strong>What changed</strong>
          <p>{card.changed}</p>
        </div>
        <div className="pe-bridge__block">
          <strong>What is real hardware here</strong>
          <p>{card.realHardware}</p>
        </div>
        <div className="pe-bridge__block">
          <strong>What is a teaching overlay</strong>
          <p>{card.conceptualOverlay}</p>
        </div>
        <div className="pe-bridge__block">
          <strong>Why this matters</strong>
          <p>{card.whyItMatters}</p>
        </div>
      </div>
    </aside>
  );
}

interface PromptEnergyFAQBlockProps {
  block: FAQBlock;
}

export function PromptEnergyFAQBlock({ block }: PromptEnergyFAQBlockProps) {
  return (
    <section className="pe-faq" aria-labelledby={`pe-faq-${block.title}`}>
      <div className="pe-faq__header">
        <div className="pe-faq__eyebrow">{block.eyebrow}</div>
        <h2 id={`pe-faq-${block.title}`}>{block.title}</h2>
        <p>{block.intro}</p>
      </div>

      <div className="pe-faq__grid">
        {block.items.map(item => (
          <article key={item.question} className="pe-faq__item">
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export const PROMPT_ENERGY_FAQ_BLOCKS = LEARNING_FAQ_BLOCKS;

import { useEffect, useState } from 'react';
import {
  BEGINNER_CORE_IDEAS,
  BEGINNER_GLOSSARY,
  BEGINNER_OVERVIEW_CARDS,
  BEGINNER_READING_RULES,
  SCENE_LEARNING_CARDS,
  STORY_JOURNEY_STEPS,
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

  return (
    <nav className="pe-guidebar" aria-label="Prompt energy story progress">
      <div className="pe-guidebar__header">
        <div>
          <div className="pe-guidebar__eyebrow">Story progress</div>
          <div className="pe-guidebar__title">Track the scale and lesson as you scroll</div>
        </div>
        <div className="pe-guidebar__current">
          {STORY_JOURNEY_STEPS.find(step => step.key === activeScene)?.label ?? '1. Chat to request'}
        </div>
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

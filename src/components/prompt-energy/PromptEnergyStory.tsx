import { useState } from 'react';
import { PromptEnergySceneOne } from './PromptEnergySceneOne';
import { PromptEnergySceneTwo } from './PromptEnergySceneTwo';
import { PromptEnergySceneThree } from './PromptEnergySceneThree';
import { PromptEnergySceneFour } from './PromptEnergySceneFour';
import { PromptEnergySceneFive } from './PromptEnergySceneFive';
import { PromptEnergySceneSix } from './PromptEnergySceneSix';
import { PromptEnergySceneSeven } from './PromptEnergySceneSeven';
import { PromptEnergySceneEight } from './PromptEnergySceneEight';
import { PromptEnergySandbox } from './PromptEnergySandbox';
import {
  PROMPT_ENERGY_FAQ_BLOCKS,
  PromptEnergyFAQBlock,
} from './PromptEnergyLearningLayer';
import type { BoundaryKey } from './sceneOneData';

export function PromptEnergyStory() {
  const [boundary, setBoundary] = useState<BoundaryKey>('facility');

  return (
    <>
      <PromptEnergySceneOne boundary={boundary} onBoundaryChange={setBoundary} />
      <PromptEnergySceneTwo boundary={boundary} />
      <PromptEnergyFAQBlock block={PROMPT_ENERGY_FAQ_BLOCKS.basics} />
      <PromptEnergySceneThree boundary={boundary} />
      <PromptEnergySceneFour boundary={boundary} />
      <PromptEnergyFAQBlock block={PROMPT_ENERGY_FAQ_BLOCKS.silicon} />
      <PromptEnergySceneFive boundary={boundary} />
      <PromptEnergySceneSix boundary={boundary} />
      <PromptEnergyFAQBlock block={PROMPT_ENERGY_FAQ_BLOCKS.serving} />
      <PromptEnergySceneSeven boundary={boundary} />
      <PromptEnergySceneEight boundary={boundary} onBoundaryChange={setBoundary} />
      <PromptEnergyFAQBlock block={PROMPT_ENERGY_FAQ_BLOCKS.economics} />
      <PromptEnergySandbox boundary={boundary} onBoundaryChange={setBoundary} />
    </>
  );
}

import { useState } from 'react';
import { PromptEnergySceneOne } from './PromptEnergySceneOne';
import { PromptEnergySceneTwo } from './PromptEnergySceneTwo';
import { PromptEnergySceneThree } from './PromptEnergySceneThree';
import { PromptEnergySceneFour } from './PromptEnergySceneFour';
import { PromptEnergySceneFive } from './PromptEnergySceneFive';
import type { BoundaryKey } from './sceneOneData';

export function PromptEnergyStory() {
  const [boundary, setBoundary] = useState<BoundaryKey>('facility');

  return (
    <>
      <PromptEnergySceneOne boundary={boundary} onBoundaryChange={setBoundary} />
      <PromptEnergySceneTwo boundary={boundary} />
      <PromptEnergySceneThree boundary={boundary} />
      <PromptEnergySceneFour boundary={boundary} />
      <PromptEnergySceneFive boundary={boundary} />
    </>
  );
}

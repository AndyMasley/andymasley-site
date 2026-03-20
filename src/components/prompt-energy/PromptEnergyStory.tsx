import { useState } from 'react';
import { PromptEnergySceneOne } from './PromptEnergySceneOne';
import { PromptEnergySceneTwo } from './PromptEnergySceneTwo';
import type { BoundaryKey } from './sceneOneData';

export function PromptEnergyStory() {
  const [boundary, setBoundary] = useState<BoundaryKey>('facility');

  return (
    <>
      <PromptEnergySceneOne boundary={boundary} onBoundaryChange={setBoundary} />
      <PromptEnergySceneTwo boundary={boundary} />
    </>
  );
}

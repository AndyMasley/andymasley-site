export type BoundaryKey = 'chip' | 'server' | 'facility';

export interface SceneBeat {
  id: string;
  label: string;
  title: string;
  body: string;
  caption: string;
  phase: string;
  instantPower: {
    chip: number;
    host: number;
    reserve: number;
    overhead: number;
  };
  cumulativeWh: {
    chip: number;
    server: number;
    facility: number;
  };
}

export const HERO_PROMPT = 'Why is a single AI prompt so cheap?';

export const HERO_TOKENS = ['Why', 'is', 'a', 'single', 'AI', 'prompt', 'so', 'cheap?'];

export const BOUNDARY_OPTIONS: Array<{
  key: BoundaryKey;
  label: string;
  description: string;
  summary: string;
}> = [
  {
    key: 'chip',
    label: 'Chip only',
    description: 'Counts only the active accelerator.',
    summary: 'Counting only the active accelerator.',
  },
  {
    key: 'server',
    label: 'Server',
    description: 'Counts the accelerator plus the active host system.',
    summary: 'Counting the active server.',
  },
  {
    key: 'facility',
    label: 'Full facility',
    description: 'Counts the active system plus reserved capacity and facility overhead.',
    summary: 'Counting the full serving service, including reserve capacity and overhead.',
  },
];

export const GHOST_REQUESTS = ['ghost-1', 'ghost-2', 'ghost-3'];

export const SCENE_ONE_BEATS: SceneBeat[] = [
  {
    id: 'warm',
    label: 'Beat 0',
    title: 'The service is already warm.',
    body: 'Your question enters an already running AI service, not a blank machine booting up just for you.',
    caption: 'Warm idle state with reserved capacity already online.',
    phase: 'Warm idle',
    instantPower: { chip: 0, host: 24, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0, facility: 0 },
  },
  {
    id: 'question',
    label: 'Beat 1',
    title: 'You ask a question.',
    body: 'A short prompt appears in the chat interface, while the serving path stays warm and ready in the background.',
    caption: 'The request begins at the chat surface, not at the chip.',
    phase: 'Question arrives',
    instantPower: { chip: 0, host: 28, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0.001, facility: 0.004 },
  },
  {
    id: 'tokens',
    label: 'Beat 2',
    title: 'Your text becomes tokens.',
    body: 'The sentence is translated into token-like chunks so the serving stack can handle it as structured model input.',
    caption: 'Text is processed as tokens rather than raw prose.',
    phase: 'Tokenization',
    instantPower: { chip: 0, host: 34, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0.003, facility: 0.007 },
  },
  {
    id: 'capsule',
    label: 'Beat 3',
    title: 'Those tokens become a structured request.',
    body: 'The token ribbon is wrapped into a request capsule with routing metadata so the system can move it through the pipeline.',
    caption: 'The prompt is now a routable request object.',
    phase: 'Request packaging',
    instantPower: { chip: 0, host: 40, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0.006, facility: 0.012 },
  },
  {
    id: 'scheduler',
    label: 'Beat 4',
    title: 'The serving system schedules the work.',
    body: 'Schedulers merge and route requests so the accelerator stays busy without turning the path into a literal waiting line.',
    caption: 'Your request is coordinated alongside other live traffic.',
    phase: 'Scheduling',
    instantPower: { chip: 0, host: 54, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0.011, facility: 0.02 },
  },
  {
    id: 'host',
    label: 'Beat 5',
    title: 'The host dispatches the request.',
    body: 'A host CPU and memory layer prepares the work and hands it off to the accelerator that will do the heavy parallel math.',
    caption: 'The host system contributes to full-stack prompt energy too.',
    phase: 'Host dispatch',
    instantPower: { chip: 0, host: 76, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0.017, facility: 0.029 },
  },
  {
    id: 'accelerator',
    label: 'Beat 6',
    title: 'The accelerator begins the heavy compute.',
    body: 'The biggest instantaneous power jump happens here, but the total prompt energy is still small because the burst is short.',
    caption: 'This is where the heavy parallel math begins.',
    phase: 'Accelerator handoff',
    instantPower: { chip: 242, host: 82, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0.012, server: 0.029, facility: 0.047 },
  },
  {
    id: 'zoom',
    label: 'Beat 7',
    title: 'Now we zoom inside.',
    body: 'Hold the request path, keep the boundary visible, and aim the camera at the accelerator so the next scene can move into the hardware.',
    caption: 'Next: the rack, board, package, and die.',
    phase: 'Zoom target',
    instantPower: { chip: 264, host: 80, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0.015, server: 0.033, facility: 0.052 },
  },
];

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
    description: 'Counts only the main accelerator chip doing the model math.',
    summary: 'Counting only the main accelerator chip.',
  },
  {
    key: 'server',
    label: 'Server',
    description: 'Counts the accelerator plus the nearby host computer that helps run the request.',
    summary: 'Counting the active server around the chip.',
  },
  {
    key: 'facility',
    label: 'Full facility',
    description: 'Counts the active system plus reserved spare capacity and the surrounding facility overhead.',
    summary: 'Counting the full serving service, including spare capacity and overhead.',
  },
];

export const GHOST_REQUESTS = ['ghost-1', 'ghost-2', 'ghost-3'];

export const SCENE_ONE_BEATS: SceneBeat[] = [
  {
    id: 'warm',
    label: 'Beat 0',
    title: 'The service is already warm.',
    body: 'Your question enters an AI service that is already running. The system is not booting up a brand-new machine just for you.',
    caption: 'The shared service is already on before you type.',
    phase: 'Warm idle',
    instantPower: { chip: 0, host: 24, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0, facility: 0 },
  },
  {
    id: 'question',
    label: 'Beat 1',
    title: 'You ask a question.',
    body: 'The prompt first appears in the chat interface you can see, while the serving system stays ready in the background.',
    caption: 'The story begins at the chat surface, not at the chip.',
    phase: 'Question arrives',
    instantPower: { chip: 0, host: 28, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0.001, facility: 0.004 },
  },
  {
    id: 'tokens',
    label: 'Beat 2',
    title: 'Your text becomes tokens.',
    body: 'The system breaks the sentence into smaller text pieces called tokens so the model can work with it internally.',
    caption: 'The model works on text pieces, not on raw prose.',
    phase: 'Tokenization',
    instantPower: { chip: 0, host: 34, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0.003, facility: 0.007 },
  },
  {
    id: 'capsule',
    label: 'Beat 3',
    title: 'Those tokens become a structured request.',
    body: 'Those token pieces are wrapped into a machine-ready request so the service can route them to the right hardware.',
    caption: 'The prompt is now a request the system can move around.',
    phase: 'Request packaging',
    instantPower: { chip: 0, host: 40, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0.006, facility: 0.012 },
  },
  {
    id: 'scheduler',
    label: 'Beat 4',
    title: 'The serving system schedules the work.',
    body: 'The scheduler decides when and where this request runs so the hardware stays busy while many live requests share the same service.',
    caption: 'Your request is coordinated alongside other people’s traffic.',
    phase: 'Scheduling',
    instantPower: { chip: 0, host: 54, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0.011, facility: 0.02 },
  },
  {
    id: 'host',
    label: 'Beat 5',
    title: 'The host dispatches the request.',
    body: 'A nearby host computer prepares the request and hands it off to the accelerator chip that will do the heaviest math.',
    caption: 'The host computer matters too, not just the accelerator.',
    phase: 'Host dispatch',
    instantPower: { chip: 0, host: 76, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0, server: 0.017, facility: 0.029 },
  },
  {
    id: 'accelerator',
    label: 'Beat 6',
    title: 'The accelerator begins the heavy compute.',
    body: 'This is where the biggest burst of math begins. The power jumps up here, but the total energy can still stay small because the burst is short.',
    caption: 'This is the first real heavy-compute step.',
    phase: 'Accelerator handoff',
    instantPower: { chip: 242, host: 82, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0.012, server: 0.029, facility: 0.047 },
  },
  {
    id: 'zoom',
    label: 'Beat 7',
    title: 'Now we zoom inside.',
    body: 'Keep the request path in mind and aim the camera at the hardware so the next scenes can open the machine layer by layer.',
    caption: 'Next: the rack, then the tray, package, and die.',
    phase: 'Zoom target',
    instantPower: { chip: 264, host: 80, reserve: 168, overhead: 36 },
    cumulativeWh: { chip: 0.015, server: 0.033, facility: 0.052 },
  },
];

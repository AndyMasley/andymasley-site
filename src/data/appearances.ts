// The one appearances registry: the /appearances page and the search index
// both import this list, so an appearance added here is findable everywhere.

export interface Appearance {
  title: string;
  href: string;
  date: string;
}

export interface AppearanceGroup {
  heading: string;
  items: Appearance[];
}

const aiEnvironment: Appearance[] = [
  { title: 'Caitlin Has Questions', href: 'https://www.youtube.com/watch?v=5gGnVfMiXpE', date: 'Jul 2026' },
  { title: 'The World Unpacked', href: 'https://www.youtube.com/watch?v=4Q6t2PxZxDE', date: 'Jul 2026' },
  { title: 'Scaling Laws', href: 'https://podcasts.apple.com/us/podcast/all-things-data-centers-with-andy-masley/id1607949880?i=1000775770135', date: 'Jul 2026' },
  { title: 'I Might Be Wrong', href: 'https://www.imightbewrong.org/p/imbw-audio-everything-you-ever-wanted', date: 'Jul 2026' },
  { title: 'Looking Glass Universe', href: 'https://www.youtube.com/watch?v=DNkZRt-X4RM', date: 'Jun 2026' },
  { title: 'AI Summer', href: 'https://www.aisummer.org/p/andy-masley-on-the-data-center-backlash', date: 'Jun 2026' },
  { title: 'The New Liberal Podcast', href: 'https://podcasts.apple.com/us/podcast/how-worried-are-you-about-data-centers-ft-andy-masley/id1390384827?i=1000766767353', date: 'May 2026' },
  { title: 'David Ramms', href: 'https://www.youtube.com/watch?v=FQCdwcW3wEw', date: 'May 2026' },
  { title: 'Arizona’s Family', href: "https://www.azfamily.com/2026/02/26/data-centers-arent-water-villains-you-think-they-are-environmentalist-says/", date: 'Feb 2026' },
  { title: 'Good Morning America', href: 'https://www.youtube.com/watch?v=_Ird91qfPZs', date: 'Feb 2026' },
  { title: 'The Cognitive Revolution', href: 'https://open.spotify.com/episode/0RBBVeGb5yfHsFWnKkDgD0?si=15d8b610374544b0', date: 'Dec 2025' },
  { title: 'NYT Hard Fork', href: 'https://open.spotify.com/episode/0UaOQ0DcP9c8OG5IfAgfnT?si=5d00e4bce6aa43f0', date: 'Dec 2025' },
  { title: 'Chain of Thought', href: 'https://open.spotify.com/episode/1Lzt9pMcqOcjfE3WLxNy3j?si=fdb4604af43d40e9', date: 'Nov 2025' },
  { title: 'Conspicuous Cognition', href: 'https://open.spotify.com/episode/2E3Yfi24OUyHxz67BtzhHB?si=8110a29fe7034cf5', date: 'Nov 2025' },
];

const effectiveAltruism: Appearance[] = [
  { title: 'Caitlin Has Questions', href: 'https://www.youtube.com/watch?v=5gGnVfMiXpE', date: 'Jul 2026' },
  { title: 'The World Can Be Better', href: 'https://www.youtube.com/watch?v=QNQezP5uzeg', date: 'Apr 2026' },
  { title: 'Model Convos', href: 'https://www.machineculture.io/p/model-convo-andy-masley', date: 'Mar 2026' },
  { title: 'Bentham’s Bulldog', href: 'https://benthams.substack.com/p/chatting-with-andy-masley-about-ea', date: 'Jan 2026' },
  { title: 'Expected Volume', href: 'https://www.youtube.com/watch?v=qzNZfa2jSE8', date: 'May 2025' },
];

export const appearanceGroups: AppearanceGroup[] = [
  { heading: 'AI and the environment', items: aiEnvironment },
  { heading: 'Effective altruism', items: effectiveAltruism },
];

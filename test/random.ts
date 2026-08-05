/** A seeded PRNG, so a failing convergence case can be reproduced from its seed. */
export const prng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const WORDS = [
  'call',
  'draft',
  'the',
  'migration',
  'plan',
  '**bold**',
  '- [ ] item',
  '# heading',
  '\n',
  '> quote',
  '`code`',
  'dentist',
];

export interface TextEdit {
  index: number;
  deleteCount: number;
  insert: string;
}

export const randomEdit = (random: () => number, length: number): TextEdit => {
  const index = Math.floor(random() * (length + 1));
  const deleteCount = random() < 0.3 ? Math.min(length - index, Math.floor(random() * 5)) : 0;
  const insert = random() < 0.8 ? (WORDS[Math.floor(random() * WORDS.length)] as string) : '';
  return { index, deleteCount, insert };
};

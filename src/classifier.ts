import type { Topic } from './types.js';

const topicRules: Record<Exclude<Topic, 'other'>, RegExp[]> = {
  ai: [/\bai\b/i, /artificial intelligence/i, /\bllm\b/i, /openai/i, /anthropic/i, /deepmind/i, /agent/i],
  games: [/game/i, /gaming/i, /steam/i, /unity/i, /unreal/i, /nintendo/i, /playstation/i, /xbox/i],
  'single-cell': [/single[- ]cell/i, /scrna/i, /spatial transcript/i, /cell atlas/i],
  biopharma: [/biopharma/i, /biotech/i, /clinical trial/i, /drug discovery/i, /therapeutic/i],
  medicine: [/medicine/i, /medical/i, /fda/i, /ema/i, /oncology/i, /vaccine/i, /diagnostic/i]
};

export function classifyText(text: string, defaults: Topic[] = []): Topic[] {
  const topics = new Set<Topic>(defaults);
  for (const [topic, rules] of Object.entries(topicRules) as Array<[Exclude<Topic, 'other'>, RegExp[]]>) {
    if (rules.some((rule) => rule.test(text))) {
      topics.add(topic);
    }
  }
  if (topics.size === 0) topics.add('other');
  return [...topics];
}

export function parseTopics(value: string | null | undefined): Topic[] {
  if (!value) return [];
  return value
    .split(',')
    .map((topic) => topic.trim())
    .filter(Boolean) as Topic[];
}

export function serializeTopics(topics: Topic[]): string {
  return [...new Set(topics)].join(',');
}

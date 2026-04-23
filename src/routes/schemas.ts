import { z } from 'zod';

const sourceTypeSchema = z.enum(['rss', 'rsshub', 'x_user', 'x_search', 'web_page']);
const topicSchema = z.enum(['ai', 'games', 'single-cell', 'biopharma', 'medicine', 'other']);

export const sourceInputSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  type: sourceTypeSchema,
  topics: z.array(topicSchema).default([]),
  enabled: z.boolean().default(true),
  fetchIntervalMinutes: z.number().int().min(5).max(1440).default(30),
  dailyRequestLimit: z.number().int().min(0).max(100000).default(100)
});

export const sourceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  type: sourceTypeSchema.optional(),
  topics: z.array(topicSchema).optional(),
  enabled: z.boolean().optional(),
  fetchIntervalMinutes: z.number().int().min(5).max(1440).optional(),
  dailyRequestLimit: z.number().int().min(0).max(100000).optional()
});

export const itemStateSchema = z.object({
  value: z.boolean()
});

export const clashRulesSchema = z.object({
  rules: z.string().max(50_000)
});

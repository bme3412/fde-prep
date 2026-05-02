import { z } from "zod/v4";

// ── Category enum ──────────────────────────────────────────────────────────
export const CATEGORIES = [
  "python_fluency",
  "concurrency",
  "anthropic_sdk",
  "evals",
  "retrieval",
  "enterprise_deployment",
  "developer_tools",
  "research",
  "practice_reps",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  python_fluency: "Python Fluency",
  concurrency: "Concurrency",
  anthropic_sdk: "Anthropic SDK",
  evals: "Evals",
  retrieval: "Retrieval",
  enterprise_deployment: "Enterprise Deployment",
  developer_tools: "Developer Tools",
  research: "Research Reading",
  practice_reps: "Practice Reps",
};

// ── Status enum ────────────────────────────────────────────────────────────
export const STATUSES = ["not_started", "in_progress", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  done: "Done",
};

// ── Resource ───────────────────────────────────────────────────────────────
export const ResourceSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});
export type Resource = z.infer<typeof ResourceSchema>;

// ── Topic ──────────────────────────────────────────────────────────────────
export const TopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(CATEGORIES),
  description: z.string(),
  estimatedMinutes: z.number().int().positive(),
  resources: z.array(ResourceSchema),
  status: z.enum(STATUSES),
  notes: z.string(),
  completedAt: z.string().nullable(),
});
export type Topic = z.infer<typeof TopicSchema>;

// ── PracticeRep ────────────────────────────────────────────────────────────
export const PracticeRepSchema = z.object({
  id: z.string(),
  title: z.string(),
  promptMarkdown: z.string(),
  durationMinutes: z.number().int().positive(),
  completedAt: z.string().nullable(),
  retroNotes: z.string(),
});
export type PracticeRep = z.infer<typeof PracticeRepSchema>;

// ── DailyLog ───────────────────────────────────────────────────────────────
export const DailyLogSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutesStudied: z.number().int().nonnegative(),
  topicsTouched: z.array(z.string()),
  reflection: z.string(),
});
export type DailyLog = z.infer<typeof DailyLogSchema>;

// ── AppState — the full shape of state.json ────────────────────────────────
export const AppStateSchema = z.object({
  topics: z.array(TopicSchema),
  practiceReps: z.array(PracticeRepSchema),
  dailyLogs: z.array(DailyLogSchema),
});
export type AppState = z.infer<typeof AppStateSchema>;

// ── Zod schemas for server action inputs ───────────────────────────────────
export const UpdateTopicStatusInput = z.object({
  id: z.string(),
  status: z.enum(STATUSES),
});

export const UpdateTopicNotesInput = z.object({
  id: z.string(),
  notes: z.string(),
});

export const LogDailyInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutesStudied: z.number().int().nonnegative(),
  topicsTouched: z.array(z.string()),
  reflection: z.string(),
});

export const CompletePracticeRepInput = z.object({
  id: z.string(),
  retroNotes: z.string(),
});

export const StartPracticeRepInput = z.object({
  id: z.string(),
});

import { z } from "zod/v4";

// ── Category enum ──────────────────────────────────────────────────────────
export const CATEGORIES = [
  // Foundational
  "python_fluency",
  "concurrency",
  "developer_tools",
  "data_engineering",
  // Anthropic API & agents
  "anthropic_sdk",
  "agent_architecture",
  "prompt_engineering",
  "production_patterns",
  // Evals & quality
  "evals",
  "safety_redteaming",
  // Retrieval & memory
  "retrieval",
  "embeddings",
  "vector_dbs",
  // Model engineering
  "model_selection",
  "fine_tuning",
  "ml_systems",
  "inference_optimization",
  "training_experimentation",
  "multimodal",
  // Deployment & ops
  "enterprise_deployment",
  // Domain & customer
  "domain_specific",
  "customer_facing",
  // Reading & practice
  "research",
  "research_literacy",
  "practice_reps",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  python_fluency: "Python Fluency",
  concurrency: "Concurrency",
  developer_tools: "Developer Tools",
  data_engineering: "Data Engineering Basics",
  anthropic_sdk: "Anthropic SDK",
  agent_architecture: "Agent Architecture",
  prompt_engineering: "Prompt Engineering at Scale",
  production_patterns: "Production LLM Patterns",
  evals: "Evals",
  safety_redteaming: "Safety, Alignment & Red-Teaming",
  retrieval: "Retrieval",
  embeddings: "Embeddings & Representation",
  vector_dbs: "Vector Databases & Infrastructure",
  model_selection: "Model Selection & Routing",
  fine_tuning: "Fine-Tuning & Adaptation",
  ml_systems: "ML Systems Fundamentals",
  inference_optimization: "Inference Optimization",
  training_experimentation: "Training & Experimentation",
  multimodal: "Multimodal Systems",
  enterprise_deployment: "Enterprise Deployment",
  domain_specific: "Domain-Specific AI Patterns",
  customer_facing: "Customer-Facing Skills",
  research: "Research Reading",
  research_literacy: "Applied Research Literacy",
  practice_reps: "Practice Reps",
};

/** Grouping for the topics page sidebar/nav. */
export const CATEGORY_GROUPS: { label: string; categories: Category[] }[] = [
  {
    label: "Foundations",
    categories: ["python_fluency", "concurrency", "developer_tools", "data_engineering"],
  },
  {
    label: "Anthropic API & Agents",
    categories: ["anthropic_sdk", "agent_architecture", "prompt_engineering", "production_patterns"],
  },
  {
    label: "Evals & Safety",
    categories: ["evals", "safety_redteaming"],
  },
  {
    label: "Retrieval & Memory",
    categories: ["retrieval", "embeddings", "vector_dbs"],
  },
  {
    label: "Model Engineering",
    categories: [
      "model_selection",
      "fine_tuning",
      "ml_systems",
      "inference_optimization",
      "training_experimentation",
      "multimodal",
    ],
  },
  {
    label: "Deployment & Domain",
    categories: ["enterprise_deployment", "domain_specific", "customer_facing"],
  },
  {
    label: "Reading & Practice",
    categories: ["research", "research_literacy", "practice_reps"],
  },
];

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
  // Cumulative active study time on this topic across all sessions.
  // Tracked in seconds for precision; rendered as minutes in the UI.
  // Defaulted so existing state.json (pre-feature) parses cleanly.
  secondsStudied: z.number().int().nonnegative().default(0),
  lastStudiedAt: z.string().nullable().default(null),
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

// ── Study-time tracking input ──────────────────────────────────────────────
// Posted by the in-browser StudyTimer. `seconds` is clamped server-side so a
// runaway client can't inflate totals. `date` defaults to today (UTC) so the
// daily-log upsert is deterministic regardless of client clock skew.
export const RecordStudyTimeInput = z.object({
  topicId: z.string().min(1),
  seconds: z.number().int().positive().max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

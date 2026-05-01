/** A "what does this output?" active recall block */
export interface CodePredict {
  kind: "code_predict";
  /** Setup context — what this tests */
  label: string;
  /** Python code to display */
  code: string;
  /** The correct output */
  output: string;
  /** Brief explanation of why */
  explanation: string;
}

/** A "what happens in this system?" block — for API payloads, JSON, non-Python scenarios */
export interface ScenarioPredict {
  kind: "scenario_predict";
  /** Setup context */
  label: string;
  /** The scenario (JSON payload, API call, config, etc.) */
  scenario: string;
  /** Syntax hint for display: "json" | "python" | "bash" | "text" */
  language: string;
  /** The specific question to answer */
  question: string;
  /** The correct answer */
  answer: string;
  /** Brief explanation */
  explanation: string;
}

/** A decision-style flashcard */
export interface Flashcard {
  kind: "flashcard";
  /** Optional scenario framing shown above the question */
  context?: string;
  front: string;
  back: string;
}

/** Side-by-side code comparison (e.g. "before" plain dict vs "after" defaultdict) */
export interface CodeComparison {
  kind: "code_comparison";
  label: string;
  left: {
    title: string;
    code: string;
    annotation?: string;
  };
  right: {
    title: string;
    code: string;
    annotation?: string;
  };
  takeaway?: string;
}

/** A lightweight fill-in-the-blank exercise — simpler than mini_challenge */
export interface WarmUp {
  kind: "warm_up";
  title: string;
  /** The question (markdown supported) */
  prompt: string;
  /** Short correct answer */
  answer: string;
  /** Why this is the answer */
  explanation: string;
}

/** A coding mini-challenge with a reference solution */
export interface MiniChallenge {
  kind: "mini_challenge";
  title: string;
  /** The prompt in markdown */
  prompt: string;
  /** Hints (revealed progressively) */
  hints: string[];
  /** Reference solution code */
  solution: string;
  /** Key takeaway */
  takeaway: string;
}

/** A markdown prose section (teaching content between interactive blocks) */
export interface ProseSection {
  kind: "prose";
  markdown: string;
}

/** A visually prominent callout for mental models, rules of thumb, key takeaways */
export interface KeyInsight {
  kind: "key_insight";
  /** Short label like "Mental model" or "Rule of thumb" */
  label: string;
  /** The insight content (markdown supported) */
  insight: string;
}

/** A compact API reference card showing method signatures for a data structure */
export interface MethodRef {
  kind: "method_ref";
  /** The data structure name, e.g. "defaultdict" */
  title: string;
  /** Import statement */
  importLine: string;
  /** List of methods/attributes to show */
  methods: {
    /** Method signature, e.g. "d[key]" or ".most_common(n)" */
    signature: string;
    /** What it does in plain English */
    description: string;
    /** Optional: what it returns */
    returns?: string;
  }[];
}

export type GuideBlock =
  | CodePredict
  | ScenarioPredict
  | Flashcard
  | MiniChallenge
  | ProseSection
  | KeyInsight
  | MethodRef
  | CodeComparison
  | WarmUp;

export interface StudyGuide {
  topicTitle: string;
  /** Matches the topic title (lowercased, for lookup) */
  topicSlug: string;
  sections: {
    title: string;
    blocks: GuideBlock[];
  }[];
}

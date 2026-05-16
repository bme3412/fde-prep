import type { StudyGuide } from "../guide-types";
import { bashGuide } from "./bash";
import { batchApiGuide } from "./batch-api";
import { bm25HybridRetrievalGuide } from "./bm25-hybrid-retrieval";
import { collectionsGuide } from "./collections";
import { dataclassesTypingPatternsGuide } from "./dataclasses-typing-patterns";
import { errorHandlingRetriesGuide } from "./error-handling-retries";
import { gitGuide } from "./git";
import { itertoolsFunctoolsGuide } from "./itertools-functools";
import { messagesApiGuide } from "./messages-api";
import { streamingPromptCachingGuide } from "./streaming-prompt-caching";
import { toolUseLoopGuide } from "./tool-use-loop";
import { visionPdfInputsGuide } from "./vision-pdf-inputs";

/** All available study guides, keyed by topic title (lowercased, exact match). */
const guides: StudyGuide[] = [
  bashGuide,
  batchApiGuide,
  bm25HybridRetrievalGuide,
  collectionsGuide,
  dataclassesTypingPatternsGuide,
  errorHandlingRetriesGuide,
  gitGuide,
  itertoolsFunctoolsGuide,
  messagesApiGuide,
  streamingPromptCachingGuide,
  toolUseLoopGuide,
  visionPdfInputsGuide,
];

export function getGuideForTopic(topicTitle: string): StudyGuide | null {
  return (
    guides.find(
      (g) => g.topicTitle.toLowerCase() === topicTitle.toLowerCase(),
    ) ?? null
  );
}

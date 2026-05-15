import type { StudyGuide } from "../guide-types";
import { bashGuide } from "./bash";
import { bm25HybridRetrievalGuide } from "./bm25-hybrid-retrieval";
import { collectionsGuide } from "./collections";
import { errorHandlingRetriesGuide } from "./error-handling-retries";
import { gitGuide } from "./git";
import { itertoolsFunctoolsGuide } from "./itertools-functools";
import { messagesApiGuide } from "./messages-api";
import { toolUseLoopGuide } from "./tool-use-loop";

/** All available study guides, keyed by topic title (lowercased, exact match). */
const guides: StudyGuide[] = [
  bashGuide,
  bm25HybridRetrievalGuide,
  collectionsGuide,
  errorHandlingRetriesGuide,
  gitGuide,
  itertoolsFunctoolsGuide,
  messagesApiGuide,
  toolUseLoopGuide,
];

export function getGuideForTopic(topicTitle: string): StudyGuide | null {
  return (
    guides.find(
      (g) => g.topicTitle.toLowerCase() === topicTitle.toLowerCase(),
    ) ?? null
  );
}

import type { StudyGuide } from "../guide-types";
import { bashGuide } from "./bash";
import { bm25HybridRetrievalGuide } from "./bm25-hybrid-retrieval";
import { collectionsGuide } from "./collections";
import { gitGuide } from "./git";
import { itertoolsFunctoolsGuide } from "./itertools-functools";
import { messagesApiGuide } from "./messages-api";
import { toolUseLoopGuide } from "./tool-use-loop";

/** All available study guides, keyed by topic title (lowercased, exact match). */
const guides: StudyGuide[] = [
  bashGuide,
  bm25HybridRetrievalGuide,
  collectionsGuide,
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

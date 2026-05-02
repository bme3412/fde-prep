import type { StudyGuide } from "../guide-types";
import { collectionsGuide } from "./collections";
import { itertoolsFunctoolsGuide } from "./itertools-functools";
import { messagesApiGuide } from "./messages-api";

/** All available study guides, keyed by topic title (lowercased, exact match). */
const guides: StudyGuide[] = [collectionsGuide, itertoolsFunctoolsGuide, messagesApiGuide];

export function getGuideForTopic(topicTitle: string): StudyGuide | null {
  return (
    guides.find(
      (g) => g.topicTitle.toLowerCase() === topicTitle.toLowerCase(),
    ) ?? null
  );
}

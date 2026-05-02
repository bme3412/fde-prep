import type { StudyGuide } from "../guide-types";
import { bashGuide } from "./bash";
import { collectionsGuide } from "./collections";
import { gitGuide } from "./git";
import { itertoolsFunctoolsGuide } from "./itertools-functools";
import { messagesApiGuide } from "./messages-api";

/** All available study guides, keyed by topic title (lowercased, exact match). */
const guides: StudyGuide[] = [bashGuide, collectionsGuide, gitGuide, itertoolsFunctoolsGuide, messagesApiGuide];

export function getGuideForTopic(topicTitle: string): StudyGuide | null {
  return (
    guides.find(
      (g) => g.topicTitle.toLowerCase() === topicTitle.toLowerCase(),
    ) ?? null
  );
}

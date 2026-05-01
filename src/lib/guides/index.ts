import type { StudyGuide } from "../guide-types";
import { collectionsGuide } from "./collections";

/** All available study guides, keyed by topic title (lowercased, exact match). */
const guides: StudyGuide[] = [collectionsGuide];

export function getGuideForTopic(topicTitle: string): StudyGuide | null {
  return (
    guides.find(
      (g) => g.topicTitle.toLowerCase() === topicTitle.toLowerCase(),
    ) ?? null
  );
}

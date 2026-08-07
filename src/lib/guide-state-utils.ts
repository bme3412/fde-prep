/** Pure helpers for guide localStorage keys / progress — safe for server + client. */

export const GUIDE_STATE_PREFIX = "fde-prep:guide:v1:";
export const GUIDE_STATE_CHANGE_EVENT = "fde-prep:guide-state-change";

export function guideStateKey(scope: string): string {
  return GUIDE_STATE_PREFIX + scope;
}

/** Best-effort id derivation for use in localStorage keys. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Whether an interactive unit counts as complete based on its persisted blob.
 * Shapes mirror what each block writes via usePersistedState.
 */
export function isProgressUnitDone(
  kind: string,
  raw: string | null,
  cardCount?: number,
): boolean {
  if (raw == null) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    switch (kind) {
      case "code_predict": {
        const v = parsed as { showExplanation?: boolean };
        return v.showExplanation === true;
      }
      case "scenario_predict":
      case "warm_up": {
        const v = parsed as { revealed?: boolean };
        return v.revealed === true;
      }
      case "multiple_choice":
        return typeof parsed === "number";
      case "mini_challenge": {
        const v = parsed as { showSolution?: boolean };
        return v.showSolution === true;
      }
      case "flashcard_deck": {
        const v = parsed as { index?: number };
        return (
          typeof v.index === "number" &&
          (cardCount ?? 0) > 0 &&
          v.index >= (cardCount as number)
        );
      }
      case "section-done": {
        const v = parsed as { done?: boolean };
        return v.done === true;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/** Section-done localStorage scope — must match SectionCheckbox. */
export function sectionDoneScope(
  topicSlug: string,
  sectionIndex: number,
  sectionTitle: string,
): string {
  return `${topicSlug}:section-done:${sectionIndex}:${slugify(sectionTitle)}`;
}

import type { StudyGuide } from "../guide-types";
import { argparseCliPatternsGuide } from "./argparse-cli-patterns";
import { bashGuide } from "./bash";
import { batchApiGuide } from "./batch-api";
import { bm25HybridRetrievalGuide } from "./bm25-hybrid-retrieval";
import { collectionsGuide } from "./collections";
import { contextManagersGeneratorsGuide } from "./context-managers-generators";
import { dataclassesTypingPatternsGuide } from "./dataclasses-typing-patterns";
import { errorHandlingRetriesGuide } from "./error-handling-retries";
import { gitGuide } from "./git";
import { itertoolsFunctoolsGuide } from "./itertools-functools";
import { messagesApiGuide } from "./messages-api";
import { pydanticV2FundamentalsGuide } from "./pydantic-v2-fundamentals";
import { streamingPromptCachingGuide } from "./streaming-prompt-caching";
import { testingPytestFixturesMockingGuide } from "./testing-pytest-fixtures-mocking";
import { toolUseLoopGuide } from "./tool-use-loop";
import { visionPdfInputsGuide } from "./vision-pdf-inputs";

/** All available study guides, keyed by topic title (lowercased, exact match). */
const guides: StudyGuide[] = [
  argparseCliPatternsGuide,
  bashGuide,
  batchApiGuide,
  bm25HybridRetrievalGuide,
  collectionsGuide,
  contextManagersGeneratorsGuide,
  dataclassesTypingPatternsGuide,
  errorHandlingRetriesGuide,
  gitGuide,
  itertoolsFunctoolsGuide,
  messagesApiGuide,
  pydanticV2FundamentalsGuide,
  streamingPromptCachingGuide,
  testingPytestFixturesMockingGuide,
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

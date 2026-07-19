import type { StudyGuide } from "../guide-types";
import { argparseCliPatternsGuide } from "./argparse-cli-patterns";
import { asyncioSemaphoreGatherPatternsGuide } from "./asyncio-semaphore-gather-patterns";
import { bashGuide } from "./bash";
import { batchApiGuide } from "./batch-api";
import { bm25HybridRetrievalGuide } from "./bm25-hybrid-retrieval";
import { chainOfThoughtExtendedThinkingGuide } from "./chain-of-thought-extended-thinking";
import { collectionsGuide } from "./collections";
import { computerUseAgenticToolLoopsGuide } from "./computer-use-agentic-tool-loops";
import { contextManagersGeneratorsGuide } from "./context-managers-generators";
import { dataclassesTypingPatternsGuide } from "./dataclasses-typing-patterns";
import { duckdbLightweightEtlGuide } from "./duckdb-lightweight-etl";
import { errorHandlingRetriesGuide } from "./error-handling-retries";
import { evalDrivenDevelopmentGuide } from "./eval-driven-development";
import { extendedThinkingPatternsGuide } from "./extended-thinking-patterns";
import { filesApiCitationsGuide } from "./files-api-citations";
import { gitGuide } from "./git";
import { itertoolsFunctoolsGuide } from "./itertools-functools";
import { mcpServersGuide } from "./mcp-servers";
import { messagesApiGuide } from "./messages-api";
import { multiAgentOrchestrationGuide } from "./multi-agent-orchestration";
import { pandasPolarsForDataPrepGuide } from "./pandas-polars-for-data-prep";
import { pydanticV2FundamentalsGuide } from "./pydantic-v2-fundamentals";
import { sqlFluencyForAnalyticsGuide } from "./sql-fluency-for-analytics";
import { streamingPromptCachingGuide } from "./streaming-prompt-caching";
import { structuredOutputPatternsGuide } from "./structured-output-patterns";
import { testingPytestFixturesMockingGuide } from "./testing-pytest-fixtures-mocking";
import { threadProcessPoolExecutorsGuide } from "./thread-process-pool-executors";
import { tokenCountingContextBudgetingGuide } from "./token-counting-context-budgeting";
import { toolUseLoopGuide } from "./tool-use-loop";
import { visionPdfInputsGuide } from "./vision-pdf-inputs";
import { whenToUseWhichConcurrencyModelGuide } from "./when-to-use-which-concurrency-model";
import { workflowVsAgentDecisionFrameworkGuide } from "./workflow-vs-agent-decision-framework";

/** All available study guides, keyed by topic title (lowercased, exact match). */
const guides: StudyGuide[] = [
  argparseCliPatternsGuide,
  asyncioSemaphoreGatherPatternsGuide,
  bashGuide,
  batchApiGuide,
  bm25HybridRetrievalGuide,
  chainOfThoughtExtendedThinkingGuide,
  collectionsGuide,
  computerUseAgenticToolLoopsGuide,
  contextManagersGeneratorsGuide,
  dataclassesTypingPatternsGuide,
  duckdbLightweightEtlGuide,
  errorHandlingRetriesGuide,
  evalDrivenDevelopmentGuide,
  extendedThinkingPatternsGuide,
  filesApiCitationsGuide,
  gitGuide,
  itertoolsFunctoolsGuide,
  mcpServersGuide,
  messagesApiGuide,
  multiAgentOrchestrationGuide,
  pandasPolarsForDataPrepGuide,
  pydanticV2FundamentalsGuide,
  sqlFluencyForAnalyticsGuide,
  streamingPromptCachingGuide,
  structuredOutputPatternsGuide,
  testingPytestFixturesMockingGuide,
  threadProcessPoolExecutorsGuide,
  tokenCountingContextBudgetingGuide,
  toolUseLoopGuide,
  visionPdfInputsGuide,
  whenToUseWhichConcurrencyModelGuide,
  workflowVsAgentDecisionFrameworkGuide,
];

export function getGuideForTopic(topicTitle: string): StudyGuide | null {
  return (
    guides.find(
      (g) => g.topicTitle.toLowerCase() === topicTitle.toLowerCase(),
    ) ?? null
  );
}

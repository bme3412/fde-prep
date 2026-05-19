import { getState } from "@/lib/store";
import { getGuideForTopic } from "@/lib/guides";
import { notFound } from "next/navigation";
import Link from "next/link";

// Force dynamic rendering so `topic.secondsStudied` (read from fs each request)
// reflects the latest accumulated total on every navigation, not a stale
// build-time / route-cached snapshot.
export const dynamic = "force-dynamic";
import {
  CodePredict,
  ScenarioPredict,
  FlashcardDeck,
  MiniChallenge,
  Prose,
  KeyInsightBlock,
  MethodRefBlock,
  CodeComparisonBlock,
  WarmUpBlock,
  MultipleChoiceBlock,
  GuideProgress,
  SectionCheckbox,
} from "./components";
import type { Flashcard as FlashcardData } from "@/lib/guide-types";
import { StudyTimer } from "@/components/StudyTimer";

export default async function GuidePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const state = await getState();
  const topic = state.topics.find((t) => t.id === id);
  if (!topic) return notFound();

  const guide = getGuideForTopic(topic.title);
  if (!guide) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Link href={`/topics/${id}`} className="text-sm text-zinc-500 hover:text-zinc-700">
          &larr; Back to topic
        </Link>
        <h1 className="text-2xl font-bold">{topic.title}</h1>
        <p className="text-zinc-500">
          No interactive study guide available for this topic yet.
        </p>
      </div>
    );
  }

  // Count interactive blocks for the progress summary
  let totalPredicts = 0;
  let totalScenarios = 0;
  let totalChallenges = 0;
  let totalFlashcardDecks = 0;
  let totalWarmUps = 0;
  let totalMCQs = 0;

  for (const section of guide.sections) {
    const flashcardsInSection: FlashcardData[] = [];
    for (const block of section.blocks) {
      if (block.kind === "code_predict") totalPredicts++;
      if (block.kind === "scenario_predict") totalScenarios++;
      if (block.kind === "mini_challenge") totalChallenges++;
      if (block.kind === "warm_up") totalWarmUps++;
      if (block.kind === "multiple_choice") totalMCQs++;
      if (block.kind === "flashcard") flashcardsInSection.push(block);
    }
    if (flashcardsInSection.length > 0) totalFlashcardDecks++;
  }

  return (
    <div className="max-w-3xl mx-auto px-1 sm:px-0">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="mb-8">
        <Link
          href={`/topics/${id}`}
          className="inline-block text-sm text-zinc-400 hover:text-zinc-600 mb-3 transition-colors"
        >
          &larr; Back to topic
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900">
          {topic.title}
        </h1>
        <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
          Work through each section top to bottom. Predict outputs before revealing.
          Attempt challenges before checking solutions.
        </p>
        <div className="mt-3">
          <StudyTimer topicId={topic.id} initialSeconds={topic.secondsStudied} />
        </div>
      </div>

      {/* ── Progress summary ─────────────────────────────────────────── */}
      <div className="mb-10">
        <GuideProgress
          totalPredicts={totalPredicts}
          totalScenarios={totalScenarios}
          totalChallenges={totalChallenges}
          totalFlashcardDecks={totalFlashcardDecks}
          totalWarmUps={totalWarmUps}
          totalMCQs={totalMCQs}
        />
      </div>

      {/* ── Table of contents ────────────────────────────────────────── */}
      <nav className="mb-10 bg-white border border-zinc-200 rounded-xl p-4 sm:p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
          Sections
        </h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {guide.sections.map((section, si) => (
            <li key={si}>
              <a
                href={`#section-${si}`}
                className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors py-1 block"
              >
                <span className="text-zinc-400 font-mono text-xs mr-1.5">{si + 1}.</span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── Sections ─────────────────────────────────────────────────── */}
      <div className="space-y-16">
        {guide.sections.map((section, si) => {
          // Collect all flashcards in this section into one deck
          const flashcards = section.blocks.filter(
            (b): b is FlashcardData => b.kind === "flashcard",
          );

          return (
            <section key={si} id={`section-${si}`} className="scroll-mt-8">
              {/* Section header */}
              <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-zinc-200">
                <span className="text-3xl font-bold text-zinc-200 font-mono leading-none">
                  {String(si + 1).padStart(2, "0")}
                </span>
                <h2 className="text-xl font-bold text-zinc-900 flex-1 min-w-0">
                  {section.title}
                </h2>
                <SectionCheckbox
                  topicSlug={guide.topicSlug}
                  sectionIndex={si}
                  sectionTitle={section.title}
                />
              </div>

              {/* Section blocks */}
              <div className="space-y-6">
                {section.blocks.map((block, bi) => {
                  switch (block.kind) {
                    case "prose":
                      return <Prose key={bi} markdown={block.markdown} />;
                    case "code_predict":
                      return (
                        <CodePredict
                          key={bi}
                          data={block}
                          topicSlug={guide.topicSlug}
                        />
                      );
                    case "scenario_predict":
                      return (
                        <ScenarioPredict
                          key={bi}
                          data={block}
                          topicSlug={guide.topicSlug}
                        />
                      );
                    case "key_insight":
                      return <KeyInsightBlock key={bi} data={block} />;
                    case "mini_challenge":
                      return (
                        <MiniChallenge
                          key={bi}
                          data={block}
                          topicSlug={guide.topicSlug}
                        />
                      );
                    case "method_ref":
                      return <MethodRefBlock key={bi} data={block} />;
                    case "code_comparison":
                      return <CodeComparisonBlock key={bi} data={block} />;
                    case "warm_up":
                      return (
                        <WarmUpBlock
                          key={bi}
                          data={block}
                          topicSlug={guide.topicSlug}
                        />
                      );
                    case "multiple_choice":
                      return (
                        <MultipleChoiceBlock
                          key={bi}
                          data={block}
                          topicSlug={guide.topicSlug}
                        />
                      );
                    case "flashcard":
                      if (
                        flashcards.length > 0 &&
                        section.blocks.indexOf(flashcards[0]) === bi
                      ) {
                        return (
                          <FlashcardDeck
                            key={bi}
                            cards={flashcards}
                            topicSlug={guide.topicSlug}
                            sectionTitle={section.title}
                          />
                        );
                      }
                      return null;
                    default:
                      return null;
                  }
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="mt-16 mb-8 border-t-2 border-zinc-200 pt-8 text-center space-y-3">
        <p className="text-sm text-zinc-500">
          Finished? Mark the topic as done, or revisit the flashcard deck
          tomorrow to reinforce retention.
        </p>
        <Link
          href={`/topics/${id}`}
          className="inline-block bg-zinc-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
        >
          Back to topic &rarr;
        </Link>
      </div>
    </div>
  );
}

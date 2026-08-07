import { getState } from "@/lib/store";
import { getGuideForTopic } from "@/lib/guides";
import { notFound } from "next/navigation";
import Link from "next/link";
import { slugify } from "@/lib/guide-state-utils";
import type { Flashcard as FlashcardData, ProgressUnit } from "@/lib/guide-types";
import { StudyTimer } from "@/components/StudyTimer";
import { GuideShell, GuideSectionPanel } from "./GuideShell";
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
} from "./components";

// Force dynamic rendering so `topic.secondsStudied` (read from fs each request)
// reflects the latest accumulated total on every navigation, not a stale
// build-time / route-cached snapshot.
export const dynamic = "force-dynamic";

function buildProgressUnits(
  topicSlug: string,
  sections: { title: string; blocks: { kind: string; label?: string; title?: string }[] }[],
): ProgressUnit[] {
  const units: ProgressUnit[] = [];
  for (const section of sections) {
    const flashcards: FlashcardData[] = [];
    for (const block of section.blocks) {
      if (block.kind === "code_predict" && block.label) {
        units.push({
          kind: "code_predict",
          scope: `${topicSlug}:code_predict:${slugify(block.label)}`,
        });
      } else if (block.kind === "scenario_predict" && block.label) {
        units.push({
          kind: "scenario_predict",
          scope: `${topicSlug}:scenario_predict:${slugify(block.label)}`,
        });
      } else if (block.kind === "warm_up" && block.title) {
        units.push({
          kind: "warm_up",
          scope: `${topicSlug}:warm_up:${slugify(block.title)}`,
        });
      } else if (block.kind === "multiple_choice" && block.title) {
        units.push({
          kind: "multiple_choice",
          scope: `${topicSlug}:multiple_choice:${slugify(block.title)}`,
        });
      } else if (block.kind === "mini_challenge" && block.title) {
        units.push({
          kind: "mini_challenge",
          scope: `${topicSlug}:mini_challenge:${slugify(block.title)}`,
        });
      } else if (block.kind === "flashcard") {
        flashcards.push(block as FlashcardData);
      }
    }
    if (flashcards.length > 0) {
      units.push({
        kind: "flashcard_deck",
        scope: `${topicSlug}:flashcards:${slugify(section.title)}`,
        cardCount: flashcards.length,
      });
    }
  }
  return units;
}

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

  const sectionTitles = guide.sections.map((s) => s.title);
  const progressUnits = buildProgressUnits(guide.topicSlug, guide.sections);

  return (
    <div className="max-w-3xl mx-auto px-1 sm:px-0">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="mb-6">
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

      <GuideShell
        topicSlug={guide.topicSlug}
        sectionTitles={sectionTitles}
        progressUnits={progressUnits}
      >
        {guide.sections.map((section, si) => {
          const flashcards = section.blocks.filter(
            (b): b is FlashcardData => b.kind === "flashcard",
          );

          return (
            <GuideSectionPanel key={si} index={si} title={section.title}>
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
            </GuideSectionPanel>
          );
        })}
      </GuideShell>

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

import type { Resource, ResourceDraft } from "./types";
import { serializeResource } from "./lib/markdown";

const examples: ResourceDraft[] = [
  {
    title: "Turn research into opportunities",
    slug: "research-to-opportunities",
    type: "prompt",
    summary:
      "Synthesize mixed customer evidence into clear opportunity areas without jumping to solutions.",
    author: "Maya Chen",
    tags: ["Discovery", "Research", "Strategy"],
    createdAt: "2026-06-12",
    updatedAt: "2026-07-24",
    body: `## When to use this

Use this after a round of interviews, support-ticket analysis, or survey review.

## Prompt

You are a senior product researcher. Review the evidence below and identify the **five strongest opportunity areas**.

For each opportunity:

1. State the unmet need in the customer's language.
2. Cite the supporting evidence.
3. Describe who experiences it most.
4. Note what remains uncertain.
5. Suggest the next smallest learning step.

Do not propose features yet. Separate observed evidence from interpretation.

### Evidence

\`\`\`text
[Paste research notes here]
\`\`\``,
  },
  {
    title: "Executive update writer",
    slug: "executive-update-writer",
    type: "prompt",
    summary:
      "Convert project notes into a concise, candid update for senior stakeholders.",
    author: "Elena Rossi",
    tags: ["Communication", "Leadership"],
    createdAt: "2026-05-18",
    updatedAt: "2026-07-21",
    body: `## Prompt

Turn the notes below into a weekly executive update.

Use this structure:

- **Outcome:** what changed for customers or the business
- **Evidence:** the signal behind that conclusion
- **Next:** the most important action this week
- **Risk:** one issue that needs attention
- **Ask:** a decision or help request, only if needed

Write in plain English. Keep the whole update below 180 words.

\`\`\`text
[Paste your notes]
\`\`\``,
  },
  {
    title: "Product brief reviewer",
    slug: "product-brief-reviewer",
    type: "skill",
    summary:
      "A repeatable review routine for making product briefs sharper, testable, and decision-ready.",
    author: "Jonas Weber",
    tags: ["Product brief", "Quality", "Review"],
    createdAt: "2026-04-03",
    updatedAt: "2026-07-20",
    body: `## Purpose

Review a product brief before it enters delivery planning.

## Review sequence

1. Identify the customer and the job they are trying to do.
2. Check that evidence is linked to each major claim.
3. Separate the desired outcome from the proposed solution.
4. Test whether success measures are observable and time-bound.
5. List unresolved decisions and name an owner for each.

## Output

Return a short scorecard followed by the **three changes with the highest leverage**. Be direct, but explain why every recommendation matters.`,
  },
  {
    title: "Pre-mortem facilitator",
    slug: "pre-mortem-facilitator",
    type: "skill",
    summary:
      "Run a fast, psychologically safe pre-mortem before a launch or major decision.",
    author: "Amara Okafor",
    tags: ["Risk", "Workshop", "Launch"],
    createdAt: "2026-03-11",
    updatedAt: "2026-07-16",
    body: `## Scenario

Imagine it is six months from now and the initiative failed.

## Facilitation

- Give everyone five silent minutes to list plausible reasons.
- Cluster causes into customer, product, delivery, and organisational risks.
- Vote on likelihood and impact separately.
- Convert the top three risks into early warning signals.
- Assign one preventative action and one contingency owner.

> Keep the conversation about systems and assumptions, not individual blame.`,
  },
  {
    title: "Opportunity Solution Tree",
    slug: "opportunity-solution-tree",
    type: "tool",
    summary:
      "Map outcomes, customer opportunities, solution ideas, and assumption tests in one visual.",
    author: "Product Practice",
    tags: ["Discovery", "Mapping", "Prioritisation"],
    createdAt: "2026-02-14",
    updatedAt: "2026-07-12",
    toolUrl: "https://www.producttalk.org/opportunity-solution-trees/",
    body: `## What it helps with

Opportunity Solution Trees keep discovery anchored to an outcome while making alternative opportunities and solutions visible.

## Suggested workflow

1. Choose one measurable product outcome.
2. Add opportunities grounded in customer evidence.
3. Explore multiple solutions for promising opportunities.
4. Expose the assumptions behind each solution.
5. Test the riskiest assumption first.`,
  },
  {
    title: "Decision log",
    slug: "decision-log",
    type: "tool",
    summary:
      "A lightweight format for recording important product decisions and the evidence behind them.",
    author: "Nora Singh",
    tags: ["Decision", "Alignment", "Documentation"],
    createdAt: "2026-01-20",
    updatedAt: "2026-07-08",
    body: `## Decision template

| Field | Detail |
| --- | --- |
| Decision | What did we decide? |
| Date | When was it decided? |
| Owner | Who is accountable? |
| Context | What triggered the decision? |
| Evidence | What information mattered? |
| Alternatives | What else did we consider? |
| Revisit when | What new signal should reopen it? |

Keep entries short enough that people will actually read them.`,
  },
  {
    title: "Continuous Discovery Habits",
    slug: "continuous-discovery-habits",
    type: "book",
    summary:
      "A practical guide to making customer discovery a regular part of product decision-making.",
    author: "Product Practice",
    creator: "Teresa Torres",
    tags: ["Discovery", "Research", "Product teams"],
    createdAt: "2026-07-01",
    updatedAt: "2026-07-25",
    toolUrl: "https://www.producttalk.org/continuous-discovery-habits/",
    body: `## Why it is worth reading

This book turns discovery from a special project into a weekly team habit. Its visual frameworks are especially useful for connecting desired outcomes, customer opportunities, and small assumption tests.

## Best for

Product trios that want a shared, repeatable approach to continuous discovery.

## Key takeaway

Talk to customers every week and test assumptions before investing in complete solutions.`,
  },
  {
    title: "How great leaders inspire action",
    slug: "how-great-leaders-inspire-action",
    type: "video",
    summary:
      "A concise introduction to communicating purpose before features, plans, or implementation detail.",
    author: "Product Practice",
    creator: "Simon Sinek · TED",
    tags: ["Leadership", "Communication", "Purpose"],
    createdAt: "2026-07-02",
    updatedAt: "2026-07-26",
    toolUrl: "https://www.ted.com/talks/simon_sinek_how_great_leaders_inspire_action",
    body: `## Why it is worth watching

The talk offers a memorable structure for explaining why a product or initiative matters before describing what it does.

## Best for

Product managers preparing a strategy narrative, kickoff, or stakeholder presentation.

## Key takeaway

Start with purpose, then explain the approach and finally the product or action.`,
  },
  {
    title: "Product discovery conference",
    slug: "product-discovery-conference",
    type: "conference",
    summary:
      "A sample event listing for sharing conferences that help product teams learn from peers.",
    author: "Product Practice",
    creator: "Product Community",
    tags: ["Conference", "Discovery", "Community"],
    createdAt: "2026-07-03",
    updatedAt: "2026-07-27",
    toolUrl: "https://example.com/product-discovery-conference",
    eventDate: "2026-10-15",
    location: "Berlin · Hybrid",
    attended: "yes",
    whoAttended: "Alex Morgan, Priya Shah",
    body: `## Why it is worth attending

Meet product practitioners working through similar discovery, strategy, and delivery challenges.

## Best for

Product managers who want practical ideas and a stronger professional network.

## What to expect

Talks, peer discussions, and hands-on sessions focused on modern product practice.`,
  },
  {
    title: "Product strategy fundamentals",
    slug: "product-strategy-fundamentals",
    type: "training",
    summary:
      "A sample course listing for structured learning in product strategy and prioritisation.",
    author: "Product Practice",
    creator: "Learning & Development",
    tags: ["Training", "Strategy", "Prioritisation"],
    createdAt: "2026-07-04",
    updatedAt: "2026-07-27",
    toolUrl: "https://example.com/product-strategy-training",
    body: `## Why it is useful

Build a shared approach to turning company goals, customer evidence, and market context into product choices.

## Best for

Product managers moving from feature delivery into strategy ownership.

## What you will learn

How to frame strategic choices, define outcomes, and connect priorities to evidence.`,
  },
  {
    title: "Writing decision-ready product briefs",
    slug: "writing-decision-ready-product-briefs",
    type: "article",
    summary:
      "A sample article listing for sharing concise, practical product-management reading.",
    author: "Product Practice",
    creator: "MILO Editorial",
    tags: ["Article", "Writing", "Product brief"],
    createdAt: "2026-07-05",
    updatedAt: "2026-07-28",
    toolUrl: "https://example.com/decision-ready-product-briefs",
    body: `## Why it is worth reading

It shows how to make product briefs useful for decisions instead of turning them into long project documents.

## Best for

Product managers preparing work for discovery, prioritisation, or delivery planning.

## Key takeaway

A strong brief makes the customer problem, evidence, intended outcome, and unresolved decisions easy to find.`,
  },
  {
    title: "How product teams learn",
    slug: "how-product-teams-learn",
    type: "podcast",
    summary:
      "A sample podcast recommendation about building stronger learning habits in product teams.",
    author: "Product Practice",
    creator: "The Product Practice Podcast",
    tags: ["Podcast", "Learning", "Product teams"],
    createdAt: "2026-07-06",
    updatedAt: "2026-07-28",
    toolUrl: "https://example.com/how-product-teams-learn",
    body: `## Why it is worth listening

The conversation offers practical ways to make reflection and customer learning part of normal product work.

## Best for

Product managers looking to improve how their teams capture and apply lessons.

## Key takeaway

Learning becomes useful when teams turn it into a visible decision or a small change in behaviour.`,
  },
];

export const exampleResources: Resource[] = examples.map((draft) => {
  const collectionFiles: Partial<Record<ResourceDraft["type"], string>> = {
    book: "books.json",
    video: "videos.json",
    conference: "conferences.json",
    training: "training.json",
    article: "articles.json",
    podcast: "podcasts.json",
  };
  const collectionFile = collectionFiles[draft.type];
  const isCollection = Boolean(collectionFile);
  const raw = isCollection ? `${JSON.stringify(draft, null, 2)}\n` : serializeResource(draft);
  return {
    meta: draft,
    body: draft.body,
    source: "example",
    path: isCollection ? `${collectionFile}#${draft.slug}` : `${draft.type}s/${draft.slug}.md`,
    raw,
  };
});

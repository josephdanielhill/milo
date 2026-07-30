import DOMPurify from "dompurify";
import { marked } from "marked";
import type { Resource, ResourceDraft, ResourceMeta, ResourceSource, ResourceType } from "../types";

const validTypes = new Set<ResourceType>([
  "prompt",
  "skill",
  "tool",
  "book",
  "video",
  "conference",
  "training",
  "article",
  "podcast",
]);

const linkedResourceTypes = new Set<ResourceType>([
  "book",
  "video",
  "conference",
  "training",
  "article",
  "podcast",
]);

const creatorErrors: Partial<Record<ResourceType, string>> = {
  book: "Add the book author.",
  video: "Add the presenter or channel.",
  conference: "Add the conference organiser.",
  training: "Add the training provider.",
  article: "Add the article author or publication.",
  podcast: "Add the podcast host or show.",
};

const linkErrors: Partial<Record<ResourceType, string>> = {
  book: "Add a link to the book.",
  video: "Add a link to the video.",
  conference: "Add a link to the conference.",
  training: "Add a link to the training.",
  article: "Add a link to the article.",
  podcast: "Add a link to the podcast.",
};

function clean(value: string) {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}

function parseTags(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((tag) => clean(tag))
      .filter(Boolean);
  }
  return trimmed
    .split(",")
    .map((tag) => clean(tag))
    .filter(Boolean);
}

const SUMMARY_DISPLAY_LIMIT = 200;

/** Guards against summaries that exceed the limit outside the editor (manual file edits, older content). */
export function displaySummary(summary: string) {
  return summary.length > SUMMARY_DISPLAY_LIMIT
    ? `${summary.slice(0, SUMMARY_DISPLAY_LIMIT)}...`
    : summary;
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export function parseResource(
  raw: string,
  path: string,
  source: ResourceSource = "local",
): Resource {
  if (new Blob([raw]).size > 1_000_000) {
    throw new Error("This file is larger than the 1 MB limit.");
  }
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) throw new Error("Missing or malformed frontmatter.");

  const values: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error(`Invalid frontmatter line: ${line}`);
    values[line.slice(0, separator).trim()] = clean(line.slice(separator + 1));
  }

  const type = values.type as ResourceType;
  const meta: ResourceMeta = {
    title: values.title,
    slug: values.slug,
    type,
    summary: values.summary,
    author: values.author,
    tags: parseTags(values.tags || ""),
    createdAt: values.createdAt,
    updatedAt: values.updatedAt,
    ...(values.toolUrl ? { toolUrl: values.toolUrl } : {}),
    ...(values.creator ? { creator: values.creator } : {}),
    ...(values.eventDate ? { eventDate: values.eventDate } : {}),
    ...(values.location ? { location: values.location } : {}),
    ...(values.attended === "yes" || values.attended === "no"
      ? { attended: values.attended }
      : {}),
    ...(values.whoAttended ? { whoAttended: values.whoAttended } : {}),
    ...(values.importedFrom ? { importedFrom: values.importedFrom } : {}),
  };

  const errors = validateResource({ ...meta, body: match[2].trim() });
  if (errors.length) throw new Error(errors.join(" "));

  return { meta, body: match[2].trim(), source, path, raw };
}

function yamlString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function serializeResource(resource: ResourceDraft) {
  const lines = [
    "---",
    `title: ${yamlString(resource.title)}`,
    `slug: ${resource.slug}`,
    `type: ${resource.type}`,
    `summary: ${yamlString(resource.summary)}`,
    `author: ${yamlString(resource.author)}`,
    `tags: [${resource.tags.map(yamlString).join(", ")}]`,
    `createdAt: ${resource.createdAt}`,
    `updatedAt: ${resource.updatedAt}`,
  ];
  if (resource.toolUrl) lines.push(`toolUrl: ${resource.toolUrl}`);
  if (resource.creator) lines.push(`creator: ${yamlString(resource.creator)}`);
  if (resource.eventDate) lines.push(`eventDate: ${resource.eventDate}`);
  if (resource.location) lines.push(`location: ${yamlString(resource.location)}`);
  if (resource.attended) lines.push(`attended: ${resource.attended}`);
  if (resource.whoAttended) lines.push(`whoAttended: ${yamlString(resource.whoAttended)}`);
  if (resource.importedFrom) lines.push(`importedFrom: ${yamlString(resource.importedFrom)}`);
  return `${lines.join("\n")}\n---\n\n${resource.body.trim()}\n`;
}

export function validateResource(resource: ResourceDraft) {
  const errors: string[] = [];
  if (!resource.title.trim()) errors.push("Add a title.");
  if (!resource.slug.trim()) errors.push("Add a filename slug.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resource.slug)) {
    errors.push("Use lowercase letters, numbers, and hyphens in the slug.");
  }
  if (!validTypes.has(resource.type)) errors.push("Choose a valid resource type.");
  if (!resource.summary.trim()) errors.push("Add a short summary.");
  if (!resource.author.trim()) errors.push("Add an author.");
  if (linkedResourceTypes.has(resource.type) && !resource.creator?.trim()) {
    errors.push(creatorErrors[resource.type] || "Add the resource creator.");
  }
  if (linkedResourceTypes.has(resource.type) && !resource.toolUrl) {
    errors.push(linkErrors[resource.type] || "Add a link to the resource.");
  }
  if (
    resource.type === "conference" &&
    resource.attended === "yes" &&
    !resource.whoAttended?.trim()
  ) {
    errors.push("Add who attended the conference.");
  }
  if (!resource.createdAt) errors.push("Add a created date.");
  if (!resource.updatedAt) errors.push("Add an updated date.");
  if (!resource.body.trim()) errors.push("Add some Markdown content.");
  if (resource.toolUrl) {
    try {
      const parsed = new URL(resource.toolUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      errors.push("Use a valid http or https URL.");
    }
  }
  if (new Blob([serializeResourceUnsafe(resource)]).size > 1_000_000) {
    errors.push("Keep the file below 1 MB.");
  }
  return errors;
}

function serializeResourceUnsafe(resource: ResourceDraft) {
  return JSON.stringify(resource);
}

export function renderMarkdown(markdown: string) {
  const html = marked.parse(markdown, {
    breaks: true,
    gfm: true,
  }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
}

export function starterBody(type: ResourceType) {
  if (type === "prompt") {
    return `## When to use this\n\nDescribe the situation this prompt supports.\n\n## Prompt\n\nYou are a…\n\nYour task is to…\n\nReturn the result in this format:\n\n1. …\n2. …`;
  }
  if (type === "skill") {
    return `## Purpose\n\nWhat repeatable capability does this skill provide?\n\n## Steps\n\n1. Start with…\n2. Check…\n3. Produce…\n\n## Quality bar\n\nA strong result should…`;
  }
  if (type === "book") {
    return `## Why it is worth reading\n\nExplain what makes this book useful for product managers.\n\n## Best for\n\nWho will get the most value from it?\n\n## Key takeaway\n\nShare one idea that stayed with you.`;
  }
  if (type === "video") {
    return `## Why it is worth watching\n\nExplain what makes this video useful for product managers.\n\n## Best for\n\nWho will get the most value from it?\n\n## Key takeaway\n\nShare one idea that stayed with you.`;
  }
  if (type === "conference") {
    return `## Why it is worth attending\n\nExplain what makes this conference useful for product managers.\n\n## Best for\n\nWho will get the most value from it?\n\n## What to expect\n\nShare the topics, format, or experience attendees can expect.`;
  }
  if (type === "training") {
    return `## Why it is useful\n\nExplain what makes this training valuable for product managers.\n\n## Best for\n\nWho will get the most value from it?\n\n## What you will learn\n\nShare the main skills or outcomes participants can expect.`;
  }
  if (type === "article") {
    return `## Why it is worth reading\n\nExplain what makes this article useful for product managers.\n\n## Best for\n\nWho will get the most value from it?\n\n## Key takeaway\n\nShare one idea that stayed with you.`;
  }
  if (type === "podcast") {
    return `## Why it is worth listening\n\nExplain what makes this podcast useful for product managers.\n\n## Best for\n\nWho will get the most value from it?\n\n## Key takeaway\n\nShare one idea that stayed with you.`;
  }
  return `## What it helps with\n\nDescribe the tool and the problem it solves.\n\n## Suggested workflow\n\n1. Open the tool.\n2. Prepare…\n3. Review…`;
}

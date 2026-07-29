import type { Resource } from "../types";
import {
  publishedCollectionFiles,
  publishedResourceFiles,
} from "../generated/published-manifest";
import { parseResource } from "./markdown";
import { collectionTypeForFile, parseCollectionItems } from "./storage";

function loadPublishedResources(): Resource[] {
  const resources: Resource[] = [];
  for (const [filename, raw] of Object.entries(publishedCollectionFiles)) {
    const type = collectionTypeForFile(filename);
    if (!type) continue;
    try {
      resources.push(...parseCollectionItems(type, raw, "published"));
    } catch (error) {
      console.warn(`Skipped published ${filename}:`, error);
    }
  }
  for (const file of publishedResourceFiles) {
    try {
      resources.push(parseResource(file.raw, file.path, "published"));
    } catch (error) {
      console.warn(`Skipped published ${file.path}:`, error);
    }
  }
  return resources;
}

export const publishedResources = loadPublishedResources();

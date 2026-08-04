export type ResourceType =
  | "prompt"
  | "skill"
  | "tool"
  | "book"
  | "video"
  | "conference"
  | "training"
  | "article"
  | "podcast";
export type ResourceSource = "example" | "local" | "published";

export interface ResourceMeta {
  title: string;
  slug: string;
  type: ResourceType;
  summary: string;
  author: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  toolUrl?: string;
  creator?: string;
  eventDate?: string;
  location?: string;
  attended?: "yes" | "no";
  whoAttended?: string;
  /** Name of the folder or bundle this resource was brought in from via Import, if any. */
  importedFrom?: string;
}

export interface Resource {
  meta: ResourceMeta;
  body: string;
  source: ResourceSource;
  path: string;
  raw: string;
  /**
   * Filesystem mtime (ms epoch), when known. createdAt/updatedAt are
   * day-granularity and hand-editable, so same-day resources tie on them;
   * this breaks that tie with real precision without touching the
   * persisted front matter/JSON format.
   */
  fsModifiedMs?: number;
}

export interface ResourceDraft extends ResourceMeta {
  body: string;
}

export interface ForumCollection {
  slug: string;
  name: string;
  author: string;
  description: string;
  bundleUrl: string;
  itemCount: number;
  tags: string[];
  createdAt: string;
  /** Per-type resource counts, e.g. { tool: 4, book: 3, video: 2 } */
  typeBreakdown?: Record<string, number>;
}

export interface Subscription {
  url: string;
  name: string;
  addedAt: string;
  lastCheckedAt?: string;
  lastCheckedOk?: boolean;
  lastError?: string;
  lastResourceCount?: number;
}

export interface StorageProvider {
  connect(): Promise<string>;
  reconnect(): Promise<string | null>;
  listResources(): Promise<Resource[]>;
  readResource(path: string): Promise<Resource>;
  createResource(resource: ResourceDraft): Promise<Resource>;
  updateResource(path: string, resource: ResourceDraft): Promise<Resource>;
  deleteResource(path: string): Promise<void>;
  downloadResource(path: string): Promise<void>;
}

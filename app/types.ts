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
}

export interface Resource {
  meta: ResourceMeta;
  body: string;
  source: ResourceSource;
  path: string;
  raw: string;
}

export interface ResourceDraft extends ResourceMeta {
  body: string;
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

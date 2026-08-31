"use client";

import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  FileText,
  Folder,
  FolderCheck,
  FolderOpen,
  FolderX,
  Globe,
  GraduationCap,
  HardDrive,
  Home,
  Headphones,
  Info,
  Library,
  Link2,
  Menu,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UploadCloud,
  Video,
  WandSparkles,
  Wrench,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { exampleResources } from "./data";
import { publishedForumCollectionsList, publishedResources } from "./lib/published";
import { displaySummary, renderMarkdown, slugify, starterBody, validateResource } from "./lib/markdown";
import {
  checkSubscription,
  downloadBundle,
  downloadMarkdown,
  fetchImportSource,
  LocalFolderStorage,
  pickImportSource,
  readImportFile,
  supportsLocalFolders,
  type ImportSource,
} from "./lib/storage";
import type { Resource, ResourceDraft, ForumCollection, ResourceType, Subscription } from "./types";

const storage = new LocalFolderStorage();
const today = new Date().toISOString().slice(0, 10);
const HAS_CONNECTED_KEY = "milo:has-connected";
const IDENTITY_KEY = "milo:identity";
const VERSION_POLL_INTERVAL_MS = 5 * 60 * 1000;

// Used only to tell one browser's favourites apart from another's in a shared folder — not a
// user-facing name, never editable, so no collision handling is needed beyond a decent pool size.
const IDENTITY_ADJECTIVES = [
  "amber", "brave", "calm", "clever", "cosmic", "crisp", "curious", "eager",
  "gentle", "golden", "happy", "keen", "lively", "lucky", "mellow", "misty",
  "nimble", "quiet", "quick", "sunny", "swift", "tidy", "vivid", "witty",
];
const IDENTITY_ANIMALS = [
  "badger", "otter", "falcon", "heron", "lynx", "magpie", "marten", "mole",
  "osprey", "panda", "puffin", "raven", "robin", "seal", "sparrow", "swan",
  "tapir", "toucan", "vole", "walrus", "weasel", "wombat", "wren", "yak",
];

function generateIdentity() {
  const adjective = IDENTITY_ADJECTIVES[Math.floor(Math.random() * IDENTITY_ADJECTIVES.length)];
  const animal = IDENTITY_ANIMALS[Math.floor(Math.random() * IDENTITY_ANIMALS.length)];
  return `${adjective}-${animal}`;
}

function getOrCreateIdentity() {
  const stored = window.localStorage.getItem(IDENTITY_KEY);
  if (stored) return stored;
  const identity = generateIdentity();
  window.localStorage.setItem(IDENTITY_KEY, identity);
  return identity;
}

function resourceKey(resource: Pick<Resource, "meta">) {
  return `${resource.meta.type}:${resource.meta.slug}`;
}

type FolderStatus = "idle" | "connecting" | "connected" | "permission" | "unsupported" | "error";

function folderConnectLabel(status: FolderStatus, folderName: string | null) {
  if (status === "connecting") return "Opening…";
  if (folderName) return "Change folder";
  if (status === "permission") return "Reconnect";
  return "Choose folder";
}

const typeLabels: Record<ResourceType, string> = {
  prompt: "Prompt",
  skill: "Skill",
  tool: "Tool",
  book: "Book",
  video: "Video",
  conference: "Conference",
  training: "Training",
  article: "Article",
  podcast: "Podcast",
};

const typeDescriptions: Record<ResourceType, string> = {
  prompt: "Ready-to-use instructions for sharper thinking and clearer output.",
  skill: "Repeatable practices that turn good product work into a habit.",
  tool: "Frameworks, templates, and utilities that make the work easier to see and share.",
  book: "Recommended reading that helps product people deepen their practice.",
  video: "Talks, explainers, and sessions worth sharing with the product team.",
  conference: "Events where product people can learn, connect, and exchange ideas.",
  training: "Courses and learning programmes that build practical product capability.",
  article: "Useful reads that explain an idea, challenge assumptions, or sharpen practice.",
  podcast: "Conversations and episodes worth listening to and sharing with the product team.",
};

const resourceTypes: ResourceType[] = [
  "prompt",
  "skill",
  "tool",
  "book",
  "video",
  "conference",
  "training",
  "article",
  "podcast",
];

const collectionFiles: Partial<Record<ResourceType, string>> = {
  book: "books.json",
  video: "videos.json",
  conference: "conferences.json",
  training: "training.json",
  article: "articles.json",
  podcast: "podcasts.json",
};

function typeIcon(type: ResourceType, size = 18) {
  if (type === "prompt") return <WandSparkles size={size} aria-hidden="true" />;
  if (type === "skill") return <Sparkles size={size} aria-hidden="true" />;
  if (type === "book") return <BookOpen size={size} aria-hidden="true" />;
  if (type === "video") return <Video size={size} aria-hidden="true" />;
  if (type === "conference") return <CalendarDays size={size} aria-hidden="true" />;
  if (type === "training") return <GraduationCap size={size} aria-hidden="true" />;
  if (type === "article") return <Newspaper size={size} aria-hidden="true" />;
  if (type === "podcast") return <Headphones size={size} aria-hidden="true" />;
  return <Wrench size={size} aria-hidden="true" />;
}

function isCollectionType(type: ResourceType) {
  return Boolean(collectionFiles[type]);
}

function isReadOnlySource(source: Resource["source"]) {
  return source === "example" || source === "published";
}

function sourcePillLabel(source: Resource["source"]) {
  if (source === "local") return "My folder";
  if (source === "published") return "Published";
  return "Example";
}

function sourceDetailLabel(source: Resource["source"]) {
  if (source === "local") return "My local folder";
  if (source === "published") return "Published resource";
  return "Bundled example";
}

/** Human-readable label for driveType badge. */
function driveBadgeLabel(driveType?: string) {
  if (driveType === "collection") return "Collection drive";
  return ""; // Main drive is the default — no badge needed
}

function routeForType(type: ResourceType) {
  return type === "training" ? "/training" : `/${type}s`;
}

/**
 * Resolve the landing route after a state-changing action performed from a
 * resource context (delete, import, etc). Derives the destination from the
 * route the user is currently on so the action returns them to the category
 * they came from, rather than dumping them at a hard-coded page.
 *
 * This is the single source of truth for post-action navigation — new
 * handlers should call this instead of hard-coding a target route.
 */
function resourceReturnRoute(route: {
  kind: "resource" | "edit" | "create";
  type: ResourceType;
}): string {
  // Stay in the category the resource belongs to (routeForType handles the
  // plural route form). Never fall back to a literal; if the route is typed,
  // routeForType always yields a valid category route.
  return routeForType(route.type);
}

function pluralTypeLabel(type: ResourceType) {
  return type === "training" ? "Training" : `${typeLabels[type]}s`;
}

function creatorLabel(type: ResourceType) {
  if (type === "book") return "Book author";
  if (type === "video") return "Presenter / channel";
  if (type === "conference") return "Conference organiser";
  if (type === "training") return "Training provider";
  if (type === "article") return "Author / publication";
  if (type === "podcast") return "Host / show";
  return "Creator";
}

function creatorPlaceholder(type: ResourceType) {
  if (type === "book") return "e.g. Teresa Torres";
  if (type === "video") return "e.g. TED · Simon Sinek";
  if (type === "conference") return "e.g. Mind the Product";
  if (type === "training") return "e.g. Learning & Development";
  if (type === "article") return "e.g. Author · Publication";
  if (type === "podcast") return "e.g. Host · Podcast name";
  return "";
}

function linkLabel(type: ResourceType) {
  if (type === "book") return "Book link";
  if (type === "video") return "Video link";
  if (type === "conference") return "Conference link";
  if (type === "training") return "Training link";
  if (type === "article") return "Article link";
  if (type === "podcast") return "Podcast link";
  return "Tool URL";
}

function externalActionLabel(type: ResourceType) {
  if (type === "video") return "Watch video";
  if (type === "book") return "View book";
  if (type === "conference") return "View conference";
  if (type === "training") return "View training";
  if (type === "article") return "Read article";
  if (type === "podcast") return "Listen to podcast";
  return "Open referenced tool";
}

function pathFromLocation(basePath = "") {
  if (typeof window === "undefined") return "/";
  const pathname =
    basePath && window.location.pathname.startsWith(basePath)
      ? window.location.pathname.slice(basePath.length) || "/"
      : window.location.pathname;
  return `${pathname}${window.location.search}`;
}

function emptyDraft(type: ResourceType = "prompt"): ResourceDraft {
  return {
    title: "",
    slug: "",
    type,
    summary: "",
    author: "",
    tags: [],
    createdAt: today,
    updatedAt: today,
    body: starterBody(type),
    ...(type === "conference" ? { attended: "no" as const } : {}),
  };
}

export default function ToolshelfApp({
  initialPath = "/",
  basePath = "",
}: {
  initialPath?: string;
  basePath?: string;
}) {
  const [path, setPath] = useState(initialPath);
  const [localResources, setLocalResources] = useState<Resource[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderStatus, setFolderStatus] = useState<FolderStatus>("idle");
  const [folderMessage, setFolderMessage] = useState("");
  const [collectionResources, setCollectionResources] = useState<Resource[]>([]);
  const [collectionFolderName, setCollectionFolderName] = useState<string | null>(null);
  const [collectionFolderStatus, setCollectionFolderStatus] = useState<FolderStatus>("idle");
  const [collectionFolderMessage, setCollectionFolderMessage] = useState("");
  const [hasConnectedBefore, setHasConnectedBefore] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [identity, setIdentity] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [subscriptionUpdates, setSubscriptionUpdates] = useState<{
    newOrChanged: number;
    subs: number;
    failed: number;
  } | null>(null);
  const [pendingReviewSources, setPendingReviewSources] = useState<ImportSource[]>([]);
  const [subscriptionReviewModalOpen, setSubscriptionReviewModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [newResourcePopup, setNewResourcePopup] = useState<Resource | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const unsavedChangesRef = useRef(false);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const mergedResources = useMemo(() => {
    const localKeys = new Set(localResources.map((item) => resourceKey(item)));
    const collectionVisible = collectionResources.filter(
      (item) => !localKeys.has(resourceKey(item)),
    );
    const mergedRealKeys = new Set(localResources.map((item) => resourceKey(item)));
    for (const item of collectionVisible) mergedRealKeys.add(resourceKey(item));
    const remotePublished = publishedResources.filter(
      (item) => !mergedRealKeys.has(resourceKey(item)),
    );
    const realResources = [...localResources, ...collectionVisible, ...remotePublished];
    const typesWithRealResources = new Set(realResources.map((item) => item.meta.type));
    const visibleExamples = exampleResources.filter(
      (item) => !typesWithRealResources.has(item.meta.type),
    );
    return [...realResources, ...visibleExamples];
  }, [localResources, collectionResources]);

  const resources = useMemo(
    () => mergedResources.filter((item) => !dismissed.has(resourceKey(item))),
    [mergedResources, dismissed],
  );

  const allResources = mergedResources;

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  // Clean up toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (
      unsavedChangesRef.current &&
      !window.confirm("Leave without saving your changes?")
    ) {
      return;
    }
    window.history.pushState({}, "", `${basePath}${nextPath}`);
    unsavedChangesRef.current = false;
    setPath(nextPath);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [basePath]);

  const refreshResources = useCallback(async () => {
    if (!folderName && !collectionFolderName) return;
    try {
      if (folderName) {
        const freshLocalResources = await storage.listResources();
        setLocalResources(freshLocalResources);

        const subscriptions = await storage.listSubscriptions();
        if (subscriptions.length === 0) {
          // No subscriptions — just refresh collection if connected and done
          if (collectionFolderName) {
            setCollectionResources(await storage.listCollectionResources());
          }
          notify("Library refreshed");
          return;
        }

        const localByKey = new Map<string, Resource>();
        for (const item of freshLocalResources) localByKey.set(`${item.meta.type}:${item.meta.slug}`, item);

        const checks = await Promise.all(
          subscriptions.map(async (subscription) => ({ subscription, result: await checkSubscription(subscription) })),
        );
        await storage.recordSubscriptionChecks(
          checks.map(({ subscription, result }) =>
            result.ok
              ? {
                  url: subscription.url,
                  ok: true,
                  resourceCount: result.source.resources.length,
                  name: result.source.name,
                }
              : { url: subscription.url, ok: false, error: result.error },
          ),
        );

        let newOrChanged = 0;
        let failed = 0;
        const pendingSources: ImportSource[] = [];
        for (const { result } of checks) {
          if (result.ok) {
            const candidatesCount = buildImportCandidates(result.source.resources, localByKey).length;
            if (candidatesCount > 0) {
              newOrChanged += candidatesCount;
              pendingSources.push(result.source);
            }
          } else {
            failed += 1;
          }
        }

        setPendingReviewSources(pendingSources);

        if (newOrChanged > 0) {
          setSubscriptionUpdates({ newOrChanged, subs: subscriptions.length, failed });
          setSubscriptionReviewModalOpen(true);
        } else {
          notify(
            failed > 0
              ? `Library refreshed — no updates from your subscriptions (${failed} of ${subscriptions.length} couldn't be reached).`
              : "Library refreshed — no updates from your subscriptions.",
          );
        }
        setFolderStatus("connected");
        setFolderMessage("");
      }

      if (collectionFolderName) {
        setCollectionResources(await storage.listCollectionResources());
        if (!folderName) notify("Collection drive refreshed");
      }
    } catch (error) {
      setFolderStatus("permission");
      setFolderMessage(error instanceof Error ? error.message : "Folder access was lost.");
    }
  }, [folderName, collectionFolderName, notify]);

  useEffect(() => {
    queueMicrotask(() => {
      if (window.localStorage.getItem(HAS_CONNECTED_KEY) === "1") setHasConnectedBefore(true);
      setIdentity(getOrCreateIdentity());
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}version.json`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (cancelled || !data.buildId || data.buildId === __MILO_BUILD_ID__) return;
        setUpdateAvailable(true);
        clearInterval(interval);
        document.removeEventListener("visibilitychange", onVisible);
      } catch {
        // Offline or the request failed — just try again next tick.
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") checkForUpdate();
    }

    const interval = setInterval(checkForUpdate, VERSION_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!folderName || !identity) return;
    let cancelled = false;
    (async () => {
      try {
        let activeIdentity = identity;
        let items = await storage.getFavourites(activeIdentity);
        if (items.length === 0) {
          // This browser's identity has no favourites file here. That's normal for a truly
          // new identity, but it's also what a *previous* identity looks like once its
          // localStorage entry is gone (e.g. the user cleared cookies/site data, which wipes
          // localStorage too, not just cookies). If this folder has exactly one favourites
          // file, there's no ambiguity about whose it is, so adopt it rather than leaving the
          // user's favourites orphaned under a name nothing points to anymore. With more than
          // one identity present (a shared folder), don't guess — that risks showing someone
          // else's stars.
          const existing = await storage.listFavouriteIdentities();
          if (existing.length === 1 && existing[0] !== activeIdentity) {
            activeIdentity = existing[0];
            items = await storage.getFavourites(activeIdentity);
            if (!cancelled) {
              window.localStorage.setItem(IDENTITY_KEY, activeIdentity);
              setIdentity(activeIdentity);
            }
          }
        }
        if (!cancelled) setFavourites(new Set(items));
      } catch (error) {
        // Without this, a rejection here (anything but "file doesn't exist yet") left
        // favourites silently stuck at whatever they were before reconnecting — usually
        // empty — with no indication anything had gone wrong.
        if (cancelled) return;
        console.warn("Could not load favourites:", error);
        notify(
          error instanceof Error
            ? `Could not load your favourites: ${error.message}`
            : "Could not load your favourites.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folderName, identity, notify]);

  // Detect newly published resources and show pop-up
  useEffect(() => {
    if (resources.length === 0) return;
    const seenKey = "milo:seen-published-resources";
    try {
      const raw = window.localStorage.getItem(seenKey);
      const seen: Set<string> = new Set(raw ? JSON.parse(raw) : []);
      const publishedOnly = publishedResources.filter(
        (r) => !dismissed.has(resourceKey(r)),
      );
      const unseen = publishedOnly.filter((r) => !seen.has(resourceKey(r)));
      if (unseen.length > 0) {
        // Mark all as seen and show the first one
        const newSeen = new Set(seen);
        for (const r of unseen) newSeen.add(resourceKey(r));
        window.localStorage.setItem(seenKey, JSON.stringify([...newSeen]));
        queueMicrotask(() => setNewResourcePopup(unseen[0]));
      }
    } catch {
      // localStorage might not be available
    }
  }, [resources, dismissed]);

  useEffect(() => {
    if (!folderName || !identity) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await storage.getDismissed(identity);
        if (!cancelled) setDismissed(new Set(items));
      } catch (error) {
        if (cancelled) return;
        console.warn("Could not load dismissed resources:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folderName, identity]);

  const toggleFavourite = useCallback(
    async (resource: Resource) => {
      if (!folderName || !identity) {
        notify("Connect a folder to save favourites");
        return;
      }
      const key = resourceKey(resource);
      const next = new Set(favourites);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setFavourites(next);
      try {
        await storage.saveFavourites(identity, [...next]);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not save that favourite.");
      }
    },
    [folderName, identity, favourites, notify],
  );

  const toggleDismiss = useCallback(
    async (resource: Resource) => {
      if (!folderName || !identity) {
        notify("Connect a folder to hide resources");
        return;
      }
      const key = resourceKey(resource);
      const next = new Set(dismissed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setDismissed(next);
      try {
        await storage.saveDismissed(identity, [...next]);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not save hidden resources.");
      }
    },
    [folderName, identity, dismissed, notify],
  );

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
    lastFocusedRef.current?.focus();
    lastFocusedRef.current = null;
  }, []);

  useEffect(() => {
    const onPop = () => setPath(pathFromLocation(basePath));
    window.addEventListener("popstate", onPop);
    if (!supportsLocalFolders()) {
      queueMicrotask(() => {
        setFolderStatus("unsupported");
        setIsReconnecting(false);
      });
      return () => window.removeEventListener("popstate", onPop);
    }
    queueMicrotask(() => setIsReconnecting(true));
    storage
      .reconnect()
      .then(async (name) => {
        if (name) {
          setFolderName(name);
          setFolderStatus("connected");
          setLocalResources(await storage.listResources());
          setHasConnectedBefore(true);
          window.localStorage.setItem(HAS_CONNECTED_KEY, "1");
        } else if (storage.folderName) {
          setFolderStatus("permission");
          setFolderMessage("Reconnect your folder to continue editing.");
        }
      })
      .catch(() => setFolderStatus("idle"))
      .finally(() => {
        // Try reconnecting the collection drive too
        storage
          .reconnectCollectionDrive()
          .then(async (collectionName) => {
            if (collectionName) {
              setCollectionFolderName(collectionName);
              setCollectionFolderStatus("connected");
              setCollectionResources(await storage.listCollectionResources());
            } else if (storage.collectionFolderName) {
              setCollectionFolderStatus("permission");
              setCollectionFolderMessage("Reconnect your collection drive to browse shared resources.");
            }
          })
          .catch(() => {})
          .finally(() => {
            setIsReconnecting(false);
          });
      });
    return () => window.removeEventListener("popstate", onPop);
  }, [basePath]);

  useEffect(() => {
    if (isReconnecting && window.localStorage.getItem(HAS_CONNECTED_KEY) === "1") return;
    if (!folderName && !collectionFolderName) {
      const cleanPath = path.split("?")[0].replace(/\/+$/, "") || "/";
      const isAllowedWithoutConnection =
        cleanPath === "/" ||
        cleanPath === "/about" ||
        cleanPath === "/guide";

      if (!isAllowedWithoutConnection) {
        queueMicrotask(() => {
          navigate("/");
        });
      }
    }
  }, [isReconnecting, folderName, collectionFolderName, path, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
        return;
      }
      if (paletteInputRef.current) {
        paletteInputRef.current.focus();
        paletteInputRef.current.select();
        return;
      }
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      setCommandPaletteOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function connectFolder(reconnect = false) {
    try {
      setFolderStatus("connecting");
      const name = reconnect ? await storage.requestStoredPermission() : await storage.connect();
      if (!name) {
        setFolderStatus("permission");
        setFolderMessage("Permission was not granted. Your files remain unchanged.");
        return;
      }
      setFolderName(name);
      setLocalResources(await storage.listResources());
      setFolderStatus("connected");
      setFolderMessage("");
      setHasConnectedBefore(true);
      window.localStorage.setItem(HAS_CONNECTED_KEY, "1");
      notify(`Connected to ${name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setFolderStatus(folderName ? "connected" : "idle");
        return;
      }
      setFolderStatus("error");
      setFolderMessage(error instanceof Error ? error.message : "Could not open that folder.");
    }
  }

  async function disconnectFolder() {
    if (!window.confirm("Disconnect this folder? You can reconnect it later.")) return;
    await storage.disconnect();
    setFolderName(null);
    setFolderStatus("idle");
    setFolderMessage("");
    setLocalResources([]);
    setHasConnectedBefore(false);
    setFavourites(new Set());
    window.localStorage.removeItem(HAS_CONNECTED_KEY);
    notify("Folder disconnected");
    navigate("/");
  }

  async function connectCollectionFolder(reconnect = false) {
    try {
      setCollectionFolderStatus("connecting");
      const name = reconnect
        ? await storage.requestStoredCollectionPermission()
        : await storage.connectCollectionDrive();
      if (!name) {
        setCollectionFolderStatus("permission");
        setCollectionFolderMessage("Permission was not granted. Shared resources remain hidden.");
        return;
      }
      setCollectionFolderName(name);
      setCollectionResources(await storage.listCollectionResources());
      setCollectionFolderStatus("connected");
      setCollectionFolderMessage("");
      notify(`Collection drive connected: ${name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setCollectionFolderStatus(collectionFolderName ? "connected" : "idle");
        return;
      }
      setCollectionFolderStatus("error");
      setCollectionFolderMessage(error instanceof Error ? error.message : "Could not open that folder.");
    }
  }

  async function disconnectCollectionFolder() {
    if (!window.confirm("Disconnect the collection drive? You can reconnect it later.")) return;
    await storage.disconnectCollectionDrive();
    setCollectionFolderName(null);
    setCollectionFolderStatus("idle");
    setCollectionFolderMessage("");
    setCollectionResources([]);
    notify("Collection drive disconnected");
  }

  const route = parseRoute(path);
  const showFullHero =
    route.kind === "home" &&
    !hasConnectedBefore &&
    !folderName &&
    !collectionFolderName &&
    folderStatus !== "connecting";
  let content: ReactNode;

  if (route.kind === "home") {
    content = (
      <Dashboard
        resources={resources}
        search={search}
        setSearch={setSearch}
        searchInputRef={searchInputRef}
        navigate={navigate}
        folderName={folderName}
        folderStatus={folderStatus}
        connectFolder={connectFolder}
        showFullHero={showFullHero}
        favourites={favourites}
        onToggleFavourite={toggleFavourite}
        />
    );
  } else if (route.kind === "forum") {
    content = (
      <ForumPage
        navigate={navigate}
        folderName={folderName}
        folderStatus={folderStatus}
        connectFolder={connectFolder}
        onSubscribe={async (collection) => {
          if (!folderName) {
            notify("Connect a folder to subscribe to forum collections.");
            return;
          }
          try {
            // collection.bundleUrl is a relative path (e.g. /collections/slug.json).
            // Resolve it against the current origin so the stored subscription is
            // an absolute http(s) URL — fetchImportSource rejects relative URLs,
            // which would make Refresh never import the collection's resources.
            const absoluteUrl = new URL(collection.bundleUrl, window.location.origin).href;
            await storage.addSubscription(absoluteUrl, collection.name);
            notify(`Subscribed to “${collection.name}”. Refresh to import its resources.`);
          } catch (error) {
            notify(error instanceof Error ? error.message : "Could not subscribe to this collection.");
          }
        }}
      />
    );
  } else if (route.kind === "library") {
    content = (
      <LibraryView
        key={route.type}
        resources={resources}
        initialType={route.type}
        navigate={navigate}
        folderName={folderName}
        folderStatus={folderStatus}
        connectFolder={connectFolder}
        favourites={favourites}
        onToggleFavourite={toggleFavourite}
      />
    );
  } else if (route.kind === "favourites") {
    content = (
      <FavouritesPage
        resources={resources}
        favourites={favourites}
        onToggleFavourite={toggleFavourite}
        navigate={navigate}
        folderName={folderName}
        folderStatus={folderStatus}
        connectFolder={connectFolder}
      />
    );
  } else if (route.kind === "hidden") {
    content = (
      <HiddenPage
        resources={allResources}
        dismissed={dismissed}
        onToggleDismiss={toggleDismiss}
        navigate={navigate}
        folderName={folderName}
        folderStatus={folderStatus}
        connectFolder={connectFolder}
      />
    );
  } else if (route.kind === "about") {
    content = (
      <AboutMilo
        key={route.section}
        navigate={navigate}
        folderName={folderName}
        folderStatus={folderStatus}
        connectFolder={connectFolder}
        initialSection={route.section}
      />
    );
  } else if (route.kind === "import") {
    content = (
      <ImportPage
        // Remounts (resetting local tab/state) when the deep-link target changes, e.g. clicking
        // the Refresh-files banner's "Review" action while already viewing /import on another tab —
        // simpler than syncing local state to a prop change via an effect.
        key={route.focusSubscriptions ? `subscriptions-${pendingReviewSources.length}` : "default"}
        localResources={localResources}
        folderConnected={Boolean(folderName)}
        notify={notify}
        refresh={refreshResources}
        focusSubscriptions={route.focusSubscriptions}
        pendingReviewSources={pendingReviewSources}
      />
    );
  } else if (route.kind === "share") {
    content = (
      <SharePage
        localResources={localResources}
        folderConnected={Boolean(folderName)}
        notify={notify}
        preselectKey={route.preselectKey}
      />
    );
  } else if (route.kind === "resource") {
    const resource = resources.find(
      (item) =>
        item.source === route.source &&
        item.meta.type === route.type &&
        item.meta.slug === route.slug,
    );
    content = resource ? (
      <ResourceDetail
        resource={resource}
        folderConnected={Boolean(folderName)}
        navigate={navigate}
        notify={notify}
        isFavourite={favourites.has(resourceKey(resource))}
        onToggleFavourite={() => toggleFavourite(resource)}
        onToggleDismiss={() => toggleDismiss(resource)}
        onDelete={async () => {
          await storage.deleteResource(resource.path);
          setLocalResources(await storage.listResources());
          navigate(resourceReturnRoute(route));
          notify("Resource deleted");
        }}
        onImport={async () => {
          const draft: ResourceDraft = {
            ...resource.meta,
            body: resource.body,
            importedFrom: "Collection drive",
            driveType: "main",
          };
          const created = await storage.createResource(draft);
          setLocalResources(await storage.listResources());
          navigate(
            `/resource/local/${created.meta.type}/${created.meta.slug}`,
          );
          notify(`Imported “${created.meta.title}” to main drive`);
        }}
      />
    ) : (
      <NotFound navigate={navigate} />
    );
  } else if (route.kind === "create") {
    content = folderName ? (
      <Editor
        initial={emptyDraft(route.type)}
        folderConnected={Boolean(folderName)}
        navigate={navigate}
        connectFolder={connectFolder}
        notify={notify}
        onSave={async (draft) => {
          const saved = await storage.createResource(draft);
          setLocalResources(await storage.listResources());
          return saved;
        }}
        onDirtyChange={(dirty) => { unsavedChangesRef.current = dirty; }}
      />
    ) : (
      <ConnectFolderPrompt folderStatus={folderStatus} connectFolder={connectFolder} navigate={navigate} />
    );
  } else if (route.kind === "edit") {
    const resource = resources.find(
      (item) =>
        item.source === route.source &&
        item.meta.type === route.type &&
        item.meta.slug === route.slug,
    );
    content = resource ? (
      <Editor
        initial={{ ...resource.meta, body: resource.body }}
        original={resource}
        folderConnected={Boolean(folderName)}
        navigate={navigate}
        connectFolder={connectFolder}
        notify={notify}
        onSave={async (draft, saveAsNew) => {
          const saved =
            isReadOnlySource(resource.source) || saveAsNew
              ? await storage.createResource(draft)
              : await storage.updateResource(resource.path, draft);
          setLocalResources(await storage.listResources());
          return saved;
        }}
        onDirtyChange={(dirty) => { unsavedChangesRef.current = dirty; }}
      />
    ) : (
      <NotFound navigate={navigate} />
    );
  } else {
    content = <NotFound navigate={navigate} />;
  }

  return (
    <div className={`app-shell${showFullHero ? " app-shell--pre-connect" : ""}`}>
      <div className="corporate-rail" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <Sidebar
        path={path}
        mobileOpen={mobileOpen}
        folderName={folderName}
        folderStatus={folderStatus}
        folderMessage={folderMessage}
        localCount={localResources.length}
        collectionFolderName={collectionFolderName}
        collectionFolderStatus={collectionFolderStatus}
        collectionFolderMessage={collectionFolderMessage}
        collectionCount={collectionResources.length}
        favouritesCount={favourites.size}
        dismissedCount={dismissed.size}
        navigate={navigate}
        close={() => setMobileOpen(false)}
        refresh={refreshResources}
        connectFolder={connectFolder}
        disconnectFolder={disconnectFolder}
        connectCollectionFolder={connectCollectionFolder}
        disconnectCollectionFolder={disconnectCollectionFolder}
      />
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <main className="main-frame">
        {updateAvailable && (
          <div className="update-banner" role="status">
            <span>A new version of MILO is available.</span>
            <div className="update-banner-actions">
              <button
                type="button"
                className="update-banner-refresh"
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={14} />
                Refresh
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Dismiss"
                onClick={() => setUpdateAvailable(false)}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        {subscriptionUpdates && (
          <div className="update-banner" role="status">
            <span>
              {subscriptionUpdates.newOrChanged} new/updated{" "}
              {subscriptionUpdates.newOrChanged === 1 ? "resource" : "resources"} available from{" "}
              {subscriptionUpdates.subs} {subscriptionUpdates.subs === 1 ? "subscription" : "subscriptions"}
              {subscriptionUpdates.failed > 0
                ? ` (${subscriptionUpdates.failed} couldn't be reached)`
                : ""}
              .
            </span>
            <div className="update-banner-actions">
              <button
                type="button"
                className="update-banner-refresh"
                onClick={() => {
                  navigate("/import?tab=subscriptions");
                  setSubscriptionUpdates(null);
                }}
              >
                <Link2 size={14} />
                Review
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Dismiss"
                onClick={() => {
                  setSubscriptionUpdates(null);
                  setPendingReviewSources([]);
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        <header className="mobile-header">
          <button
            className="icon-button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={22} />
          </button>
          <BrandMark compact />
          <FolderStatusDot status={folderStatus} />
        </header>
        {content}
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {commandPaletteOpen && (
        <CommandPalette
          resources={resources}
          navigate={navigate}
          onClose={closeCommandPalette}
          inputRef={paletteInputRef}
        />
      )}
      {subscriptionReviewModalOpen && subscriptionUpdates && (
        <SubscriptionReviewModal
          newOrChanged={subscriptionUpdates.newOrChanged}
          onClose={() => {
            setSubscriptionReviewModalOpen(false);
            setPendingReviewSources([]);
          }}
          onNext={() => {
            navigate("/import?tab=subscriptions");
            setSubscriptionReviewModalOpen(false);
            setPendingReviewSources([]);
          }}
        />
      )}
      {newResourcePopup && (
        <NewPublishedResourcePopup
          resource={newResourcePopup}
          onClose={() => setNewResourcePopup(null)}
          onView={() => {
            const url = resourceUrl(newResourcePopup);
            navigate(url);
            setNewResourcePopup(null);
          }}
          onDismiss={() => {
            setDismissed((prev) => new Set(prev).add(resourceKey(newResourcePopup)));
            setNewResourcePopup(null);
          }}
          onHide={() => setNewResourcePopup(null)}
        />
      )}
    </div>
  );
}

function BrandMark({
  compact = false,
  showGlyph = true,
}: {
  compact?: boolean;
  showGlyph?: boolean;
}) {
  return (
    <div className={`brand-mark ${compact ? "brand-mark--compact" : ""}`}>
      {showGlyph && (
        <img
          className="brand-glyph"
          src={`${import.meta.env.BASE_URL}favicon.png`}
          alt=""
          aria-hidden="true"
        />
      )}
      <div className="brand-text">
        <strong>MILO</strong>
        {!compact && (
          <small className="brand-tagline">
            <span>Methods,</span>
            <span>Instructions,</span>
            <span>Learning &amp;</span>
            <span>Operations</span>
          </small>
        )}
      </div>
    </div>
  );
}

function Sidebar({
  path,
  mobileOpen,
  folderName,
  folderStatus,
  folderMessage,
  localCount,
  collectionFolderName,
  collectionFolderStatus,
  collectionFolderMessage,
  collectionCount,
  favouritesCount,
  dismissedCount,
  navigate,
  close,
  refresh,
  connectFolder,
  disconnectFolder,
  connectCollectionFolder,
  disconnectCollectionFolder,
}: {
  path: string;
  mobileOpen: boolean;
  folderName: string | null;
  folderStatus: FolderStatus;
  folderMessage: string;
  localCount: number;
  collectionFolderName: string | null;
  collectionFolderStatus: FolderStatus;
  collectionFolderMessage: string;
  collectionCount: number;
  favouritesCount: number;
  dismissedCount: number;
  navigate: (path: string) => void;
  close: () => void;
  refresh: () => void;
  connectFolder: (reconnect?: boolean) => void;
  disconnectFolder: () => void;
  connectCollectionFolder: (reconnect?: boolean) => void;
  disconnectCollectionFolder: () => void;
}) {
  const items = [
    { label: "All resources", href: "/library", icon: Library },
    { label: "Prompts", href: "/prompts", icon: WandSparkles },
    { label: "Skills", href: "/skills", icon: Sparkles },
    { label: "Tools", href: "/tools", icon: Wrench },
    { label: "Books", href: "/books", icon: BookOpen },
    { label: "Videos", href: "/videos", icon: Video },
    { label: "Conferences", href: "/conferences", icon: CalendarDays },
    { label: "Training", href: "/training", icon: GraduationCap },
    { label: "Articles", href: "/articles", icon: Newspaper },
    { label: "Podcasts", href: "/podcasts", icon: Headphones },
  ];
  return (
    <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
      <button className="mobile-close icon-button" aria-label="Close navigation" onClick={close}>
        <X size={20} />
      </button>
      <BrandMark showGlyph={false} />
      <nav aria-label="Main navigation">
        <button
          className={`nav-item nav-home ${path === "/" ? "nav-item--active" : ""}`}
          onClick={() => navigate("/")}
          aria-current={path === "/" ? "page" : undefined}
        >
          <Home size={18} aria-hidden="true" />
          Home
          {path === "/" && <span className="nav-active-dot" />}
        </button>
        <button
          className={`nav-item nav-discover ${path === "/discover" ? "nav-item--active" : ""}`}
          onClick={() => navigate("/discover")}
          aria-current={path === "/discover" ? "page" : undefined}
        >
          <Globe size={18} aria-hidden="true" />
          Discover
          {path === "/discover" && <span className="nav-active-dot" />}
        </button>
        <button
          className={`nav-item nav-about ${path === "/about" || path.startsWith("/guide") ? "nav-item--active" : ""}`}
          onClick={() => navigate("/about")}
          aria-current={path === "/about" || path.startsWith("/guide") ? "page" : undefined}
        >
          <CircleHelp size={18} aria-hidden="true" />
          About Milo
          {(path === "/about" || path.startsWith("/guide")) && <span className="nav-active-dot" />}
        </button>
        <button
          className={`nav-item nav-favourites ${path === "/favourites" ? "nav-item--active" : ""}`}
          onClick={() => navigate("/favourites")}
          aria-current={path === "/favourites" ? "page" : undefined}
        >
          <Star size={18} aria-hidden="true" />
          Favourites
          {favouritesCount > 0 && <span className="nav-count">{favouritesCount}</span>}
          {path === "/favourites" && <span className="nav-active-dot" />}
        </button>
        <span className="nav-eyebrow">Library</span>
        {items.map(({ label, href, icon: Icon }) => {
          const active =
            path === href || (href !== "/library" && path.startsWith(href));
          return (
            <button
              key={href}
              className={`nav-item ${active ? "nav-item--active" : ""}`}
              onClick={() => navigate(href)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
              {active && <span className="nav-active-dot" />}
            </button>
          );
        })}
      </nav>
      <div className={`folder-mini folder-mini--${folderStatus}`}>
        <span className="folder-mini__eyebrow">Your local shelf</span>
        <div className="folder-mini__heading">
          {folderName ? <FolderCheck size={18} /> : <Folder size={18} />}
          <div>
            <strong>{folderName || "No folder connected"}</strong>
            <small>
              {folderName
                ? `${localCount} local ${localCount === 1 ? "resource" : "resources"}`
                : "Examples only"}
            </small>
          </div>
        </div>
        {folderMessage && <p className="folder-mini__message">{folderMessage}</p>}
        {folderStatus === "unsupported" ? (
          <p className="folder-mini__message">
            Folder access requires desktop Chrome or Edge.
          </p>
        ) : (
          <button
            className="folder-mini__connect"
            disabled={folderStatus === "connecting"}
            onClick={() => connectFolder(folderStatus === "permission")}
          >
            <FolderOpen size={14} />
            {folderConnectLabel(folderStatus, folderName)}
          </button>
        )}
        {folderName && (
          <button className="text-button" onClick={refresh}>
            <RefreshCw size={14} />
            Refresh files
          </button>
        )}
        {folderName && (
          <button className="text-button" onClick={() => navigate("/import")}>
            <UploadCloud size={14} />
            Import from another source
          </button>
        )}
        {folderName && localCount > 0 && (
          <button className="text-button" onClick={() => navigate("/share")}>
            <Link2 size={14} />
            Share resources
          </button>
        )}
        <button
          className={`text-button nav-hidden ${path === "/hidden" ? "nav-item--active" : ""}`}
          onClick={() => navigate("/hidden")}
        >
          <EyeOff size={14} />
          Hidden
          {dismissedCount > 0 && <span className="nav-count">{dismissedCount}</span>}
        </button>
        {folderName && (
          <button className="text-button" onClick={disconnectFolder}>
            <FolderX size={14} />
            Disconnect folder
          </button>
        )}
      </div>
      <div className={`folder-mini ${collectionFolderStatus === "connected" ? "folder-mini--connected" : ""}`}>
        <span className="folder-mini__eyebrow">Collection drive</span>
        <div className="folder-mini__heading">
          {collectionFolderName ? <HardDrive size={18} /> : <Folder size={18} />}
          <div>
            <strong>{collectionFolderName || "Not connected"}</strong>
            <small>
              {collectionFolderName
                ? `${collectionCount} shared ${collectionCount === 1 ? "resource" : "resources"}`
                : "Connect a shared folder"}
            </small>
          </div>
        </div>
        {collectionFolderMessage && <p className="folder-mini__message">{collectionFolderMessage}</p>}
        {collectionFolderStatus === "unsupported" ? null : (
          <button
            className="folder-mini__connect"
            disabled={collectionFolderStatus === "connecting"}
            onClick={() => connectCollectionFolder(collectionFolderStatus === "permission")}
          >
            <HardDrive size={14} />
            {folderConnectLabel(collectionFolderStatus, collectionFolderName)}
          </button>
        )}
        {collectionFolderName && (
          <button className="text-button" onClick={disconnectCollectionFolder}>
            <FolderX size={14} />
            Disconnect collection drive
          </button>
        )}
      </div>
      <p className="privacy-note">
        <span>Private by design</span>
        Your library stays on this device.
      </p>
      <hr className="sct-divider" />
      <div className="sct-group">
        <a
          className="sct-link"
          href="https://tally.so/r/zxNrGM"
          target="_blank"
          rel="noopener noreferrer"
        >
          Feedback / Report Issue
        </a>
        <a
          className="sct-link"
          href="https://squarecircletriangle.co/#/milo"
          target="_blank"
          rel="noopener noreferrer"
        >
          SquareCircleTriangle
        </a>
      </div>
    </aside>
  );
}

function FolderStatusDot({ status }: { status: string }) {
  return (
    <span
      className={`status-dot status-dot--${status}`}
      title={status === "connected" ? "Folder connected" : "No folder connected"}
    />
  );
}

function UnsupportedBrowserNotice() {
  return (
    <div className="folder-unsupported-notice">
      <CircleAlert size={18} aria-hidden="true" />
      <div>
        <strong>Chromium browser required</strong>
        <p>This is only compatible with Chromium browsers such as Chrome, Edge, etc.</p>
      </div>
    </div>
  );
}

function CreateAction({
  label,
  folderName,
  folderStatus,
  connectFolder,
  onCreate,
  variant = "primary",
}: {
  label: string;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
  onCreate: () => void;
  variant?: "primary" | "secondary";
}) {
  const buttonClass = variant === "primary" ? "primary-button" : "secondary-button";
  if (folderName) {
    return (
      <button className={buttonClass} onClick={onCreate}>
        <Plus size={17} />
        {label}
      </button>
    );
  }
  if (folderStatus === "unsupported") {
    return <UnsupportedBrowserNotice />;
  }
  return (
    <button className={buttonClass} onClick={() => connectFolder(folderStatus === "permission")}>
      <FolderOpen size={17} />
      {folderConnectLabel(folderStatus, folderName)}
    </button>
  );
}

function ConnectFolderPrompt({
  folderStatus,
  connectFolder,
  navigate,
}: {
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
  navigate: (path: string) => void;
}) {
  return (
    <div className="page connect-prompt">
      <h1>Connect a local folder to create resources</h1>
      <p>MILO saves new resources straight into a folder on your machine. Connect one to continue.</p>
      {folderStatus === "unsupported" ? (
        <UnsupportedBrowserNotice />
      ) : (
        <button className="primary-button" onClick={() => connectFolder(folderStatus === "permission")}>
          <FolderOpen size={17} />
          {folderConnectLabel(folderStatus, null)}
        </button>
      )}
      <button className="text-button" onClick={() => navigate("/library")}>
        Back to the library
      </button>
    </div>
  );
}

function Dashboard({
  resources,
  search,
  setSearch,
  searchInputRef,
  navigate,
  folderName,
  folderStatus,
  connectFolder,
  showFullHero,
  favourites,
  onToggleFavourite,
}: {
  resources: Resource[];
  search: string;
  setSearch: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  navigate: (path: string) => void;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
  showFullHero: boolean;
  favourites: Set<string>;
  onToggleFavourite: (resource: Resource) => void;
}) {
  const results = useMemo(() => filterResources(resources, search, "all"), [resources, search]);
  const latestResources = useMemo(
    () =>
      [...resources]
        .sort(
          (first, second) =>
            second.meta.createdAt.localeCompare(first.meta.createdAt) ||
            second.meta.updatedAt.localeCompare(first.meta.updatedAt) ||
            (second.fsModifiedMs ?? 0) - (first.fsModifiedMs ?? 0),
        )
        .slice(0, 5),
    [resources],
  );
  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(resourceTypes.map((type) => [type, 0])) as Record<
      ResourceType,
      number
    >;
    for (const resource of resources) counts[resource.meta.type] += 1;
    return counts;
  }, [resources]);
  return (
    <>
      <div className={`hero-split${showFullHero ? " hero-split--full" : ""}`}>
        {showFullHero ? (
          <div className="hero-split-inner hero-split-inner--full">
            <div className="hero-split-content">
              <section className="hero hero--full">
                <div className="hero-copy">
                  <img
                    className="hero-full-media"
                    src={`${import.meta.env.BASE_URL}milo-hero.png`}
                    alt="Milo the black Labrador holding a book"
                  />
                  <span className="eyebrow">What is MILO?</span>
                  <h1>Sharing is caring,<br /><em>knowledge amplified.</em></h1>
                  <p>
                    MILO is a local-first library of prompts, skills, tools, and learning
                    resources for product people: no account, no cloud database. Everything
                    lives as files in a folder you connect, yours alone or one your team already
                    keeps in sync.
                  </p>
                  <div className="trust-cards">
                    <div className="trust-card">
                      <HardDrive size={22} aria-hidden="true" />
                      <strong>Local-First Storage</strong>
                      <p>
                        All your prompts, skills, and tools live as standard files
                        in a folder you choose. No cloud database, no vendor lock-in.
                      </p>
                    </div>
                    <div className="trust-card">
                      <ShieldCheck size={22} aria-hidden="true" />
                      <strong>No Account Required</strong>
                      <p>
                        No sign-up, no account, no login. MILO works entirely on
                        your machine — your data stays yours, always.
                      </p>
                    </div>
                    <div className="trust-card">
                      <Globe size={22} aria-hidden="true" />
                      <strong>Open & Portable</strong>
                      <p>
                        Everything is Markdown and JSON — readable and editable in
                        any text editor. Share via sync or export a bundle.
                      </p>
                    </div>
                  </div>
                  <div className="hero-actions">
                    <CreateAction
                      label="Create a resource"
                      folderName={folderName}
                      folderStatus={folderStatus}
                      connectFolder={connectFolder}
                      onCreate={() => navigate("/create")}
                    />
                  </div>
                </div>
              </section>
          </div>
          </div>
        ) : (
          <div className="hero-split-inner">
            <div className="hero-split-media">
              <img src={`${import.meta.env.BASE_URL}milo-hero.png`} alt="Milo the black Labrador holding a book" />
            </div>

            <div className="hero-split-content">
              <section className="hero">
                <div className="hero-copy">
                  <span className="eyebrow">Your Knowledge Library</span>
                  <h1>Sharing is caring,<br /><em>knowledge amplified.</em></h1>
                  <p>
                    Connect a folder (your own, or one already kept in sync by a shared drive) to
                    build a real library of prompts, skills, tools, and learning resources, stored
                    right on your machine. Just browsing shows only a handful of examples until you do.
                  </p>
                  <div className="hero-actions">
                    <CreateAction
                      label="Create a resource"
                      folderName={folderName}
                      folderStatus={folderStatus}
                      connectFolder={connectFolder}
                      onCreate={() => navigate("/create")}
                    />
                    {folderStatus !== "unsupported" && (
                      <button className="secondary-button" onClick={() => navigate("/import")}>
                        <UploadCloud size={17} />
                        Import resource
                      </button>
                    )}
                    <button
                      className={folderStatus === "unsupported" ? "primary-button" : "secondary-button"}
                      onClick={() => navigate("/library")}
                    >
                      Browse the library
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>
              </section>

              <section className="search-band" aria-label="Search resources">
                <Search size={22} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search MILO…"
                  aria-label="Search MILO"
                />
                <span className="search-band-hint" aria-hidden="true">⌘K</span>
                <span>{search ? `${results.length} found` : `${resources.length} resources`}</span>
              </section>
            </div>
          </div>
        )}
      </div>

      <div className="page dashboard-page">
        {search ? (
          <section className="section-block">
            <SectionHeading eyebrow="Search results" title={`Matching “${search}”`} />
            <ResourceGrid
              resources={results}
              navigate={navigate}
              favourites={favourites}
              onToggleFavourite={onToggleFavourite}
            />
          </section>
        ) : (
          <>
            {(folderName || folderStatus === "unsupported") ? (
              <>
              <section className="section-block">
              <SectionHeading
                eyebrow="Choose your starting point"
                title="What are you looking for?"
                aside="A practical collection, shaped by the people doing the work."
              />
              <div className="category-grid">
                {resourceTypes.map((type, index) => (
                  <button
                    key={type}
                    className={`category-card category-card--${type}`}
                    onClick={() => navigate(routeForType(type))}
                  >
                    <span className="category-number">0{index + 1}</span>
                    <span className="category-icon">{typeIcon(type, 24)}</span>
                    <strong>{pluralTypeLabel(type)}</strong>
                    <span className="category-count">
                      {typeCounts[type]} {typeCounts[type] === 1 ? "resource" : "resources"}
                    </span>
                    <p>{typeDescriptions[type]}</p>
                    <span className="category-link">
                      Explore {pluralTypeLabel(type).toLowerCase()} <ChevronRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="section-block">
              <SectionHeading
                eyebrow="Recently added"
                title="Latest resources"
                aside="The newest additions across your local library, published content, and bundled examples."
              />
              <ResourceGrid
                resources={latestResources}
                navigate={navigate}
                compact
                showCreatedDate
                favourites={favourites}
                onToggleFavourite={onToggleFavourite}
              />
            </section>

          </>
        ) : (
          <GetStartedPanel
            folderName={folderName}
            folderStatus={folderStatus}
            connectFolder={connectFolder}
          />
        )}
      </>
    )}
    </div>
    </>
  );
}

function ForumPage({
  navigate,
  folderName,
  folderStatus,
  connectFolder,
  onSubscribe,
}: {
  navigate: (path: string) => void;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
  onSubscribe: (collection: ForumCollection) => void;
}) {
  const collections = publishedForumCollectionsList;
  const [selectedCollection, setSelectedCollection] = useState<ForumCollection | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [showSubmitInfo, setShowSubmitInfo] = useState(false);

  const subscribedUrls = useMemo(() => new Set(subscriptions.map((s) => s.url)), [subscriptions]);

  useEffect(() => {
    if (!folderName) return;
    let cancelled = false;
    storage
      .listSubscriptions()
      .then((items) => {
        if (!cancelled) setSubscriptions(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [folderName]);

  function isSubscribed(collection: ForumCollection) {
    return subscribedUrls.has(collection.bundleUrl);
  }

  return (
    <>
      <div className="hero-split">
        <div className="hero-split-inner">
          <div className="hero-split-content">
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">Curated collections</span>
                <h1>Discover</h1>
                <p>
                  Curated collections by the MILO team. Subscribe to discover and bring
                  new resources into your personal library.
                </p>
                <div className="hero-actions" style={{ marginTop: 28 }}>
                  {folderName && (
                    <button
                      className="primary-button"
                      onClick={() => navigate("/import?tab=subscriptions")}
                    >
                      <Link2 size={17} />
                      My Subscriptions
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    onClick={() => setShowSubmitInfo(true)}
                  >
                    <UploadCloud size={17} />
                    Submit Your Collection
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      <div className="page dashboard-page">
        {collections.length > 0 ? (
          <section className="section-block">
            <div className="forum-grid">
              {collections.map((collection) => {
                const subscribed = isSubscribed(collection);
                return (
                  <button
                    key={collection.slug}
                    type="button"
                    className="forum-card"
                    onClick={() => setSelectedCollection(collection)}
                  >
                    <h3>{collection.name}</h3>
                    <span className="forum-card-author">by {collection.author}</span>
                    <p>{collection.description}</p>
                    <div className="forum-card-footer">
                      <span className="forum-card-count">{collection.itemCount} resources</span>
                      <button
                        type="button"
                        className={`forum-subscribe-button${subscribed ? " forum-subscribe-button--subscribed" : ""}`}
                        disabled={subscribed}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSubscribe(collection);
                        }}
                      >
                        {subscribed ? <Check size={14} /> : <Plus size={14} />}
                        {subscribed ? "Subscribed" : "Subscribe"}
                      </button>
                    </div>
                    <span className="forum-card-hint">Click for more information</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="section-block">
            <SectionHeading
              eyebrow="Coming soon"
              title="No collections yet"
              aside="Check back later for curated collections from Joseph Hill."
            />
          </section>
        )}
      </div>

      {selectedCollection && (
        <>
          <div className="discover-overlay" onClick={() => setSelectedCollection(null)} />
          <div className="discover-panel discover-panel--open" role="dialog" aria-label={selectedCollection.name}>
            <div className="discover-panel-header">
              <h2>{selectedCollection.name}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setSelectedCollection(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="discover-panel-body">
              <span className="forum-card-author">by {selectedCollection.author}</span>
              <p className="discover-panel-description">{selectedCollection.description}</p>

              {selectedCollection.tags.length > 0 && (
                <div className="discover-panel-tags">
                  {selectedCollection.tags.map((tag) => (
                    <span key={tag} className="discover-panel-tag">{tag}</span>
                  ))}
                </div>
              )}

              {selectedCollection.typeBreakdown && (
                <>
                  <span className="discover-panel-section-title">Resource breakdown</span>
                  <div className="discover-panel-breakdown">
                    {Object.entries(selectedCollection.typeBreakdown).map(([type, count]) => (
                      <div key={type} className="discover-panel-breakdown-item">
                        <div className="discover-panel-breakdown-icon">
                          {typeIcon(type as ResourceType, 16)}
                        </div>
                        <div>
                          <span className="discover-panel-breakdown-label">{pluralTypeLabel(type as ResourceType)}</span>
                          <span className="discover-panel-breakdown-count">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <span className="discover-panel-section-title">Details</span>
              <p className="discover-panel-date">Added {selectedCollection.createdAt}</p>
              <p className="discover-panel-date">{selectedCollection.itemCount} resources total</p>
            </div>
            <div className="discover-panel-footer">
              {(() => {
                const subscribed = isSubscribed(selectedCollection);
                return (
                  <button
                    type="button"
                    className={`forum-subscribe-button${subscribed ? " forum-subscribe-button--subscribed" : ""}`}
                    disabled={subscribed}
                    onClick={() => {
                      onSubscribe(selectedCollection);
                      setSelectedCollection(null);
                    }}
                  >
                    {subscribed ? <Check size={16} /> : <Plus size={16} />}
                    {subscribed ? "Already subscribed" : "Subscribe to this collection"}
                  </button>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {showSubmitInfo && (
        <>
          <div className="discover-overlay" onClick={() => setShowSubmitInfo(false)} />
          <div className="discover-panel discover-panel--open" role="dialog" aria-label="Submit Your Collection">
            <div className="discover-panel-header">
              <h2>Submit Your Collection</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => setShowSubmitInfo(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="discover-panel-body">
              <p className="discover-panel-section-title" style={{ marginBottom: 6, color: "#555852", fontSize: 14, textTransform: "none", letterSpacing: 0 }}>
                Want to share your curated collection with the community? Here&apos;s how:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, margin: "20px 0" }}>
                <div>
                  <strong>Export your bundle</strong> — Go to <em>Share resources</em> in the sidebar, select the resources you want to include, and export a Milo bundle (.json file).
                </div>
                <button
                  type="button"
                  className="navigate-share-button"
                  onClick={() => {
                    navigate("/share");
                    setShowSubmitInfo(false);
                  }}
                >
                  <Link2 size={15} />
                  Go to Share Resources
                </button>
                <div>
                  <strong>Submit the details</strong> — Use the form below to tell us the collection name, description, and bundle file. We&apos;ll review and add it to Discover.
                </div>
              </div>
            </div>
            <div className="discover-panel-footer">
              <button
                type="button"
                className="forum-subscribe-button"
                onClick={() => {
                  window.open("https://tally.so/r/zxNrGM", "_blank", "noopener");
                  setShowSubmitInfo(false);
                }}
                style={{ width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: 14 }}
              >
                <ExternalLink size={16} />
                Open submission form
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SubscriptionReviewModal({
  newOrChanged,
  onClose,
  onNext,
}: {
  newOrChanged: number;
  onClose: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="subscription-review-modal">
      <button
        type="button"
        className="subscription-review-modal-backdrop"
        aria-label="Close review modal"
        onClick={onClose}
      />
      <div className="subscription-review-modal-panel" role="dialog" aria-modal="true" aria-label="Subscription updates available">
        <div className="subscription-review-modal-header">
          <div className="subscription-review-modal-icon-container">
            <Info size={22} />
          </div>
          <div className="subscription-review-modal-header-content">
            <h2>Subscription updates</h2>
            <p>Hey, there are some resources to review.</p>
          </div>
          <button
            type="button"
            className="subscription-review-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="subscription-review-modal-body">
          We found <strong>{newOrChanged}</strong> new or updated {newOrChanged === 1 ? "resource" : "resources"} available from your subscriptions.
        </div>
        <div className="subscription-review-modal-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onNext}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function NewPublishedResourcePopup({
  resource,
  onClose,
  onView,
  onDismiss,
  onHide,
}: {
  resource: Resource;
  onClose: () => void;
  onView: () => void;
  onDismiss: () => void;
  onHide: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="new-resource-popup">
      <button
        type="button"
        className="new-resource-popup-backdrop"
        aria-label="Close pop-up"
        onClick={onHide}
      />
      <div className="new-resource-popup-panel" role="dialog" aria-modal="true" aria-label="New published resource">
        <div className="new-resource-popup-header">
          <span className="new-resource-popup-type-pill">
            {typeIcon(resource.meta.type, 16)}
            {typeLabels[resource.meta.type]}
          </span>
          <button
            type="button"
            className="new-resource-popup-close"
            aria-label="Close"
            onClick={onHide}
          >
            <X size={18} />
          </button>
        </div>
        <div className="new-resource-popup-asset">
          <div className="new-resource-popup-icon-callout">
            {typeIcon(resource.meta.type, 40)}
          </div>
        </div>
        <div className="new-resource-popup-body">
          <span className="eyebrow">New published resource</span>
          <h2>{resource.meta.title}</h2>
          {resource.meta.creator && (
            <p className="new-resource-popup-creator">by {resource.meta.creator}</p>
          )}
          <p>{displaySummary(resource.meta.summary)}</p>
        </div>
        <div className="new-resource-popup-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={onDismiss}
          >
            <EyeOff size={14} />
            Dismiss
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onHide}
          >
            Later
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onView}
          >
            <ExternalLink size={14} />
            View resource
          </button>
        </div>
      </div>
    </div>
  );
}

function CommandPalette({
  resources,
  navigate,
  onClose,
  inputRef,
}: {
  resources: Resource[];
  navigate: (path: string) => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => filterResources(resources, query, "all").slice(0, 8),
    [resources, query],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const goTo = (resource: Resource) => {
    navigate(resourceUrl(resource));
    onClose();
  };

  return (
    <div className="command-palette">
      <button
        type="button"
        className="command-palette-backdrop"
        aria-label="Close search overlay"
        onClick={onClose}
      />
      <div className="command-palette-panel" role="dialog" aria-modal="true" aria-label="Search MILO">
        <div className="command-palette-input-row">
          <Search size={20} aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            className="command-palette-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results.length > 0) goTo(results[0]);
            }}
            placeholder="Search MILO…"
            aria-label="Search MILO"
          />
        </div>
        {query.trim() && results.length === 0 ? (
          <p className="command-palette-empty">No matches for “{query}”</p>
        ) : (
          <ul className="command-palette-results">
            {results.map((resource) => (
              <li className="command-palette-result" key={`${resource.source}-${resource.path}`}>
                <button type="button" onClick={() => goTo(resource)}>
                  <span className="type-pill">
                    {typeIcon(resource.meta.type, 14)}
                    {typeLabels[resource.meta.type]}
                  </span>
                  <strong>{resource.meta.title}</strong>
                  <span>{displaySummary(resource.meta.summary)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GetStartedPanel({
  folderName,
  folderStatus,
  connectFolder,
}: {
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
}) {
  return (
    <section className="intro-panel section-block" aria-label="Get started with MILO">
      <span className="eyebrow">Get started</span>
      <h2 className="intro-panel__title">Connect a folder to build your real library</h2>
      <div className="intro-panel__steps">
        <div className="intro-panel__step">
          <FolderOpen size={20} />
          <strong>Connect a local folder</strong>
          <p>Use your own, or one already kept in sync by a shared drive (OneDrive, Google Drive, Dropbox) your team uses.</p>
        </div>
        <div className="intro-panel__step">
          <Link2 size={20} />
          <strong>Subscribe to shared bundles</strong>
          <p>Once connected, bring in resources someone else is sharing via Import → From URL, straight into your folder.</p>
        </div>
        <div className="intro-panel__step">
          <FolderCheck size={20} />
          <strong>Nothing is uploaded</strong>
          <p>Everything is saved as files on your device. MILO has no server storage of its own.</p>
        </div>
      </div>
      <div className="intro-panel__cta">
        <CreateAction
          label="Create a resource"
          folderName={folderName}
          folderStatus={folderStatus}
          connectFolder={connectFolder}
          onCreate={() => {}}
        />
      </div>
    </section>
  );
}

function AboutMilo({
  navigate,
  folderName,
  folderStatus,
  connectFolder,
  initialSection,
}: {
  navigate: (path: string) => void;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
  initialSection: "philosophy" | "local-folder" | "shared-folder" | "collection-drive" | "loading" | "subscription" | "security";
}) {
  const [section, setSection] = useState<
    "philosophy" | "local-folder" | "shared-folder" | "collection-drive" | "loading" | "subscription" | "security"
  >(initialSection);

  const tabConfigs: Record<
    "philosophy" | "local-folder" | "shared-folder" | "collection-drive" | "loading" | "subscription" | "security",
    {
      key: "philosophy" | "local-folder" | "shared-folder" | "collection-drive" | "loading" | "subscription" | "security";
      tabLabel: string;
      eyebrow: string;
      introTitle: string;
      introParagraph: string;
      pillars: Array<{
        icon: React.ComponentType<{ size: number; "aria-hidden"?: string | boolean }>;
        title: string;
        copy: string;
      }>;
    }
  > = {
    philosophy: {
      key: "philosophy",
      tabLabel: "Philosophy",
      eyebrow: "Why Milo works this way",
      introTitle: "Your knowledge lives on your machine. Full stop.",
      introParagraph:
        "MILO is a resource hub with no backend of its own. Prompts, skills, tools, and the rest of your library are plain Markdown and JSON files, saved wherever you point it, so the same folder that holds your resources also determines who can see them and how they move around.",
      pillars: [
        {
          icon: HardDrive,
          title: "Local-first",
          copy: "Everything you save lives as a file on your own device (your folder, your rules). MILO has no server storage of its own, so there's nothing to migrate off later.",
        },
        {
          icon: ShieldCheck,
          title: "Secure sharing, no gatekeeping",
          copy: "Share through a drive you already trust (OneDrive, Google Drive, Dropbox), or export an explicit bundle link. No central server ever holds your content, and no review step stands between you and publishing.",
        },
        {
          icon: Pencil,
          title: "Build your own collection",
          copy: "The library that ships with MILO is a starting point, not a rulebook. Fork it, edit it, or start from a blank folder. It's yours to shape.",
        },
      ],
    },
    "local-folder": {
      key: "local-folder",
      tabLabel: "Local Folder",
      eyebrow: "Local Storage",
      introTitle: "Direct filesystem access",
      introParagraph:
        "MILO connects directly to a folder on your computer's local drive using the modern File System Access API. All your resources are stored as simple files you can open, edit, or back up using any standard text editor or tool.",
      pillars: [
        {
          icon: FolderOpen,
          title: "Directory structure",
          copy: "Markdown resources (prompt, skill, tool) are saved as individual files under prompts/, skills/, and tools/ subdirectories. Collection resources (like books, articles, and videos) live inside type-specific JSON files in the root folder.",
        },
        {
          icon: FolderCheck,
          title: "Auto-reconnect",
          copy: "The folder handle is stored securely in your browser's IndexedDB. When you return, MILO automatically attempts to reconnect, asking only for your quick browser permission to re-access the files.",
        },
        {
          icon: Pencil,
          title: "External edits",
          copy: "Since everything is a plain text file, you can edit your resources outside of MILO using VS Code, Obsidian, or notepad. Simply hit 'Refresh files' in the sidebar to sync the app's view.",
        },
      ],
    },
    "shared-folder": {
      key: "shared-folder",
      tabLabel: "Shared Folder URL",
      eyebrow: "URL Sharing",
      introTitle: "Export and import bundles",
      introParagraph:
        "While MILO doesn't use a central database, you can easily share groups of resources with other users. You can bundle your chosen resources and export them, producing a shared JSON file that others can import directly or host online to share via URL.",
      pillars: [
        {
          icon: Folder,
          title: "Sharing via Shared Drive",
          copy: "If your local folder is synced via a cloud service (like OneDrive, Google Drive, or Dropbox), sharing is automatic. Anyone else connected to that same shared folder will see updates once their drive client syncs.",
        },
        {
          icon: Link2,
          title: "Bundle Files",
          copy: "For sharing outside a shared drive, use the 'Share resources' page. You can select items to export, and MILO generates a downloaded bundle JSON file. You can send this file to anyone directly, or host it somewhere to share it as a link.",
        },
        {
          icon: Download,
          title: "Importing Files or URLs",
          copy: "Recipients can go to the 'Import' page, choose 'From a file' to upload the JSON bundle directly, or choose 'From a URL' and paste the hosted link to load the resources.",
        },
      ],
    },
    "collection-drive": {
      key: "collection-drive",
      tabLabel: "Collection Drive",
      eyebrow: "Two Drives, One Library",
      introTitle: "Your personal shelf meets a shared collection",
      introParagraph:
        "MILO lets you connect two drives at once: your personal folder for your own resources, and a separate collection drive &mdash; a shared read-only folder from your team or community. Resources from both drives appear together in your library, so you can browse the shared collection and decide what to bring into your personal shelf.",
      pillars: [
        {
          icon: HardDrive,
          title: "Personal Drive",
          copy: "Your own folder where you save, edit, and organise your resources. Full read-write access &mdash; everything here is yours to shape and keep.",
        },
        {
          icon: FolderOpen,
          title: "Collection Drive",
          copy: "A separate read-only folder shared by a group, team, or community. Anyone with access can browse its resources, but no one edits the originals by mistake. It stays in sync as the maintainer adds new content.",
        },
        {
          icon: Download,
          title: "Import to Personal",
          copy: "Found a resource in the shared collection you want to keep? Import it into your personal drive with a single click. The original stays in the collection; your copy is yours to edit and customise.",
        },
      ],
    },
    loading: {
      key: "loading",
      tabLabel: "Loading",
      eyebrow: "Data Merging",
      introTitle: "How resources are loaded",
      introParagraph:
        "MILO combines resources from multiple layers at runtime to build your toolshelf. This approach lets you keep your personal resources separate from built-in templates.",
      pillars: [
        {
          icon: Library,
          title: "Three Sources",
          copy: "MILO merges three types of content: example resources (built-in templates), published resources (the common library compiled into the application), and local resources (your personal connected folder).",
        },
        {
          icon: BookOpen,
          title: "Merge & Precedence",
          copy: "If a local resource has the same identifier (type and slug) as a published or example resource, the local version takes precedence. You can customize any built-in resource by saving an edited version to your local folder.",
        },
        {
          icon: RefreshCw,
          title: "Fast Scanning",
          copy: "At startup, MILO scans your connected folder. Click 'Refresh files' to reload the folder from your drive, update subscriptions, and clear any cached content.",
        },
      ],
    },
    subscription: {
      key: "subscription",
      tabLabel: "Subscription",
      eyebrow: "Stay in sync",
      introTitle: "Follow bundle updates",
      introParagraph:
        "Subscriptions let you follow shared resource bundles over time. By subscribing to a bundle URL, you can check for updates and pull in new resources without manually re-importing.",
      pillars: [
        {
          icon: Link2,
          title: "Save Bundle URLs",
          copy: "If there is a bundle URL you import from regularly, you can save it as a subscription. Go to the 'Import' page under the 'Subscriptions' tab to manage your followed URLs.",
        },
        {
          icon: RefreshCw,
          title: "Periodic Checks",
          copy: "Whenever you click 'Refresh files', MILO automatically checks all subscribed URLs in the background to see if the authors have added or updated any resources.",
        },
        {
          icon: Check,
          title: "Review First",
          copy: "Nothing is imported automatically. If MILO finds updates, it flags them for review, letting you choose exactly which resources to import or ignore.",
        },
      ],
    },
    security: {
      key: "security",
      tabLabel: "Security",
      eyebrow: "Safe & Secure",
      introTitle: "Safe local storage and clean JSON validation",
      introParagraph:
        "MILO is designed with a defense-in-depth approach to keep your local data safe. Because all your resources and collection data are saved locally on your device as plain files (JSON and Markdown), MILO uses strict schema parsing, secure link checking, and sanitization to make sure everything you load and preview is secure.",
      pillars: [
        {
          icon: ShieldCheck,
          title: "Schema Validation",
          copy: "All local JSON collections (books, articles, videos) and imported bundles are validated against strict schema rules. Unrecognized envelopes or items with missing required fields are immediately rejected.",
        },
        {
          icon: Link2,
          title: "Safe Links",
          copy: "External link fields (toolUrl) are checked against potential security risks. MILO strictly forbids dangerous URL schemes like javascript: or data:, rendering only standard safe HTTP/HTTPS links.",
        },
        {
          icon: FileText,
          title: "XSS Protection",
          copy: "To protect you from cross-site scripting (XSS), Markdown bodies and summaries are fully sanitized during rendering. Event handlers (like onclick) and inline script tags are stripped before they are displayed.",
        },
      ],
    },
  };

  const activeTab = tabConfigs[section];

  return (
    <>
      <div className="hero-split">
        <div className="hero-split-inner">
          <div className="hero-split-content">
            <PageTop
              eyebrow="About Milo"
              title="About Milo"
              description="Here's some additional information about MILO, its workings, and some insights."
            />
          </div>
        </div>
      </div>

      <div className="page about-page">
        <div className="segmented about-subnav" role="tablist" aria-label="About Milo sections">
          {(["philosophy", "local-folder", "shared-folder", "collection-drive", "loading", "subscription", "security"] as const).map(
            (sec) => (
              <button
                key={sec}
                role="tab"
                aria-selected={section === sec}
                className={section === sec ? "is-active" : ""}
                onClick={() => setSection(sec)}
              >
                {tabConfigs[sec].tabLabel}
                <ChevronRight size={14} className="about-subnav-chevron" aria-hidden="true" />
              </button>
            ),
          )}
        </div>
        <AboutTabContent
          eyebrow={activeTab.eyebrow}
          introTitle={activeTab.introTitle}
          introParagraph={activeTab.introParagraph}
          pillars={activeTab.pillars}
        />
      </div>
    </>
  );
}

function AboutTabContent({
  eyebrow,
  introTitle,
  introParagraph,
  pillars,
}: {
  eyebrow: string;
  introTitle: string;
  introParagraph: string;
  pillars: Array<{
    icon: React.ComponentType<{ size: number; "aria-hidden"?: string | boolean }>;
    title: string;
    copy: string;
  }>;
}) {
  return (
    <>
      <section className="philosophy-intro">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{introTitle}</h2>
        <p>{introParagraph}</p>
      </section>
      <div className="philosophy-pillars">
        {pillars.map(({ icon: Icon, title, copy }) => (
          <article className="philosophy-pillar" key={title}>
            <div className="philosophy-pillar__icon">
              <Icon size={22} aria-hidden="true" />
            </div>
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </div>
    </>
  );
}

interface ImportCandidate {
  key: string;
  resource: Resource;
  existing: Resource | null;
  status: "new" | "changed";
}

/**
 * Compares two resources for equivalence, ignoring metadata fields that are purely local
 * or tracking-related (like `importedFrom`).
 */
function areResourcesEquivalent(a: Resource, b: Resource): boolean {
  if (a.body.trim() !== b.body.trim()) return false;

  const keys = new Set<keyof ResourceMeta>([
    ...(Object.keys(a.meta) as Array<keyof ResourceMeta>),
    ...(Object.keys(b.meta) as Array<keyof ResourceMeta>),
  ]);

  for (const key of keys) {
    if (key === "importedFrom" || (key as string) === "body") continue;
    const valA = a.meta[key];
    const valB = b.meta[key];

    if (Array.isArray(valA) && Array.isArray(valB)) {
      if (valA.length !== valB.length) return false;
      for (let i = 0; i < valA.length; i++) {
        if (valA[i] !== valB[i]) return false;
      }
    } else {
      const normA = valA === undefined || valA === null ? "" : valA;
      const normB = valB === undefined || valB === null ? "" : valB;
      if (normA !== normB) return false;
    }
  }

  return true;
}

/**
 * Diffs a fetched/read set of resources against the local library by `type:slug`, classifying
 * each as new or changed and dropping anything byte-identical to what's already there. Shared
 * by the folder/url/file Import tabs and the subscriptions "Check now" flow, so every source
 * of incoming resources gets the same review-before-write behavior.
 */
function buildImportCandidates(resources: Resource[], localByKey: Map<string, Resource>): ImportCandidate[] {
  return resources
    .map((resource) => {
      const key = `${resource.meta.type}:${resource.meta.slug}`;
      const existing = localByKey.get(key) || null;
      return { key, resource, existing, status: existing ? "changed" : "new" } as ImportCandidate;
    })
    .filter((candidate) => !candidate.existing || !areResourcesEquivalent(candidate.existing, candidate.resource));
}

const importSourceOptions: Array<{
  key: "folder" | "url" | "file" | "subscriptions";
  icon: ReactNode;
  label: string;
  description: string;
  actionTitle: string;
  aside?: string;
}> = [
  {
    key: "folder",
    icon: <FolderOpen size={18} />,
    label: "From a folder",
    description: "Pull resources from another folder you can pick on this device.",
    actionTitle: "Choose a folder to import from",
  },
  {
    key: "url",
    icon: <Link2 size={18} />,
    label: "From a URL",
    description: "Load a bundle someone shared with you as a link.",
    actionTitle: "Load a bundle from a link",
  },
  {
    key: "file",
    icon: <FileText size={18} />,
    label: "From a file",
    description: "Import a bundle file already saved on this device.",
    actionTitle: "Choose a bundle file to import",
  },
  {
    key: "subscriptions",
    icon: <RefreshCw size={18} />,
    label: "Subscriptions",
    description: "Bundles you're following — check them for new or changed resources.",
    actionTitle: "Manage your subscriptions",
    aside: "Saved bundle URLs that Refresh files re-checks. Nothing is added without your review.",
  },
];

function ImportPage({
  localResources,
  folderConnected,
  notify,
  refresh,
  focusSubscriptions,
  pendingReviewSources,
}: {
  localResources: Resource[];
  folderConnected: boolean;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
  focusSubscriptions?: boolean;
  pendingReviewSources?: ImportSource[];
}) {
  const [tab, setTab] = useState<"folder" | "url" | "file" | "subscriptions">(() =>
    (pendingReviewSources && pendingReviewSources.length > 0) || focusSubscriptions
      ? "subscriptions"
      : "folder",
  );
  const [source, setSource] = useState<ImportSource | null>(() =>
    pendingReviewSources && pendingReviewSources.length > 0 ? pendingReviewSources[0] : null,
  );
  const [picking, setPicking] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionSectionRef = useRef<HTMLElement>(null);
  // Candidates are selected by default; this tracks explicit opt-outs instead of mirroring
  // `candidates` in state, so there's no need to sync selection via an effect.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscribing, setSubscribing] = useState(false);
  const [checkingUrl, setCheckingUrl] = useState<string | null>(null);

  // Not memoized: reloaded imperatively from event handlers (subscribe/unsubscribe/check now)
  // rather than as an effect dependency, so it's just a plain async helper, recreated each render.
  async function loadSubscriptions() {
    if (!folderConnected) return;
    try {
      setSubscriptions(await storage.listSubscriptions());
    } catch {
      // Best-effort — the source picker/import flow above still works without a subscriptions list.
    }
  }

  useEffect(() => {
    if (!folderConnected) return;
    let cancelled = false;
    storage
      .listSubscriptions()
      .then((items) => {
        if (!cancelled) setSubscriptions(items);
      })
      .catch(() => {
        // Best-effort — the source picker/import flow above still works without a subscriptions list.
      });
    return () => {
      cancelled = true;
    };
  }, [folderConnected]);

  const isUrlSubscribed = tab === "url" && subscriptions.some((item) => item.url === url.trim());

  const localByKey = useMemo(() => {
    const map = new Map<string, Resource>();
    for (const item of localResources) map.set(`${item.meta.type}:${item.meta.slug}`, item);
    return map;
  }, [localResources]);

  const candidates = useMemo<ImportCandidate[]>(() => {
    if (!source) return [];
    return buildImportCandidates(source.resources, localByKey);
  }, [source, localByKey]);

  const selectedCount = candidates.filter((candidate) => !deselected.has(candidate.key)).length;
  const newCount = candidates.filter((candidate) => candidate.status === "new").length;
  const changedCount = candidates.length - newCount;
  const currentStep = !source ? 1 : importing ? 3 : 2;
  const activeOption = importSourceOptions.find((option) => option.key === tab) ?? importSourceOptions[0];

  function switchTab(next: "folder" | "url" | "file" | "subscriptions") {
    if (next === tab) return;
    setTab(next);
    setSource(null);
    setError("");
    setDeselected(new Set());
    setUrl("");
    actionSectionRef.current?.focus({ preventScroll: true });
    actionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function choose() {
    setError("");
    setPicking(true);
    try {
      const picked = await pickImportSource();
      setSource(picked);
      setDeselected(new Set());
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Could not open that folder.");
      }
    } finally {
      setPicking(false);
    }
  }

  async function loadFromUrl() {
    if (!url.trim()) return;
    setError("");
    setFetching(true);
    try {
      const picked = await fetchImportSource(url.trim());
      setSource(picked);
      setDeselected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that URL.");
    } finally {
      setFetching(false);
    }
  }

  async function subscribeToUrl() {
    if (!source || !url.trim()) return;
    setSubscribing(true);
    setError("");
    try {
      await storage.addSubscription(url.trim(), source.name);
      await loadSubscriptions();
      notify(`Subscribed to “${source.name}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this subscription.");
    } finally {
      setSubscribing(false);
    }
  }

  async function checkSubscriptionNow(subscription: Subscription) {
    setCheckingUrl(subscription.url);
    setError("");
    const result = await checkSubscription(subscription);
    await storage.recordSubscriptionChecks([
      result.ok
        ? {
            url: subscription.url,
            ok: true,
            resourceCount: result.source.resources.length,
            name: result.source.name,
          }
        : { url: subscription.url, ok: false, error: result.error },
    ]);
    await loadSubscriptions();
    setCheckingUrl(null);
    if (result.ok) {
      setTab("subscriptions");
      setSource(result.source);
      setDeselected(new Set());
    } else {
      setError(`Could not check “${subscription.name}”: ${result.error}`);
    }
  }

  async function unsubscribe(subscription: Subscription) {
    await storage.removeSubscription(subscription.url);
    await loadSubscriptions();
    notify(`Unsubscribed from “${subscription.name}”.`);
  }

  async function loadFromFile(file: File) {
    setError("");
    setReading(true);
    try {
      const picked = await readImportFile(file);
      setSource(picked);
      setDeselected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setReading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) loadFromFile(file);
  }

  function toggle(key: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function confirmImport() {
    const chosen = candidates.filter((candidate) => !deselected.has(candidate.key));
    if (!chosen.length) return;
    setImporting(true);
    setError("");
    let succeeded = 0;
    const failed: string[] = [];
    for (const candidate of chosen) {
      const draft: ResourceDraft = {
        ...candidate.resource.meta,
        body: candidate.resource.body,
        importedFrom: source?.name,
      };
      try {
        if (candidate.existing) {
          await storage.updateResource(candidate.existing.path, draft);
        } else {
          await storage.createResource(draft);
        }
        succeeded += 1;
      } catch {
        failed.push(candidate.resource.meta.title);
      }
    }
    await refresh();
    setImporting(false);
    if (failed.length) {
      setError(`Imported ${succeeded}, but couldn't import: ${failed.join(", ")}.`);
    } else {
      notify(`Imported ${succeeded} ${succeeded === 1 ? "resource" : "resources"} from “${source?.name}”.`);
      setSource(null);
    }
  }

  return (
    <>
      <div className="hero-split">
        <div className="hero-split-inner">
          <div className="hero-split-content">
            <PageTop
              eyebrow="Bring resources over"
              title="Import resources"
              description="Bring in new or changed resources from another folder, or from a bundle URL or file someone shared with you. Nothing already there is removed, and identical items are skipped automatically."
            />
            <div className="import-trust-notice">
              <CircleAlert size={18} aria-hidden="true" />
              <div>
                <strong>Only import from sources you trust</strong>
                <p>
                  Anything you bring in (titles, summaries, links, and prompt or skill instructions) is
                  added to your library as-is and shown to anyone who opens this folder. Skim what you&apos;re
                  about to import before you confirm, especially from a URL you weren&apos;t expecting.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="page import-page">
        {!folderConnected ? (
          <p className="import-page__notice">Connect a folder first, then come back here to import into it.</p>
        ) : (
          <>
            <section className="section-block">
              <SectionHeading
                eyebrow="Choose a source"
                title="Select your source location"
                aside="Folder, URL, or file — pick where you're bringing resources in from."
              />
              <div className="import-source-grid">
                {importSourceOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`import-source-card${tab === option.key ? " is-active" : ""}`}
                    onClick={() => switchTab(option.key)}
                  >
                    <span className="import-source-card__icon">{option.icon}</span>
                    <span className="import-source-card__text">
                      <strong>{option.label}</strong>
                      <p>{option.description}</p>
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section
              className="section-block import-source-action"
              ref={actionSectionRef}
              tabIndex={-1}
              aria-label={activeOption.actionTitle}
            >
              <SectionHeading
                eyebrow={activeOption.label}
                title={activeOption.actionTitle}
                aside={activeOption.aside}
              />
              <div className="import-source-panel">
                {tab === "folder" ? (
                  <button
                    className="secondary-button import-page__primary-action"
                    disabled={picking}
                    onClick={choose}
                  >
                    <FolderOpen size={16} />
                    {picking ? "Opening…" : "Choose folder to import from"}
                  </button>
                ) : tab === "url" ? (
                  <div className="import-url-row">
                    <input
                      type="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://example.com/bundle.json"
                    />
                    <button
                      className="secondary-button import-page__primary-action"
                      disabled={fetching || !url.trim()}
                      onClick={loadFromUrl}
                    >
                      <UploadCloud size={16} />
                      {fetching ? "Loading…" : "Load bundle"}
                    </button>
                  </div>
                ) : tab === "file" ? (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json,.json"
                      style={{ display: "none" }}
                      onChange={handleFileInputChange}
                    />
                    <button
                      type="button"
                      className="secondary-button import-page__primary-action"
                      disabled={reading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud size={16} />
                      {reading ? "Reading…" : "Choose bundle file to import"}
                    </button>
                  </>
                ) : subscriptions.length === 0 ? (
                  <p className="import-page__notice">
                    Load a bundle from the URL tab, then choose “Subscribe to this URL” to start tracking it here.
                  </p>
                ) : (
                  <ul className="import-subscription-list">
                    {subscriptions.map((subscription) => {
                      const preloaded = pendingReviewSources?.find((s) => s.url === subscription.url);
                      const preloadedUpdateCount = preloaded
                        ? buildImportCandidates(preloaded.resources, localByKey).length
                        : 0;

                      return (
                        <li key={subscription.url}>
                          <div className="import-subscription-body">
                            <strong>
                              {subscription.name}
                              {preloadedUpdateCount > 0 && (
                                <span className="subscription-update-badge">
                                  {preloadedUpdateCount} update{preloadedUpdateCount === 1 ? "" : "s"}
                                </span>
                              )}
                            </strong>
                            <p className="import-subscription-url">{subscription.url}</p>
                            <p className="import-subscription-meta">
                              {subscription.lastCheckedAt
                                ? `Last checked ${formatDate(subscription.lastCheckedAt.slice(0, 10))}${
                                    subscription.lastCheckedOk === false ? " — couldn't be reached" : ""
                                  }`
                                : "Never checked"}
                            </p>
                          </div>
                          <div className="import-subscription-actions">
                            <button
                              type="button"
                              className={preloadedUpdateCount > 0 ? "primary-button" : "secondary-button"}
                              disabled={checkingUrl === subscription.url}
                              onClick={() => {
                                if (preloaded) {
                                  setSource(preloaded);
                                  setDeselected(new Set());
                                } else {
                                  checkSubscriptionNow(subscription);
                                }
                              }}
                            >
                              {preloadedUpdateCount > 0 ? <Check size={14} /> : <RefreshCw size={14} />}
                              {checkingUrl === subscription.url
                                ? "Checking…"
                                : preloadedUpdateCount > 0
                                ? "Review"
                                : "Check now"}
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Remove subscription to ${subscription.name}`}
                              onClick={() => unsubscribe(subscription)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {error && <p className="import-page__notice import-page__notice--error">{error}</p>}
              </div>
            </section>
            {source && (
              <section className="section-block">
                <SectionHeading
                  eyebrow={`From “${source.name}”`}
                  title={
                    candidates.length
                      ? `${candidates.length} ${candidates.length === 1 ? "resource" : "resources"} to review`
                      : "Nothing new to import"
                  }
                  aside={
                    candidates.length
                      ? `${[newCount && `${newCount} new`, changedCount && `${changedCount} changed`]
                          .filter(Boolean)
                          .join(", ")}. Items identical to what's already in your connected folder are left out automatically.`
                      : "Items identical to what's already in your connected folder are left out automatically."
                  }
                />
                {tab === "url" && (
                  <button
                    type="button"
                    className="secondary-button import-page__subscribe-action"
                    disabled={subscribing || isUrlSubscribed}
                    onClick={subscribeToUrl}
                  >
                    <Link2 size={16} />
                    {isUrlSubscribed ? "Subscribed" : subscribing ? "Subscribing…" : "Subscribe to this URL"}
                  </button>
                )}
                {source.skipped && source.skipped.length > 0 && (
                  <p className="import-page__notice import-page__notice--warning">
                    Skipped {source.skipped.length} {source.skipped.length === 1 ? "item" : "items"} that could
                    not be read: {source.skipped.map((item) => item.error).join(" ")}
                  </p>
                )}
                {candidates.length > 0 && (
                  <>
                    <ul className="import-candidate-list">
                      {candidates.map((candidate) => (
                        <li key={candidate.key}>
                          <label>
                            <input
                              type="checkbox"
                              checked={!deselected.has(candidate.key)}
                              onChange={() => toggle(candidate.key)}
                            />
                            <div className="import-candidate-body">
                              <div className="import-candidate-row">
                                <span className="type-pill">
                                  {typeIcon(candidate.resource.meta.type, 14)}{" "}
                                  {typeLabels[candidate.resource.meta.type]}
                                </span>
                                <strong>{candidate.resource.meta.title}</strong>
                                <span
                                  className={`source-pill source-pill--${
                                    candidate.status === "new" ? "local" : "published"
                                  }`}
                                >
                                  {candidate.status === "new" ? "New" : "Changed"}
                                </span>
                              </div>
                              {(candidate.resource.meta.summary || candidate.resource.meta.author) && (
                                <p className="import-candidate-meta">
                                  {displaySummary(candidate.resource.meta.summary)}
                                  {candidate.resource.meta.author && (
                                    <span className="import-candidate-author">
                                      {candidate.resource.meta.summary ? " · " : ""}
                                      {candidate.resource.meta.author}
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <button
                      className="primary-button"
                      disabled={importing || selectedCount === 0}
                      onClick={confirmImport}
                    >
                      <UploadCloud size={16} />
                      {importing ? "Importing…" : `Import ${selectedCount} selected`}
                    </button>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SharePage({
  localResources,
  folderConnected,
  notify,
  preselectKey,
}: {
  localResources: Resource[];
  folderConnected: boolean;
  notify: (message: string) => void;
  preselectKey?: string;
}) {
  const preselectValid = Boolean(preselectKey) && localResources.some((item) => resourceKey(item) === preselectKey);

  const [deselected, setDeselected] = useState<Set<string>>(() => {
    if (!preselectValid) return new Set();
    return new Set(
      localResources.map((item) => resourceKey(item)).filter((key) => key !== preselectKey),
    );
  });
  const [bundleName, setBundleName] = useState("");
  const [query, setQuery] = useState("");
  const [restrictToPreselect, setRestrictToPreselect] = useState(preselectValid);

  const selected = useMemo(
    () => localResources.filter((item) => !deselected.has(`${item.meta.type}:${item.meta.slug}`)),
    [localResources, deselected],
  );

  const visible = useMemo(() => {
    if (restrictToPreselect) return localResources.filter((item) => resourceKey(item) === preselectKey);
    return filterResources(localResources, query, "all");
  }, [localResources, query, restrictToPreselect, preselectKey]);

  function toggle(key: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setDeselected(new Set());
    setRestrictToPreselect(false);
  }

  function deselectAll() {
    setDeselected(new Set(localResources.map((item) => `${item.meta.type}:${item.meta.slug}`)));
    setRestrictToPreselect(false);
  }

  function download() {
    downloadBundle(selected, bundleName.trim() || undefined);
    notify(`Downloaded a bundle with ${selected.length} ${selected.length === 1 ? "resource" : "resources"}.`);
  }

  return (
    <div className="page import-page">
      <PageTop
        eyebrow="Share a curated set"
        title="Share resources"
        description="Pick resources from your folder and download them as a bundle file. Host that file somewhere with open cross-origin access (a raw GitHub file or a public gist's raw URL both work), then share the URL: the recipient can load it under Import → From URL and choose what to bring into their own collection."
      />
      {!folderConnected || localResources.length === 0 ? (
        <p className="import-page__notice">Connect a folder with at least one resource first.</p>
      ) : (
        <>
          <div className="share-page__toolbar">
            <label className="share-page__name-field">
              Bundle name (optional)
              <input
                value={bundleName}
                onChange={(event) => setBundleName(event.target.value)}
                placeholder="e.g. Onboarding starter pack"
              />
            </label>
            <label className="share-page__search-field">
              Search your resources
              <span className="share-page__search-input">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setRestrictToPreselect(false);
                  }}
                  placeholder="Search title, summary, author, or tag"
                />
              </span>
            </label>
          </div>
          <div className="share-page__selection-row">
            <span className="share-page__selection-count">
              {selected.length} of {localResources.length} selected
            </span>
            <div className="share-page__selection-actions">
              <button type="button" className="text-button" onClick={selectAll} disabled={selected.length === localResources.length}>
                Select all
              </button>
              <button type="button" className="text-button" onClick={deselectAll} disabled={selected.length === 0}>
                Deselect all
              </button>
              <button
                className="primary-button share-page__inline-button"
                disabled={selected.length === 0}
                onClick={download}
              >
                <Download size={14} />
                {`${selected.length > 0 ? `Download bundle (${selected.length})` : "Download bundle"}`}
              </button>
            </div>
          </div>
          {restrictToPreselect && (
            <p className="import-page__notice">
              Showing just this resource.{" "}
              <button type="button" className="text-button" onClick={() => setRestrictToPreselect(false)}>
                Show your whole library
              </button>{" "}
              to add more.
            </p>
          )}
          {visible.length === 0 ? (
            <p className="import-page__notice">No resources match your search.</p>
          ) : (
            <ul className="import-candidate-list">
              {visible.map((item) => {
                const key = `${item.meta.type}:${item.meta.slug}`;
                return (
                  <li key={key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!deselected.has(key)}
                        onChange={() => toggle(key)}
                      />
                      <span className="type-pill">
                        {typeIcon(item.meta.type, 14)} {typeLabels[item.meta.type]}
                      </span>
                      <strong>{item.meta.title}</strong>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            className="primary-button import-page__primary-action"
            disabled={selected.length === 0}
            onClick={download}
          >
            <Download size={16} />
            {`Download bundle (${selected.length})`}
          </button>
        </>
      )}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  aside,
}: {
  eyebrow: string;
  title: string;
  aside?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {aside && <p>{aside}</p>}
    </div>
  );
}

function LibraryView({
  resources,
  initialType,
  navigate,
  folderName,
  folderStatus,
  connectFolder,
  favourites,
  onToggleFavourite,
}: {
  resources: Resource[];
  initialType: ResourceType | "all";
  navigate: (path: string) => void;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
  favourites: Set<string>;
  onToggleFavourite: (resource: Resource) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ResourceType | "all">(initialType);
  const [source, setSource] = useState<"all" | "local" | "published" | "example">("all");
  const [drive, setDrive] = useState<"all" | "main" | "collection">("all");
  const filtered = useMemo(
    () => filterResources(resources, query, type).filter((item) => {
      if (source !== "all" && item.source !== source) return false;
      if (drive !== "all" && (item.meta.driveType || "main") !== drive) return false;
      return true;
    }),
    [resources, query, type, source, drive],
  );
  return (
    <div className="page library-page">
      <PageTop
        eyebrow="Knowledge, ready when you are"
        title={type === "all" ? "Your Library of Resources" : `${typeLabels[type]} library`}
        description={
          type === "all"
            ? "Browse the shared examples and everything saved in your local folder."
            : typeDescriptions[type]
        }
        action={
          <CreateAction
            label="Create new"
            folderName={folderName}
            folderStatus={folderStatus}
            connectFolder={connectFolder}
            onCreate={() => navigate(`/create?type=${type === "all" ? "prompt" : type}`)}
          />
        }
      />
      {(type === "prompt" || type === "skill") && <LibraryUsageTldr type={type} />}
      <div className="library-toolbar">
        <label className="library-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, summary, author, or tag"
          />
        </label>
        <div className="segmented" aria-label="Filter by type">
          {(["all", ...resourceTypes] as const).map((option) => (
            <button
              key={option}
              className={type === option ? "is-active" : ""}
              onClick={() => setType(option)}
            >
              {option === "all" ? "All" : pluralTypeLabel(option)}
            </button>
          ))}
        </div>
        <select
          value={source}
          onChange={(event) => setSource(event.target.value as typeof source)}
          aria-label="Filter by source"
        >
          <option value="all">All sources</option>
          <option value="local">My folder</option>
          <option value="published">Published</option>
          <option value="example">Examples</option>
        </select>
        <select
          value={drive}
          onChange={(event) => setDrive(event.target.value as typeof drive)}
          aria-label="Filter by drive"
        >
          <option value="all">All drives</option>
          <option value="main">Main drive</option>
          <option value="collection">Collection drive</option>
        </select>
      </div>
      <div className="result-summary">
        <strong>{filtered.length}</strong> {filtered.length === 1 ? "resource" : "resources"}
      </div>
      <ResourceGrid
        resources={filtered}
        navigate={navigate}
        favourites={favourites}
        onToggleFavourite={onToggleFavourite}
      />
      {!filtered.length && (
        <div className="empty-state">
          <Search size={30} />
          <h2>Nothing matched that search</h2>
          <p>Try a broader term or clear one of the filters.</p>
          <button className="secondary-button" onClick={() => { setQuery(""); setType("all"); setSource("all"); setDrive("all"); }}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

function FavouritesPage({
  resources,
  favourites,
  onToggleFavourite,
  navigate,
  folderName,
  folderStatus,
  connectFolder,
}: {
  resources: Resource[];
  favourites: Set<string>;
  onToggleFavourite: (resource: Resource) => void;
  navigate: (path: string) => void;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
}) {
  const favouriteResources = useMemo(
    () => resources.filter((resource) => favourites.has(resourceKey(resource))),
    [resources, favourites],
  );
  return (
    <>
      <div className="hero-split">
        <div className="hero-split-inner">
          <div className="hero-split-content">
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">Saved for later</span>
                <h1>Your favourites</h1>
                <p>
                  Resources you&apos;ve starred in this browser, saved inside your connected folder for only you to see.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
      <div className="page library-page">
        {!folderName ? (
          <div className="empty-state">
            <Star size={30} />
            <h2>Connect a folder to use favourites</h2>
            <p>Favourites are saved as a small file inside your connected folder, so connect one to start starring resources.</p>
            {folderStatus === "unsupported" ? (
              <UnsupportedBrowserNotice />
            ) : (
              <button className="primary-button" onClick={() => connectFolder(folderStatus === "permission")}>
                <FolderOpen size={17} />
                {folderConnectLabel(folderStatus, null)}
              </button>
            )}
          </div>
        ) : favouriteResources.length ? (
          <>
            <div className="result-summary">
              <strong>{favouriteResources.length}</strong>{" "}
              {favouriteResources.length === 1 ? "favourite" : "favourites"}
            </div>
            <ResourceGrid
              resources={favouriteResources}
              navigate={navigate}
              favourites={favourites}
              onToggleFavourite={onToggleFavourite}
            />
          </>
        ) : (
          <div className="empty-state">
            <Star size={30} />
            <h2>No favourites yet</h2>
            <p>Star a resource from its card or detail page to save it here.</p>
            <button className="secondary-button" onClick={() => navigate("/library")}>
              Browse the library
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function HiddenPage({
  resources,
  dismissed,
  onToggleDismiss,
  navigate,
  folderName,
  folderStatus,
  connectFolder,
}: {
  resources: Resource[];
  dismissed: Set<string>;
  onToggleDismiss: (resource: Resource) => void;
  navigate: (path: string) => void;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
}) {
  const hiddenResources = useMemo(
    () => resources.filter((resource) => dismissed.has(resourceKey(resource))),
    [resources, dismissed],
  );
  return (
    <>
      <div className="hero-split">
        <div className="hero-split-inner">
          <div className="hero-split-media">
            <img src={`${import.meta.env.BASE_URL}milo-hero.png`} alt="Milo the black Labrador holding a book" />
          </div>
          <div className="hero-split-content">
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">Hidden from view</span>
                <h1>Dismissed resources</h1>
                <p>
                  Resources you&apos;ve hidden from your library. Restore them to make them visible again.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
      <div className="page library-page">
        {!folderName ? (
          <div className="empty-state">
            <EyeOff size={30} />
            <h2>Connect a folder to dismiss resources</h2>
            <p>Dismissed resources are tracked in a small file inside your connected folder, so connect one to start hiding resources.</p>
            {folderStatus === "unsupported" ? (
              <UnsupportedBrowserNotice />
            ) : (
              <button className="primary-button" onClick={() => connectFolder(folderStatus === "permission")}>
                <FolderOpen size={17} />
                {folderConnectLabel(folderStatus, null)}
              </button>
            )}
          </div>
        ) : hiddenResources.length ? (
          <>
            <div className="result-summary">
              <strong>{hiddenResources.length}</strong>{" "}
              {hiddenResources.length === 1 ? "hidden resource" : "hidden resources"}
            </div>
            <div className="resource-grid">
              {hiddenResources.map((resource) => {
                const key = resourceKey(resource);
                return (
                  <article
                    className={`resource-card resource-card--${resource.meta.type}`}
                    key={`${resource.source}-${resource.path}`}
                  >
                    <button
                      className="card-hit"
                      aria-label={`Open ${resource.meta.title}`}
                      onClick={() => navigate(resourceUrl(resource))}
                    />
                    <div className="resource-card__top">
                      <span className="type-pill">
                        {typeIcon(resource.meta.type, 14)}
                        {typeLabels[resource.meta.type]}
                      </span>
                      <div className="resource-card__badges">
                        <span className={`source-pill source-pill--${resource.source}`}>
                          {sourcePillLabel(resource.source)}
                        </span>
                        {resource.meta.driveType === "collection" && (
                          <span className="source-pill source-pill--collection" title="This resource lives on the collection drive">
                            Collection
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="resource-card__body">
                      <h3>{resource.meta.title}</h3>
                      {resource.meta.creator && (
                        <span className="resource-card__creator">by {resource.meta.creator}</span>
                      )}
                      <p>{resource.meta.summary}</p>
                    </div>
                    <div className="resource-card__actions">
                      <button
                        className="secondary-button"
                        onClick={() => onToggleDismiss(resource)}
                      >
                        <EyeOff size={14} /> Restore
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <EyeOff size={30} />
            <h2>No hidden resources</h2>
            <p>Dismissed resources will appear here. Dismiss a published resource from its detail page.</p>
            <button className="secondary-button" onClick={() => navigate("/library")}>
              Browse the library
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function LibraryUsageTldr({ type }: { type: "prompt" | "skill" }) {
  const isPrompt = type === "prompt";
  const steps = isPrompt
    ? [
        ["Choose a prompt", "Open a prompt and select Copy prompt."],
        ["Paste it into your AI", "Start a new conversation and paste the copied prompt."],
        ["Add your context", "Replace placeholders, include relevant material, then review the result."],
      ]
    : [
        ["Choose a skill", "Open a skill, then copy it or download its Markdown file."],
        ["Give it to your AI", "Paste the skill into the conversation or attach the downloaded file."],
        ["Add your task", "Ask the AI to follow the skill, include your context, and review the result."],
      ];

  return (
    <section
      className={`library-tldr library-tldr--${type}`}
      aria-labelledby={`${type}-tldr-title`}
    >
      <div className="library-tldr__intro">
        <span className="eyebrow">How to use {isPrompt ? "prompts" : "skills"}</span>
        <h2 id={`${type}-tldr-title`}>
          {isPrompt
            ? "Start with a stronger instruction, then make it yours."
            : "Give your AI a repeatable way of working."}
        </h2>
        <p>
          {isPrompt
            ? "A prompt gives your AI a clear task, role, and output format. Add the context only you know before sending it."
            : "A skill is a reusable set of instructions. Add it to your AI’s context, then provide the task and any relevant material."}
        </p>
      </div>
      <ol>
        {steps.map(([title, copy], index) => (
          <li key={title}>
            <span>{index + 1}</span>
            <div>
              <strong>{title}</strong>
              <p>{copy}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ResourceGrid({
  resources,
  navigate,
  compact = false,
  showCreatedDate = false,
  favourites,
  onToggleFavourite,
}: {
  resources: Resource[];
  navigate: (path: string) => void;
  compact?: boolean;
  showCreatedDate?: boolean;
  favourites: Set<string>;
  onToggleFavourite: (resource: Resource) => void;
}) {
  return (
    <div className={`resource-grid ${compact ? "resource-grid--compact" : ""}`}>
      {resources.map((resource) => {
        const isFavourite = favourites.has(resourceKey(resource));
        return (
        <article
          className={`resource-card resource-card--${resource.meta.type}`}
          key={`${resource.source}-${resource.path}`}
        >
          <button
            className="card-hit"
            aria-label={`Open ${resource.meta.title}`}
            onClick={() => navigate(resourceUrl(resource))}
          />
          <div className="resource-card__top">
            <span className="type-pill">
              {typeIcon(resource.meta.type, 14)}
              {typeLabels[resource.meta.type]}
            </span>
            <div className="resource-card__badges">
              <span className={`source-pill source-pill--${resource.source}`}>
                {sourcePillLabel(resource.source)}
              </span>
              {resource.meta.importedFrom && (
                <span className="source-pill source-pill--imported" title={`Imported from "${resource.meta.importedFrom}"`}>
                  Imported
                </span>
              )}
              {resource.meta.driveType && resource.meta.driveType === "collection" && (
                <span className="source-pill source-pill--collection" title="This resource lives on the collection drive">
                  Collection
                </span>
              )}
              <button
                className={`favourite-toggle ${isFavourite ? "favourite-toggle--active" : ""}`}
                aria-label={isFavourite ? `Remove ${resource.meta.title} from favourites` : `Add ${resource.meta.title} to favourites`}
                aria-pressed={isFavourite}
                onClick={() => onToggleFavourite(resource)}
              >
                <Star size={15} />
              </button>
            </div>
          </div>
          <h3>{resource.meta.title}</h3>
          <p>{displaySummary(resource.meta.summary)}</p>
          <div className="tag-row">
            {resource.meta.tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="resource-card__footer">
            <span>
              {showCreatedDate
                ? `Added ${formatDate(resource.meta.createdAt)}`
                : resource.meta.creator || resource.meta.author}
            </span>
            <ChevronRight size={17} />
          </div>
        </article>
        );
      })}
    </div>
  );
}

function PageTop({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-top">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function ResourceDetail({
  resource,
  folderConnected,
  navigate,
  notify,
  isFavourite,
  onToggleFavourite,
  onToggleDismiss,
  onDelete,
  onImport,
}: {
  resource: Resource;
  folderConnected: boolean;
  navigate: (path: string) => void;
  notify: (message: string) => void;
  isFavourite: boolean;
  onToggleFavourite: () => void;
  onToggleDismiss: () => void;
  onDelete: () => Promise<void>;
  onImport?: () => Promise<void>;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [importing, setImporting] = useState(false);
  async function copy(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    notify(message);
  }
  return (
    <div className="page detail-page">
      <button className="back-button" onClick={() => navigate(routeForType(resource.meta.type))}>
        <ArrowLeft size={16} />
        Back to {pluralTypeLabel(resource.meta.type).toLowerCase()}
      </button>
      <header className={`detail-hero detail-hero--${resource.meta.type}`}>
        <div>
          <div className="detail-kicker">
            <span className="type-pill">
              {typeIcon(resource.meta.type, 14)} {typeLabels[resource.meta.type]}
            </span>
            <span className={`source-pill source-pill--${resource.source}`}>
              {sourceDetailLabel(resource.source)}
            </span>
            {resource.meta.importedFrom && (
              <span className="source-pill source-pill--imported">
                {`Imported from "${resource.meta.importedFrom}"`}
              </span>
            )}
            {resource.meta.driveType === "collection" && (
              <span className="source-pill source-pill--collection" title="This resource lives on the collection drive">
                Collection
              </span>
            )}
          </div>
          <h1>{resource.meta.title}</h1>
          <p>{displaySummary(resource.meta.summary)}</p>
          <div className="detail-byline">
            <span className="avatar">{initials(resource.meta.author)}</span>
            <span>
              <strong>{resource.meta.author}</strong>
              Updated {formatDate(resource.meta.updatedAt)}
            </span>
          </div>
        </div>
        <div className="detail-actions">
          <button
            className={`secondary-button favourite-toggle-detail ${isFavourite ? "favourite-toggle-detail--active" : ""}`}
            disabled={!folderConnected}
            title={!folderConnected ? "Connect a folder to save favourites" : undefined}
            aria-pressed={isFavourite}
            onClick={onToggleFavourite}
          >
            <Star size={16} />
            {isFavourite ? "Favourited" : "Favourite"}
          </button>
          {(isCollectionType(resource.meta.type) || resource.meta.type === "tool") &&
            resource.meta.toolUrl && (
            <a
              className="primary-button detail-primary-link"
              href={resource.meta.toolUrl}
              target="_blank"
              rel="noreferrer"
            >
              {typeIcon(resource.meta.type, 17)}
              {externalActionLabel(resource.meta.type)}
              <ExternalLink size={14} />
            </a>
            )}
          {(resource.meta.type === "prompt" ||
            resource.meta.type === "skill" ||
            isCollectionType(resource.meta.type)) && (
            <button
              className={isCollectionType(resource.meta.type) ? "secondary-button" : "primary-button"}
              onClick={() =>
                resource.meta.type === "prompt"
                  ? copy(extractPromptText(resource.body), "Prompt copied")
                  : resource.meta.type === "skill"
                    ? copy(markdownToPlainText(resource.body), "Skill copied")
                  : copy(resource.raw, "JSON copied")
              }
            >
              <Copy size={16} />{" "}
              {resource.meta.type === "prompt"
                ? "Copy prompt"
                : resource.meta.type === "skill"
                  ? "Copy skill"
                  : "Copy details"}
            </button>
          )}
          {resource.meta.type === "skill" && (
            <button
              className="secondary-button"
              onClick={() => downloadMarkdown(resource.raw, `${resource.meta.slug}.md`)}
            >
              <Download size={16} /> Download skill
            </button>
          )}
          <button
            className="secondary-button"
            disabled={!folderConnected && isReadOnlySource(resource.source)}
            title={!folderConnected && isReadOnlySource(resource.source) ? "Connect a folder to save your own copy" : undefined}
            onClick={() => navigate(`${resourceUrl(resource)}/edit`)}
          >
            <Pencil size={16} />
            {resource.source === "example" ? "Use this example" : "Edit"}
          </button>
          {resource.source === "local" && (
            <button
              className="secondary-button"
              onClick={() => navigate(`/share?resource=${encodeURIComponent(resourceKey(resource))}`)}
            >
              <Link2 size={16} />
              Share this resource
            </button>
          )}
          {resource.meta.driveType === "collection" && (
            <button
              className="primary-button"
              disabled={!folderConnected || importing}
              title={
                !folderConnected
                  ? "Connect a folder to import resources"
                  : importing
                    ? "Importing..."
                    : undefined
              }
              onClick={async () => {
                if (!onImport) return;
                setImporting(true);
                try {
                  await onImport();
                } finally {
                  setImporting(false);
                }
              }}
            >
              <Download size={16} />
              {importing ? "Importing..." : "Import to main drive"}
            </button>
          )}
        </div>
      </header>
      <div className="detail-layout">
        <article
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(resource.body) }}
        />
        <aside className="detail-aside">
          <div>
            <span className="aside-label">Tags</span>
            <div className="tag-row">
              {resource.meta.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </div>
          <div>
            <span className="aside-label">File</span>
            <code>{resource.path}</code>
          </div>
          {resource.meta.creator && (
            <div>
              <span className="aside-label">
                {creatorLabel(resource.meta.type)}
              </span>
              <strong>{resource.meta.creator}</strong>
            </div>
          )}
          {resource.meta.eventDate && (
            <div>
              <span className="aside-label">Event date</span>
              <strong>{formatDate(resource.meta.eventDate)}</strong>
            </div>
          )}
          {resource.meta.location && (
            <div>
              <span className="aside-label">Location</span>
              <strong>{resource.meta.location}</strong>
            </div>
          )}
          {resource.meta.type === "conference" && resource.meta.attended && (
            <div>
              <span className="aside-label">Attended</span>
              <strong>{resource.meta.attended === "yes" ? "Yes" : "No"}</strong>
            </div>
          )}
          {resource.meta.type === "conference" &&
            resource.meta.attended === "yes" &&
            resource.meta.whoAttended && (
              <div>
                <span className="aside-label">Who attended</span>
                <strong>{resource.meta.whoAttended}</strong>
              </div>
            )}
          {resource.source === "local" && (
            confirmingDelete ? (
              <div className="delete-confirm">
                <p>
                  {isCollectionType(resource.meta.type)
                    ? `Remove this item from ${collectionFiles[resource.meta.type]}?`
                    : "Delete this local file?"}
                </p>
                <div className="delete-confirm-actions">
                  <button className="delete-confirm-yes" onClick={onDelete}>Yes, delete</button>
                  <button className="delete-confirm-cancel" onClick={() => setConfirmingDelete(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="delete-button" onClick={() => setConfirmingDelete(true)}>
                <Trash2 size={14} /> Delete resource
              </button>
            )
          )}
          {resource.source !== "local" && (
            <button
              className="secondary-button dismiss-button"
              onClick={onToggleDismiss}
              title="Hide this resource from your library"
            >
              <X size={14} /> Dismiss
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

type BodySection = {
  title: string;
  help: string;
  placeholder: string;
  rows?: number;
};

function bodySections(type: ResourceType): BodySection[] {
  if (type === "prompt") {
    return [
      {
        title: "When to use this",
        help: "Explain the situation where this prompt is most useful.",
        placeholder: "Use this when…",
      },
      {
        title: "Prompt",
        help: "Write the instruction that will be copied into the AI.",
        placeholder: "You are a…\n\nYour task is to…\n\nReturn the result as…",
        rows: 14,
      },
    ];
  }
  if (type === "skill") {
    return [
      {
        title: "Purpose",
        help: "Describe the repeatable capability this skill provides.",
        placeholder: "This skill helps the AI to…",
      },
      {
        title: "Steps",
        help: "List the process the AI should follow.",
        placeholder: "1. Start with…\n2. Check…\n3. Produce…",
        rows: 10,
      },
      {
        title: "Quality bar",
        help: "Describe what a strong result should include.",
        placeholder: "A strong result should…",
      },
    ];
  }
  if (type === "tool") {
    return [
      {
        title: "What it helps with",
        help: "Explain the problem this tool helps solve.",
        placeholder: "This tool is useful when…",
      },
      {
        title: "Suggested workflow",
        help: "Give people a simple way to get started.",
        placeholder: "1. Open the tool.\n2. Prepare…\n3. Review…",
        rows: 9,
      },
    ];
  }
  const firstSection: Partial<Record<ResourceType, string>> = {
    book: "Why it is worth reading",
    video: "Why it is worth watching",
    conference: "Why it is worth attending",
    training: "Why it is useful",
    article: "Why it is worth reading",
    podcast: "Why it is worth listening",
  };
  const finalSection: Partial<Record<ResourceType, string>> = {
    book: "Key takeaway",
    video: "Key takeaway",
    conference: "What to expect",
    training: "What you will learn",
    article: "Key takeaway",
    podcast: "Key takeaway",
  };
  return [
    {
      title: firstSection[type] || "Why it is useful",
      help: `Explain why this ${type} is worth someone’s time.`,
      placeholder: `This ${type} is useful because…`,
    },
    {
      title: "Best for",
      help: "Describe who will get the most value from it.",
      placeholder: "Product managers who…",
    },
    {
      title: finalSection[type] || "Key takeaway",
      help: "Share the most useful idea or lesson.",
      placeholder: "The idea that stayed with me was…",
    },
  ];
}

function readStandardBody(body: string, type: ResourceType) {
  const definitions = bodySections(type);
  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  if (
    headings.length !== definitions.length ||
    headings.some((heading, index) => heading[1].trim() !== definitions[index].title)
  ) {
    return null;
  }

  return headings.map((heading, index) => {
    const start = (heading.index || 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    return body.slice(start, end).trim();
  });
}

function writeStandardBody(type: ResourceType, sections: string[]) {
  return bodySections(type)
    .map((section, index) => `## ${section.title}\n\n${sections[index]?.trim() || ""}`)
    .join("\n\n");
}

function Editor({
  initial,
  original,
  folderConnected,
  navigate,
  connectFolder,
  notify,
  onSave,
  onDirtyChange,
}: {
  initial: ResourceDraft;
  original?: Resource;
  folderConnected: boolean;
  navigate: (path: string) => void;
  connectFolder: (reconnect?: boolean) => void;
  notify: (message: string) => void;
  onSave: (draft: ResourceDraft, saveAsNew: boolean) => Promise<Resource>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [tagInput, setTagInput] = useState(initial.tags.join(", "));
  const [activePane, setActivePane] = useState<"easy" | "advanced" | "preview">(
    () => (readStandardBody(initial.body, initial.type) ? "easy" : "advanced"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const isExample = original?.source === "example";
  const isPublished = original?.source === "published";
  const isReadOnlyOriginal = isExample || isPublished;
  const errors = validateResource(draft);
  const parsedEasySections = readStandardBody(draft.body, draft.type);
  const [easySections, setEasySections] = useState<string[] | null>(() =>
    readStandardBody(initial.body, initial.type),
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    onDirtyChange?.(dirty);
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      onDirtyChange?.(false);
    };
  }, [dirty, onDirtyChange]);

  function update<K extends keyof ResourceDraft>(key: K, value: ResourceDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value, updatedAt: today }));
    setDirty(true);
  }

  function updateType(type: ResourceType) {
    const bodyIsStarter = resourceTypes.some(
      (resourceType) => draft.body === starterBody(resourceType),
    );
    const nextBody = bodyIsStarter ? starterBody(type) : draft.body;
    setDraft((current) => ({
      ...current,
      type,
      body: nextBody,
      ...(type === "conference" && !current.attended ? { attended: "no" as const } : {}),
      updatedAt: today,
    }));
    setEasySections(readStandardBody(nextBody, type));
    setActivePane(bodyIsStarter ? "easy" : "advanced");
    setDirty(true);
  }

  function updateEasySection(index: number, value: string) {
    if (!easySections) return;
    const nextSections = [...easySections];
    nextSections[index] = value;
    setEasySections(nextSections);
    update("body", writeStandardBody(draft.type, nextSections));
  }

  async function submit(event: FormEvent, saveAsNew = false) {
    event.preventDefault();
    const current = {
      ...draft,
      tags: tagInput.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    const validation = validateResource(current);
    if (validation.length) {
      setError(validation[0]);
      return;
    }
    if (!folderConnected) {
      setError("Connect a local folder before saving.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const saved = await onSave(current, saveAsNew || isReadOnlyOriginal);
      setDirty(false);
      onDirtyChange?.(false);
      notify(isReadOnlyOriginal || saveAsNew ? "Saved to your local folder" : "Changes saved");
      navigate(resourceUrl(saved));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this resource.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-page">
      <header className="editor-topbar">
        <button
          className="back-button"
          onClick={() => navigate(original ? resourceUrl(original) : "/")}
        >
          <ArrowLeft size={16} />
          {original ? "Back to resource" : "Back home"}
        </button>
        <div className="save-state">
          <span className={dirty ? "save-state__dirty" : "save-state__saved"} />
          {dirty ? "Unsaved changes" : original ? "No changes" : "New resource"}
        </div>
      </header>
      <form className="editor-shell" onSubmit={submit}>
        <aside className="editor-meta">
          <span className="eyebrow">
            {isExample ? "Make it yours" : isPublished ? "Add your own copy" : original ? "Edit resource" : "New resource"}
          </span>
          <h1>{isReadOnlyOriginal ? "Save a local copy" : original ? "Refine your resource" : "Add to MILO"}</h1>
          <p>
            {isExample
              ? "Adapt this example and save it into your own folder."
              : isPublished
                ? "This resource comes from the published library. Save your own copy into your folder to edit it."
                : "Clear metadata makes useful work much easier to find later."}
          </p>
          <fieldset className="type-selector">
            <legend>Resource type</legend>
            {resourceTypes.map((type) => (
              <button
                type="button"
                key={type}
                className={draft.type === type ? "is-active" : ""}
                onClick={() => updateType(type)}
              >
                {typeIcon(type, 16)}
                {typeLabels[type]}
              </button>
            ))}
          </fieldset>
          <label>
            Title
            <input
              value={draft.title}
              onChange={(event) => {
                update("title", event.target.value);
                if (!original || isReadOnlyOriginal) update("slug", slugify(event.target.value));
              }}
              placeholder="e.g. Launch brief reviewer"
            />
          </label>
          <label>
            Summary
            <textarea
              value={draft.summary}
              onChange={(event) => update("summary", event.target.value.slice(0, 200))}
              placeholder="One sentence explaining when this is useful"
              maxLength={200}
              rows={3}
            />
            <span className="form-hint">{draft.summary.length}/200</span>
          </label>
          <label>
            {isCollectionType(draft.type) ? "Added by" : "Author"}
            <input
              value={draft.author}
              onChange={(event) => update("author", event.target.value)}
              placeholder="Your name"
            />
          </label>
          {isCollectionType(draft.type) && (
            <label>
              {creatorLabel(draft.type)}
              <input
                value={draft.creator || ""}
                onChange={(event) => update("creator", event.target.value)}
                placeholder={creatorPlaceholder(draft.type)}
              />
            </label>
          )}
          <label>
            Tags
            <input
              value={tagInput}
              onChange={(event) => {
                setTagInput(event.target.value);
                update("tags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean));
              }}
              placeholder="Discovery, Strategy, Research"
            />
            <small>Separate tags with commas</small>
          </label>
          {(draft.type === "tool" || isCollectionType(draft.type)) && (
            <label>
              {linkLabel(draft.type)}{" "}
              {draft.type === "tool" && <span>Optional</span>}
              <input
                type="url"
                value={draft.toolUrl || ""}
                onChange={(event) => update("toolUrl", event.target.value)}
                placeholder="https://"
              />
            </label>
          )}
          {draft.type === "conference" && (
            <>
              <label>
                Event date <span>Optional</span>
                <input
                  type="date"
                  value={draft.eventDate || ""}
                  onChange={(event) => update("eventDate", event.target.value)}
                />
              </label>
              <label>
                Location <span>Optional</span>
                <input
                  value={draft.location || ""}
                  onChange={(event) => update("location", event.target.value)}
                  placeholder="e.g. Berlin · Hybrid"
                />
              </label>
              <label>
                Attended?
                <select
                  value={draft.attended || "no"}
                  onChange={(event) => {
                    const attended = event.target.value as "yes" | "no";
                    setDraft((current) => ({
                      ...current,
                      attended,
                      whoAttended: attended === "no" ? "" : current.whoAttended,
                      updatedAt: today,
                    }));
                    setDirty(true);
                  }}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              {draft.attended === "yes" && (
                <label>
                  Who attended?
                  <input
                    value={draft.whoAttended || ""}
                    onChange={(event) => update("whoAttended", event.target.value)}
                    placeholder="Add names, separated by commas"
                  />
                </label>
              )}
            </>
          )}
          <label>
            {isCollectionType(draft.type) ? "Item slug" : "Filename"}
            <div className="filename-input">
              <input
                value={draft.slug}
                onChange={(event) => update("slug", slugify(event.target.value))}
                placeholder="resource-name"
              />
              {!isCollectionType(draft.type) && <span>.md</span>}
            </div>
          </label>
          <div className="file-location">
            <Folder size={15} />
            {isCollectionType(draft.type)
              ? `${collectionFiles[draft.type]} → ${draft.slug || "resource-name"}`
              : `${draft.type}s/${draft.slug || "resource-name"}.md`}
          </div>
        </aside>
        <section className="editor-workspace">
          <div className="editor-tabs">
            <button
              type="button"
              className={activePane === "easy" ? "is-active" : ""}
              disabled={!parsedEasySections}
              title={!parsedEasySections ? "Restore the standard section headings to use Easy mode." : undefined}
              onClick={() => {
                setEasySections(parsedEasySections);
                setActivePane("easy");
              }}
            >
              <FileText size={15} /> Easy form
            </button>
            <button
              type="button"
              className={activePane === "advanced" ? "is-active" : ""}
              onClick={() => setActivePane("advanced")}
            >
              <Pencil size={15} /> Advanced Markdown
            </button>
            <button
              type="button"
              className={activePane === "preview" ? "is-active" : ""}
              onClick={() => setActivePane("preview")}
            >
              <BookOpen size={15} /> Preview
            </button>
            <span>{activePane === "easy" ? "Guided editing" : "Markdown supported"}</span>
          </div>
          <div className={`editor-pane editor-pane--${activePane}`}>
            {activePane === "easy" && easySections && (
              <div className="easy-editor">
                <div className="easy-editor__intro">
                  <span className="eyebrow">Easy mode</span>
                  <h2>Fill in the content, one section at a time.</h2>
                  <p>MILO keeps the required headings and assembles the Markdown for you.</p>
                </div>
                {bodySections(draft.type).map((section, index) => (
                  <label className="easy-field" key={section.title}>
                    <span>{section.title}</span>
                    <small>{section.help}</small>
                    <textarea
                      value={easySections[index]}
                      onChange={(event) => updateEasySection(index, event.target.value)}
                      placeholder={section.placeholder}
                      rows={section.rows || 6}
                    />
                  </label>
                ))}
              </div>
            )}
            {activePane === "advanced" && (
              <div className="advanced-editor">
                <div className="advanced-warning">
                  <CircleAlert size={18} />
                  <div>
                    <strong>Keep the predefined section headings</strong>
                    <p>
                      Removing or renaming the <code>##</code> headings can disable Easy mode
                      and resource-specific actions such as Copy prompt.
                    </p>
                  </div>
                </div>
                <textarea
                  className="markdown-editor"
                  aria-label="Markdown content"
                  value={draft.body}
                  onChange={(event) => update("body", event.target.value)}
                  spellCheck="true"
                />
              </div>
            )}
            {activePane === "preview" && (
              <article
                className="markdown-body markdown-preview"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body) }}
              />
            )}
          </div>
          <footer className="editor-footer">
            <div>
              {error ? (
                <span className="form-error"><CircleAlert size={15} /> {error}</span>
              ) : errors.length ? (
                <span className="form-hint">{errors[0]}</span>
              ) : (
                <span className="form-ready"><Check size={15} /> Ready to save</span>
              )}
            </div>
            <div className="editor-footer__actions">
              {!folderConnected && (
                <button type="button" className="secondary-button" onClick={() => connectFolder(false)}>
                  <FolderOpen size={16} /> Connect folder
                </button>
              )}
              {original?.source === "local" && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving || errors.length > 0}
                  onClick={(event) => submit(event as unknown as FormEvent, true)}
                >
                  Save as new
                </button>
              )}
              <button
                type="submit"
                className="primary-button"
                disabled={saving || errors.length > 0}
              >
                {saving ? "Saving…" : isReadOnlyOriginal ? "Save local copy" : original ? "Save changes" : "Create resource"}
              </button>
            </div>
          </footer>
        </section>
      </form>
    </div>
  );
}

function NotFound({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="page not-found">
      <span>404</span>
      <h1>That shelf is empty.</h1>
      <p>The resource may have moved or been removed from your local folder.</p>
      <button className="primary-button" onClick={() => navigate("/library")}>
        Return to the library
      </button>
    </div>
  );
}

function resourceUrl(resource: Resource) {
  return `/resource/${resource.source}/${resource.meta.type}/${resource.meta.slug}`;
}

function filterResources(
  resources: Resource[],
  query: string,
  type: ResourceType | "all",
) {
  const normalized = query.toLowerCase().trim();
  return resources.filter((resource) => {
    if (type !== "all" && resource.meta.type !== type) return false;
    if (!normalized) return true;
    return [
      resource.meta.title,
      resource.meta.summary,
      resource.meta.author,
      resource.meta.creator || "",
      resource.meta.whoAttended || "",
      ...resource.meta.tags,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

function parseRoute(path: string):
  | { kind: "home" }
  | { kind: "forum" }
  | { kind: "about"; section: "philosophy" | "local-folder" | "shared-folder" | "collection-drive" | "loading" | "subscription" | "security" }
  | { kind: "import"; focusSubscriptions?: boolean }
  | { kind: "share"; preselectKey?: string }
  | { kind: "favourites" }
  | { kind: "hidden" }
  | { kind: "library"; type: ResourceType | "all" }
  | { kind: "resource"; source: "local" | "published" | "example"; type: ResourceType; slug: string }
  | { kind: "edit"; source: "local" | "published" | "example"; type: ResourceType; slug: string }
  | { kind: "create"; type: ResourceType }
  | { kind: "not-found" } {
  const [pathname, queryString = ""] = path.split("?");
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  if (cleanPath === "/") return { kind: "home" };
  if (cleanPath === "/discover") return { kind: "forum" };
  if (cleanPath === "/about") {
    const params = new URLSearchParams(queryString);
    const sec = params.get("section");
    if (
      sec === "local-folder" ||
      sec === "shared-folder" ||
      sec === "collection-drive" ||
      sec === "loading" ||
      sec === "subscription" ||
      sec === "security"
    ) {
      return { kind: "about", section: sec };
    }
    return { kind: "about", section: "philosophy" };
  }
  if (cleanPath === "/guide") return { kind: "about", section: "local-folder" };
  if (cleanPath === "/import") {
    const params = new URLSearchParams(queryString);
    return { kind: "import", focusSubscriptions: params.get("tab") === "subscriptions" };
  }
  if (cleanPath === "/share") {
    const params = new URLSearchParams(queryString);
    return { kind: "share", preselectKey: params.get("resource") || undefined };
  }
  if (cleanPath === "/favourites") return { kind: "favourites" };
  if (cleanPath === "/hidden") return { kind: "hidden" };
  if (cleanPath === "/library") return { kind: "library", type: "all" };
  if (cleanPath === "/prompts") return { kind: "library", type: "prompt" };
  if (cleanPath === "/skills") return { kind: "library", type: "skill" };
  if (cleanPath === "/tools") return { kind: "library", type: "tool" };
  if (cleanPath === "/books") return { kind: "library", type: "book" };
  if (cleanPath === "/videos") return { kind: "library", type: "video" };
  if (cleanPath === "/conferences") return { kind: "library", type: "conference" };
  if (cleanPath === "/training") return { kind: "library", type: "training" };
  if (cleanPath === "/articles") return { kind: "library", type: "article" };
  if (cleanPath === "/podcasts") return { kind: "library", type: "podcast" };
  if (cleanPath === "/create") {
    const params = new URLSearchParams(queryString);
    const type = params?.get("type");
    return {
      kind: "create",
      type:
        type === "skill" ||
        type === "tool" ||
        type === "book" ||
        type === "video" ||
        type === "conference" ||
        type === "training" ||
        type === "article" ||
        type === "podcast"
          ? type
          : "prompt",
    };
  }
  const parts = cleanPath.split("/").filter(Boolean);
  if (
    parts[0] === "resource" &&
    (parts[1] === "local" || parts[1] === "published" || parts[1] === "example") &&
    (parts[2] === "prompt" ||
      parts[2] === "skill" ||
      parts[2] === "tool" ||
      parts[2] === "book" ||
      parts[2] === "video" ||
      parts[2] === "conference" ||
      parts[2] === "training" ||
      parts[2] === "article" ||
      parts[2] === "podcast") &&
    parts[3]
  ) {
    const base = {
      source: parts[1] as "local" | "published" | "example",
      type: parts[2] as ResourceType,
      slug: parts[3],
    };
    return parts[4] === "edit" ? { kind: "edit", ...base } : { kind: "resource", ...base };
  }
  return { kind: "not-found" };
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${date}T00:00:00`),
  );
}

function markdownToPlainText(markdown: string) {
  const documentFromMarkdown = new DOMParser().parseFromString(renderMarkdown(markdown), "text/html");
  return documentFromMarkdown.body.innerText.trim();
}

function extractPromptText(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const promptHeadingIndex = lines.findIndex((line) =>
    /^(#{1,6})\s+prompt\s*#*\s*$/i.test(line.trim()),
  );
  if (promptHeadingIndex < 0) return markdownToPlainText(markdown);

  const headingMatch = lines[promptHeadingIndex].trim().match(/^(#{1,6})\s+/);
  const headingLevel = headingMatch?.[1].length ?? 6;
  let sectionEnd = lines.length;

  for (let index = promptHeadingIndex + 1; index < lines.length; index += 1) {
    const nextHeading = lines[index].trim().match(/^(#{1,6})\s+/);
    if (nextHeading && nextHeading[1].length <= headingLevel) {
      sectionEnd = index;
      break;
    }
  }

  const promptSection = lines.slice(promptHeadingIndex + 1, sectionEnd).join("\n").trim();
  return markdownToPlainText(promptSection || markdown);
}

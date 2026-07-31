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
  FileText,
  Folder,
  FolderCheck,
  FolderOpen,
  FolderX,
  GraduationCap,
  Home,
  Headphones,
  Library,
  Link2,
  Menu,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Search,
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
import { publishedResources } from "./lib/published";
import { displaySummary, renderMarkdown, slugify, starterBody, validateResource } from "./lib/markdown";
import {
  downloadBundle,
  downloadMarkdown,
  fetchImportSource,
  LocalFolderStorage,
  pickImportSource,
  readImportFile,
  supportsLocalFolders,
  type ImportSource,
} from "./lib/storage";
import type { Resource, ResourceDraft, ResourceType } from "./types";

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

function routeForType(type: ResourceType) {
  return type === "training" ? "/training" : `/${type}s`;
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
  const [hasConnectedBefore, setHasConnectedBefore] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [identity, setIdentity] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const resources = useMemo(() => {
    const localKeys = new Set(localResources.map((item) => resourceKey(item)));
    const remotePublished = publishedResources.filter(
      (item) => !localKeys.has(resourceKey(item)),
    );
    const realResources = [...localResources, ...remotePublished];
    const typesWithRealResources = new Set(realResources.map((item) => item.meta.type));
    const visibleExamples = exampleResources.filter(
      (item) => !typesWithRealResources.has(item.meta.type),
    );
    return [...realResources, ...visibleExamples];
  }, [localResources]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (
      document.body.dataset.toolshelfUnsaved === "true" &&
      !window.confirm("Leave without saving your changes?")
    ) {
      return;
    }
    delete document.body.dataset.toolshelfUnsaved;
    window.history.pushState({}, "", `${basePath}${nextPath}`);
    setPath(nextPath);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [basePath]);

  const refreshResources = useCallback(async () => {
    if (!folderName) return;
    try {
      setLocalResources(await storage.listResources());
      notify("Library refreshed");
    } catch (error) {
      setFolderStatus("permission");
      setFolderMessage(error instanceof Error ? error.message : "Folder access was lost.");
    }
  }, [folderName, notify]);

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

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
    lastFocusedRef.current?.focus();
    lastFocusedRef.current = null;
  }, []);

  useEffect(() => {
    const onPop = () => setPath(pathFromLocation(basePath));
    window.addEventListener("popstate", onPop);
    if (!supportsLocalFolders()) {
      queueMicrotask(() => setFolderStatus("unsupported"));
      return () => window.removeEventListener("popstate", onPop);
    }
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
      .catch(() => setFolderStatus("idle"));
    return () => window.removeEventListener("popstate", onPop);
  }, [basePath]);

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
  }

  const route = parseRoute(path);
  const showFullHero =
    route.kind === "home" &&
    !hasConnectedBefore &&
    !folderName &&
    folderStatus !== "connecting" &&
    folderStatus !== "unsupported";
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
  } else if (route.kind === "guide") {
    content = (
      <ContributionGuide
        navigate={navigate}
        folderName={folderName}
        folderStatus={folderStatus}
        connectFolder={connectFolder}
      />
    );
  } else if (route.kind === "import") {
    content = (
      <ImportPage
        localResources={localResources}
        folderConnected={Boolean(folderName)}
        notify={notify}
        refresh={refreshResources}
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
        onDelete={async () => {
          await storage.deleteResource(resource.path);
          setLocalResources(await storage.listResources());
          navigate("/library");
          notify("Resource deleted");
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
        favouritesCount={favourites.size}
        navigate={navigate}
        close={() => setMobileOpen(false)}
        refresh={refreshResources}
        connectFolder={connectFolder}
        disconnectFolder={disconnectFolder}
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
  favouritesCount,
  navigate,
  close,
  refresh,
  connectFolder,
  disconnectFolder,
}: {
  path: string;
  mobileOpen: boolean;
  folderName: string | null;
  folderStatus: FolderStatus;
  folderMessage: string;
  localCount: number;
  favouritesCount: number;
  navigate: (path: string) => void;
  close: () => void;
  refresh: () => void;
  connectFolder: (reconnect?: boolean) => void;
  disconnectFolder: () => void;
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
          className={`nav-item nav-guide ${path === "/guide" ? "nav-item--active" : ""}`}
          onClick={() => navigate("/guide")}
          aria-current={path === "/guide" ? "page" : undefined}
        >
          <CircleHelp size={18} aria-hidden="true" />
          Getting started
          {path === "/guide" && <span className="nav-active-dot" />}
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
        {folderName && (
          <button className="text-button" onClick={disconnectFolder}>
            <FolderX size={14} />
            Disconnect folder
          </button>
        )}
      </div>
      <p className="privacy-note">
        <span>Private by design</span>
        Your library stays on this device.
      </p>
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
    return <p className="folder-required-notice">Folder access requires desktop Chrome or Edge.</p>;
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
        <p className="folder-required-notice">Folder access requires desktop Chrome or Edge.</p>
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
                    <button className="secondary-button" onClick={() => navigate("/library")}>
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
        ) : folderName ? (
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
      </div>
    </>
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

function ContributionGuide({
  navigate,
  folderName,
  folderStatus,
  connectFolder,
}: {
  navigate: (path: string) => void;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
}) {
  const steps = [
    {
      number: "01",
      icon: FolderOpen,
      title: "Connect a folder",
      copy: "Choose Connect folder and select any folder on your machine, including one kept in sync by OneDrive, Google Drive, Dropbox, or similar.",
      note: "MILO reads and writes resource files there directly. No special integration needed.",
    },
    {
      number: "02",
      icon: FileText,
      title: "Create or edit a resource",
      copy: "Choose Create new, select the resource type, add the details and recommendation, preview it, then save.",
      note: "Prompts, skills, and tools save as .md files. Other resources update their dedicated JSON collection.",
    },
    {
      number: "03",
      icon: RefreshCw,
      title: "It's shared automatically",
      copy: "If your folder lives on a shared drive, anyone else connected to it sees the new resource as soon as their drive client syncs.",
      note: "No review step, no merge: just Refresh files in MILO to pick up changes from others.",
    },
    {
      number: "04",
      icon: Link2,
      title: "Sharing outside your shared drive?",
      copy: "Use Share resources to export selected items as a bundle link. The recipient opens Import → From URL and picks what to bring in.",
      note: "Handy for one-off shares or teams that don't use the same shared drive.",
    },
  ];

  return (
    <>
      <div className="hero-split">
        <div className="hero-split-inner">
          <div className="hero-split-media">
            <img
              src={`${import.meta.env.BASE_URL}milo-getting-started-hero.png`}
              alt="Milo the black Labrador ready to get started"
            />
          </div>
          <div className="hero-split-content">
            <PageTop
              eyebrow="Getting started"
              title="Add a resource to your shelf"
              description="Connect a folder (your own, or a shared drive everyone already uses) and start adding resources directly. No review step, no pull request."
              action={
                <CreateAction
                  label="Create a resource"
                  folderName={folderName}
                  folderStatus={folderStatus}
                  connectFolder={connectFolder}
                  onCreate={() => navigate("/create")}
                />
              }
            />
          </div>
        </div>
      </div>

      <div className="page guide-page">
        <section className="guide-intro">
          <div className="guide-intro__number">4</div>
          <div>
            <span className="eyebrow">Before you begin</span>
            <h2>One folder, no gatekeeping.</h2>
            <p>
              Point MILO at a folder on your machine (your own, or one kept in sync by a
              shared drive) and start adding resources straight away.
            </p>
          </div>
          <div className="guide-apps" aria-label="Applications used">
            <span><BookOpen size={18} /> MILO</span>
            <ChevronRight size={16} aria-hidden="true" />
            <span><Folder size={18} /> Your folder</span>
          </div>
        </section>

        <section className="guide-steps" aria-labelledby="guide-steps-title">
          <div className="guide-section-heading">
            <span className="eyebrow">Step by step</span>
            <h2 id="guide-steps-title">Add a new resource</h2>
          </div>
          <div className="guide-step-list">
            {steps.map(({ number, icon: Icon, title, copy, note }) => (
              <article className="guide-step" key={number}>
                <div className="guide-step__number">{number}</div>
                <div className="guide-step__icon"><Icon size={22} aria-hidden="true" /></div>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  <small><Check size={13} aria-hidden="true" /> {note}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="guide-checklist">
          <div>
            <span className="eyebrow">Before you save</span>
            <h2>A quick quality check</h2>
          </div>
          <ul>
            <li><Check size={16} /> The title clearly says what the resource does.</li>
            <li><Check size={16} /> The summary explains when someone should use it.</li>
            <li><Check size={16} /> No customer data or confidential information is included.</li>
            <li><Check size={16} /> The preview is easy to scan and the filename is meaningful.</li>
          </ul>
        </section>

        <section className="guide-help">
          <CircleHelp size={24} />
          <div>
            <h2>Something not showing up?</h2>
            <p>
              If you&apos;re using a shared drive, make sure it has finished syncing on your
              machine. Then use Refresh files in MILO to pick up changes made by others.
            </p>
          </div>
        </section>
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

const importSourceOptions: Array<{ key: "folder" | "url" | "file"; icon: ReactNode; label: string; description: string }> = [
  {
    key: "folder",
    icon: <FolderOpen size={18} />,
    label: "From a folder",
    description: "Pull resources from another folder you can pick on this device.",
  },
  {
    key: "url",
    icon: <Link2 size={18} />,
    label: "From a URL",
    description: "Load a bundle someone shared with you as a link.",
  },
  {
    key: "file",
    icon: <FileText size={18} />,
    label: "From a file",
    description: "Import a bundle file already saved on this device.",
  },
];

function ImportPage({
  localResources,
  folderConnected,
  notify,
  refresh,
}: {
  localResources: Resource[];
  folderConnected: boolean;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"folder" | "url" | "file">("folder");
  const [source, setSource] = useState<ImportSource | null>(null);
  const [picking, setPicking] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Candidates are selected by default; this tracks explicit opt-outs instead of mirroring
  // `candidates` in state, so there's no need to sync selection via an effect.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  const localByKey = useMemo(() => {
    const map = new Map<string, Resource>();
    for (const item of localResources) map.set(`${item.meta.type}:${item.meta.slug}`, item);
    return map;
  }, [localResources]);

  const candidates = useMemo<ImportCandidate[]>(() => {
    if (!source) return [];
    return source.resources
      .map((resource) => {
        const key = `${resource.meta.type}:${resource.meta.slug}`;
        const existing = localByKey.get(key) || null;
        return { key, resource, existing, status: existing ? "changed" : "new" } as ImportCandidate;
      })
      .filter((candidate) => !candidate.existing || candidate.existing.raw !== candidate.resource.raw);
  }, [source, localByKey]);

  const selectedCount = candidates.filter((candidate) => !deselected.has(candidate.key)).length;
  const newCount = candidates.filter((candidate) => candidate.status === "new").length;
  const changedCount = candidates.length - newCount;
  const currentStep = !source ? 1 : importing ? 3 : 2;

  function switchTab(next: "folder" | "url" | "file") {
    if (next === tab) return;
    setTab(next);
    setSource(null);
    setError("");
    setDeselected(new Set());
    setUrl("");
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
          <div className="hero-split-media">
            <img src={`${import.meta.env.BASE_URL}milo-import-hero.png`} alt="Milo the black Labrador sniffing out new resources" />
          </div>
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
            <ol className="import-steps">
              <li className={currentStep === 1 ? "is-current" : "is-done"}>
                <span className="import-steps__badge">{currentStep > 1 ? <Check size={12} /> : 1}</span>
                <span>Choose a source</span>
              </li>
              <li className={currentStep === 2 ? "is-current" : currentStep > 2 ? "is-done" : ""}>
                <span className="import-steps__badge">{currentStep > 2 ? <Check size={12} /> : 2}</span>
                <span>Review &amp; select</span>
              </li>
              <li className={currentStep === 3 ? "is-current" : ""}>
                <span className="import-steps__badge">3</span>
                <span>Import</span>
              </li>
            </ol>
            <div className="import-source-picker">
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
                ) : (
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
                )}
                {error && <p className="import-page__notice import-page__notice--error">{error}</p>}
              </div>
            </div>
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
  const filtered = useMemo(
    () => filterResources(resources, query, type).filter((item) => source === "all" || item.source === source),
    [resources, query, type, source],
  );
  return (
    <div className="page library-page">
      <PageTop
        eyebrow="Knowledge, ready when you are"
        title={type === "all" ? "The complete MILO library" : `${typeLabels[type]} library`}
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
          <button className="secondary-button" onClick={() => { setQuery(""); setType("all"); setSource("all"); }}>
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
    <div className="page library-page">
      <PageTop
        eyebrow="Saved for later"
        title="Your favourites"
        description="Resources you've starred in this browser, saved inside your connected folder for only you to see."
      />
      {!folderName ? (
        <div className="empty-state">
          <Star size={30} />
          <h2>Connect a folder to use favourites</h2>
          <p>Favourites are saved as a small file inside your connected folder, so connect one to start starring resources.</p>
          {folderStatus === "unsupported" ? (
            <p className="folder-required-notice">Folder access requires desktop Chrome or Edge.</p>
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
  onDelete,
}: {
  resource: Resource;
  folderConnected: boolean;
  navigate: (path: string) => void;
  notify: (message: string) => void;
  isFavourite: boolean;
  onToggleFavourite: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
                <button onClick={onDelete}>Yes, delete</button>
                <button onClick={() => setConfirmingDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="delete-button" onClick={() => setConfirmingDelete(true)}>
                <Trash2 size={14} /> Delete resource
              </button>
            )
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
}: {
  initial: ResourceDraft;
  original?: Resource;
  folderConnected: boolean;
  navigate: (path: string) => void;
  connectFolder: (reconnect?: boolean) => void;
  notify: (message: string) => void;
  onSave: (draft: ResourceDraft, saveAsNew: boolean) => Promise<Resource>;
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
    if (dirty) document.body.dataset.toolshelfUnsaved = "true";
    else delete document.body.dataset.toolshelfUnsaved;
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      delete document.body.dataset.toolshelfUnsaved;
    };
  }, [dirty]);

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
      delete document.body.dataset.toolshelfUnsaved;
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
  | { kind: "guide" }
  | { kind: "import" }
  | { kind: "share"; preselectKey?: string }
  | { kind: "favourites" }
  | { kind: "library"; type: ResourceType | "all" }
  | { kind: "resource"; source: "local" | "published" | "example"; type: ResourceType; slug: string }
  | { kind: "edit"; source: "local" | "published" | "example"; type: ResourceType; slug: string }
  | { kind: "create"; type: ResourceType }
  | { kind: "not-found" } {
  const [pathname, queryString = ""] = path.split("?");
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  if (cleanPath === "/") return { kind: "home" };
  if (cleanPath === "/guide") return { kind: "guide" };
  if (cleanPath === "/import") return { kind: "import" };
  if (cleanPath === "/share") {
    const params = new URLSearchParams(queryString);
    return { kind: "share", preselectKey: params.get("resource") || undefined };
  }
  if (cleanPath === "/favourites") return { kind: "favourites" };
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

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
  GitBranch,
  GitPullRequest,
  GraduationCap,
  Home,
  Headphones,
  Library,
  Menu,
  MonitorUp,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  Video,
  WandSparkles,
  Wrench,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { exampleResources } from "./data";
import { publishedResources } from "./lib/published";
import { renderMarkdown, slugify, starterBody, validateResource } from "./lib/markdown";
import {
  downloadMarkdown,
  LocalFolderStorage,
  pickImportSource,
  supportsLocalFolders,
  type ImportSource,
} from "./lib/storage";
import type { Resource, ResourceDraft, ResourceType } from "./types";

const storage = new LocalFolderStorage();
const today = new Date().toISOString().slice(0, 10);

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resources = useMemo(() => {
    const localKeys = new Set(localResources.map((item) => `${item.meta.type}:${item.meta.slug}`));
    const remotePublished = publishedResources.filter(
      (item) => !localKeys.has(`${item.meta.type}:${item.meta.slug}`),
    );
    return [...localResources, ...remotePublished, ...exampleResources];
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
        } else if (storage.folderName) {
          setFolderStatus("permission");
          setFolderMessage("Reconnect your folder to continue editing.");
        }
      })
      .catch(() => setFolderStatus("idle"));
    return () => window.removeEventListener("popstate", onPop);
  }, [basePath]);

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

  const route = parseRoute(path);
  let content: ReactNode;

  if (route.kind === "home") {
    content = (
      <Dashboard
        resources={resources}
        search={search}
        setSearch={setSearch}
        navigate={navigate}
        folderName={folderName}
        folderStatus={folderStatus}
        connectFolder={connectFolder}
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
    <div className="app-shell">
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
        navigate={navigate}
        close={() => setMobileOpen(false)}
        refresh={refreshResources}
        connectFolder={connectFolder}
      />
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <main className="main-frame">
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
        <div className="brand-glyph" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      <div>
        <strong>MILO</strong>
        {!compact && <small>Methods, Instructions, Learning &amp; Operations</small>}
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
  navigate,
  close,
  refresh,
  connectFolder,
}: {
  path: string;
  mobileOpen: boolean;
  folderName: string | null;
  folderStatus: FolderStatus;
  folderMessage: string;
  localCount: number;
  navigate: (path: string) => void;
  close: () => void;
  refresh: () => void;
  connectFolder: (reconnect?: boolean) => void;
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
          How to contribute
          {path === "/guide" && <span className="nav-active-dot" />}
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
            Import from another folder
          </button>
        )}
        <button className="folder-mini__guide" onClick={() => navigate("/guide")}>
          How publishing works
        </button>
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
}: {
  label: string;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
  onCreate: () => void;
}) {
  if (folderName) {
    return (
      <button className="primary-button" onClick={onCreate}>
        <Plus size={17} />
        {label}
      </button>
    );
  }
  if (folderStatus === "unsupported") {
    return <p className="folder-required-notice">Folder access requires desktop Chrome or Edge.</p>;
  }
  return (
    <button className="primary-button" onClick={() => connectFolder(folderStatus === "permission")}>
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
  navigate,
  folderName,
  folderStatus,
  connectFolder,
}: {
  resources: Resource[];
  search: string;
  setSearch: (value: string) => void;
  navigate: (path: string) => void;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
}) {
  const results = useMemo(() => filterResources(resources, search, "all"), [resources, search]);
  const latestResources = useMemo(
    () =>
      [...resources]
        .sort(
          (first, second) =>
            second.meta.createdAt.localeCompare(first.meta.createdAt) ||
            second.meta.updatedAt.localeCompare(first.meta.updatedAt),
        )
        .slice(0, 5),
    [resources],
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
                <span className="eyebrow">The product team&apos;s working library</span>
                <h1>Better product work,<br /><em>ready to reuse.</em></h1>
                <p>
                  Keep the prompts, skills, tools, and learning resources that make your work
                  sharper, beautifully organised and stored right on your machine.
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
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search MILO…"
                aria-label="Search MILO"
              />
              <span>{search ? `${results.length} found` : `${resources.length} resources`}</span>
            </section>
          </div>
        </div>
      </div>

      <div className="page dashboard-page">
        {search ? (
          <section className="section-block">
            <SectionHeading eyebrow="Search results" title={`Matching “${search}”`} />
            <ResourceGrid resources={results} navigate={navigate} />
          </section>
        ) : (
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
                  <p>{typeDescriptions[type]}</p>
                  <span className="category-link">
                    Explore {pluralTypeLabel(type).toLowerCase()} <ChevronRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {!search && (
          <section className="section-block">
            <SectionHeading
              eyebrow="Recently added"
              title="Latest resources"
              aside="The five newest additions across your local library and bundled examples."
            />
            <ResourceGrid
              resources={latestResources}
              navigate={navigate}
              compact
              showCreatedDate
            />
          </section>
        )}
      </div>
    </>
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
      icon: MonitorUp,
      title: "Clone the repository",
      copy: "Open GitHub Desktop, choose Clone a repository, and save the MILO project somewhere easy to find.",
      note: "You only need to do this once on each computer.",
    },
    {
      number: "02",
      icon: GitBranch,
      title: "Create a new branch",
      copy: "In GitHub Desktop, select Current Branch → New Branch. Use a clear name such as add-interview-summary-prompt.",
      note: "Always branch from an up-to-date main branch.",
    },
    {
      number: "03",
      icon: FolderOpen,
      title: "Connect the cloned repository",
      copy: "Return to MILO, choose your local folder, and select the main milo folder that you cloned with GitHub Desktop.",
      note: "MILO creates or updates the resource folders and JSON files inside this repository folder.",
    },
    {
      number: "04",
      icon: FileText,
      title: "Create your resource",
      copy: "Choose Create new, select the resource type, add the details and recommendation, preview it, then save.",
      note: "Prompts, skills, and tools create .md files. Other resources update their dedicated JSON collection.",
    },
    {
      number: "05",
      icon: UploadCloud,
      title: "Commit and publish the branch",
      copy: "Review the change in GitHub Desktop, add a short summary, commit it to your branch, then choose Publish branch or Push origin.",
      note: "The file has not joined the shared library yet.",
    },
    {
      number: "06",
      icon: GitPullRequest,
      title: "Open a pull request",
      copy: "Choose Preview Pull Request in GitHub Desktop, describe what the resource is for, and submit it for review.",
      note: "Once it is merged, the shared MILO library rebuilds automatically.",
    },
  ];

  return (
    <div className="page guide-page">
      <PageTop
        eyebrow="A simple contribution workflow"
        title="From your idea to the shared shelf"
        description="MILO updates the local content files. GitHub Desktop handles the review and publishing steps. No command line required."
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

      <section className="guide-intro">
        <div className="guide-intro__number">6</div>
        <div>
          <span className="eyebrow">Before you begin</span>
          <h2>Two tools, one straightforward flow.</h2>
          <p>
            Keep MILO open in Chrome or Edge and GitHub Desktop open beside it.
            You will move between them as you create, review, and submit your resource.
          </p>
        </div>
        <div className="guide-apps" aria-label="Applications used">
          <span><BookOpen size={18} /> MILO</span>
          <ChevronRight size={16} aria-hidden="true" />
          <span><MonitorUp size={18} /> GitHub Desktop</span>
        </div>
      </section>

      <section className="guide-steps" aria-labelledby="guide-steps-title">
        <div className="guide-section-heading">
          <span className="eyebrow">Step by step</span>
          <h2 id="guide-steps-title">Upload a new resource</h2>
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
          <span className="eyebrow">Ready to submit?</span>
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
            In GitHub Desktop, confirm that you are viewing the correct repository and
            branch. In MILO, use Refresh files after pulling changes made by someone else.
          </p>
        </div>
      </section>
    </div>
  );
}

interface ImportCandidate {
  key: string;
  resource: Resource;
  existing: Resource | null;
  status: "new" | "changed";
}

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
  const [source, setSource] = useState<ImportSource | null>(null);
  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
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
      const draft: ResourceDraft = { ...candidate.resource.meta, body: candidate.resource.body };
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
    <div className="page import-page">
      <PageTop
        eyebrow="Bring resources over"
        title="Import from another folder"
        description="Pick a second folder (for example one you worked in before connecting the shared folder) and bring its new or changed resources into the folder you have connected now. Nothing already there is removed, and identical items are skipped automatically."
      />
      {!folderConnected ? (
        <p className="import-page__notice">Connect a folder first, then come back here to import into it.</p>
      ) : (
        <>
          <button className="secondary-button" disabled={picking} onClick={choose}>
            <FolderOpen size={16} />
            {picking ? "Opening…" : "Choose folder to import from"}
          </button>
          {error && <p className="import-page__notice import-page__notice--error">{error}</p>}
          {source && (
            <section className="section-block">
              <SectionHeading
                eyebrow={`From “${source.name}”`}
                title={
                  candidates.length
                    ? `${candidates.length} ${candidates.length === 1 ? "resource" : "resources"} to review`
                    : "Nothing new to import"
                }
                aside="Items identical to what's already in your connected folder are left out automatically."
              />
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
}: {
  resources: Resource[];
  initialType: ResourceType | "all";
  navigate: (path: string) => void;
  folderName: string | null;
  folderStatus: FolderStatus;
  connectFolder: (reconnect?: boolean) => void;
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
      <ResourceGrid resources={filtered} navigate={navigate} />
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
}: {
  resources: Resource[];
  navigate: (path: string) => void;
  compact?: boolean;
  showCreatedDate?: boolean;
}) {
  return (
    <div className={`resource-grid ${compact ? "resource-grid--compact" : ""}`}>
      {resources.map((resource) => (
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
            <span className={`source-pill source-pill--${resource.source}`}>
              {sourcePillLabel(resource.source)}
            </span>
          </div>
          <h3>{resource.meta.title}</h3>
          <p>{resource.meta.summary}</p>
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
      ))}
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
  onDelete,
}: {
  resource: Resource;
  folderConnected: boolean;
  navigate: (path: string) => void;
  notify: (message: string) => void;
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
          </div>
          <h1>{resource.meta.title}</h1>
          <p>{resource.meta.summary}</p>
          <div className="detail-byline">
            <span className="avatar">{initials(resource.meta.author)}</span>
            <span>
              <strong>{resource.meta.author}</strong>
              Updated {formatDate(resource.meta.updatedAt)}
            </span>
          </div>
        </div>
        <div className="detail-actions">
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
              onChange={(event) => update("summary", event.target.value)}
              placeholder="One sentence explaining when this is useful"
              rows={3}
            />
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

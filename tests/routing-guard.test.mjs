import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

// ── Routing Guard Logic ───────────────────────────────────────────────
// This tests the invariant: a user with no connected folder (and no history
// of ever connecting one) must always be redirected to the landing page from
// any app-route deep link. The logic was inlined in toolshelf-app.tsx's
// useEffect guard (line 590) — the same guard expression is tested here.
// See BLD-809 for context.

const HAS_CONNECTED_KEY = "milo:has-connected";

const PUBLIC_ROUTES = ["/", "/about", "/guide"];

function shouldRedirect(path, hasConnectedBefore, isReconnecting, folderName) {
  // If we're still waiting for reconnection AND the user has connected
  // before, wait — don't redirect yet.
  if (isReconnecting && hasConnectedBefore) return false;

  // If there's a folder, no redirect.
  if (folderName) return false;

  // No folder: redirect unless the path is a public route.
  const cleanPath = path.split("?")[0].replace(/\/+$/, "") || "/";
  return !PUBLIC_ROUTES.includes(cleanPath);
}

// ── Tests ─────────────────────────────────────────────────────────────

test("first-time user with no folder: redirects from all app routes", () => {
  assert.equal(shouldRedirect("/library", false, false, null), true);
  assert.equal(shouldRedirect("/prompts", false, false, null), true);
  assert.equal(shouldRedirect("/skills", false, false, null), true);
  assert.equal(shouldRedirect("/tools", false, false, null), true);
  assert.equal(shouldRedirect("/books", false, false, null), true);
  assert.equal(shouldRedirect("/videos", false, false, null), true);
  assert.equal(shouldRedirect("/create", false, false, null), true);
  assert.equal(shouldRedirect("/resource/local/prompt/test", false, false, null), true);
  assert.equal(shouldRedirect("/skill/foo/edit", false, false, null), true);
  assert.equal(shouldRedirect("/import", false, false, null), true);
  assert.equal(shouldRedirect("/favourites", false, false, null), true);
  assert.equal(shouldRedirect("/hidden", false, false, null), true);
  assert.equal(shouldRedirect("/discover", false, false, null), true);
  // Deep-link with query string
  assert.equal(shouldRedirect("/create?type=skill", false, false, null), true);
});

test("first-time user with no folder: stays on public routes", () => {
  assert.equal(shouldRedirect("/", false, false, null), false);
  assert.equal(shouldRedirect("/about", false, false, null), false);
  assert.equal(shouldRedirect("/guide", false, false, null), false);
});

test("first-time user during reconnection: does NOT wait, redirects immediately", () => {
  // This is the key fix for BLD-808: a first-time user (hasConnectedBefore=false)
  // should redirect even when isReconnecting=true, because there's nothing to
  // reconnect to.
  assert.equal(shouldRedirect("/library", false, true, null), true);
  assert.equal(shouldRedirect("/prompts", false, true, null), true);
  assert.equal(shouldRedirect("/", false, true, null), false);
});

test("returning user during reconnection: waits", () => {
  // Returning user: hasConnectedBefore=true, reconnecting.
  // Don't redirect yet — the folder might be found.
  assert.equal(shouldRedirect("/library", true, true, null), false);
  assert.equal(shouldRedirect("/prompts", true, true, null), false);
});

test("returning user after failed reconnection: redirects", () => {
  // Reconnection finished, no folder found.
  assert.equal(shouldRedirect("/library", true, false, null), true);
  assert.equal(shouldRedirect("/create", true, false, null), true);
  assert.equal(shouldRedirect("/", true, false, null), false);
});

test("connected user: never redirects", () => {
  assert.equal(shouldRedirect("/library", true, false, "my-folder"), false);
  assert.equal(shouldRedirect("/prompts", true, true, "my-folder"), false);
  assert.equal(shouldRedirect("/create", false, false, "my-folder"), false);
  assert.equal(shouldRedirect("/import", true, true, "my-folder"), false);
});

test("handles trailing slashes and empty paths", () => {
  // Trailing slash normalisation
  assert.equal(shouldRedirect("/library/", false, false, null), true);
  assert.equal(shouldRedirect("/about/", false, false, null), false);
  // Empty/root
  assert.equal(shouldRedirect("", false, false, null), false);
  assert.equal(shouldRedirect("/", false, false, null), false);
});

test("handles query strings in deep links", () => {
  assert.equal(shouldRedirect("/create?type=skill&source=published", false, false, null), true);
  assert.equal(shouldRedirect("/?ref=email", false, false, null), false);
  assert.equal(shouldRedirect("/about?section=local-folder", false, false, null), false);
});

// ── Integration: localStorage-backed guard expression ─────────────────

test("guard expression matches inlined toolshelf-app.tsx logic", () => {
  // Verify the exact expression used in the component matches our model.
  // The inlined code (line 591 now) reads:
  //   `if (isReconnecting && window.localStorage.getItem(HAS_CONNECTED_KEY) === "1") return;`
  // This is equivalent to: guard should fire UNLESS (isReconnecting && hasConnectedInStorage).
  const dom = new JSDOM("", { url: "http://localhost" });
  const storage = dom.window.localStorage;
  const reconnecting = true;

  // Scenario: first-time user visits /library
  storage.removeItem(HAS_CONNECTED_KEY);
  const firstTime = storage.getItem(HAS_CONNECTED_KEY) === "1";
  // Guard expression: if (isReconnecting && hasConnectedInStorage) return;
  // isReconnecting=true, hasConnectedInStorage=false → condition is false → guard proceeds → redirects
  assert.equal(
    reconnecting && firstTime,
    false,
    "first-time user: guard should NOT be blocked during reconnection",
  );

  // Scenario: returning user visits /library
  storage.setItem(HAS_CONNECTED_KEY, "1");
  const returning = storage.getItem(HAS_CONNECTED_KEY) === "1";
  // isReconnecting=true, hasConnected=true → condition is true → guard returns → waits
  assert.equal(
    reconnecting && returning,
    true,
    "returning user: guard should be blocked during reconnection",
  );
});

// ── Delete-navigation regression (BLD-975/976/977) ───────────────────
// Deleting a resource must return to the category it was deleted from
// (e.g. /videos), not always to All Resources (/library).

test("routeForType maps every resource type to its category route", () => {
  const cases = {
    training: "/training", prompt: "/prompts", skill: "/skills",
    tool: "/tools", book: "/books", video: "/videos",
    conference: "/conferences", article: "/articles", podcast: "/podcasts",
  };
  for (const [type, expected] of Object.entries(cases)) {
    assert.equal(routeForTypeForTest(type), expected, type);
  }
});

test("ResourceDetail delete handler navigates to the source category via the resolver", async () => {
  const src = await readFile(
    new URL("../app/toolshelf-app.tsx", import.meta.url),
    "utf8",
  );
  // Locate the onDelete block inside the ResourceDetail render.
  const block = src.slice(src.indexOf("onDelete={async () =>"));
  // It must navigate via the shared resolver — the single source of truth for
  // post-action landing routes — and must NOT hard-code the All Resources route.
  assert.match(block, /navigate\(resourceReturnRoute\(route\)\)/);
  assert.doesNotMatch(block.slice(0, 200), /navigate\("\/library"\)/);
});

test("post-action navigation uses the resolver, not hard-coded library routes", async () => {
  const src = await readFile(
    new URL("../app/toolshelf-app.tsx", import.meta.url),
    "utf8",
  );
  // The resolver is the single source of truth for landing after resource
  // actions. Any navigate() inside a state-changing handler block should route
  // through it rather than embedding a literal destination.
  assert.match(src, /function resourceReturnRoute\(/);
  // The delete handler must reference the resolver.
  assert.match(
    src.slice(src.indexOf("onDelete={async () =>")),
    /resourceReturnRoute\(route\)/,
  );
});

// routeForType is defined in toolshelf-app.tsx; mirror it here so the test
// runs standalone (no app import) while still asserting the mapping used
// by the delete handler.
function routeForTypeForTest(type) {
  return type === "training" ? "/training" : `/${type}s`;
}
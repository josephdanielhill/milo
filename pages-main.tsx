import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app/globals.css";
import ToolshelfApp from "./app/toolshelf-app";

const root = document.getElementById("root");
if (!root) throw new Error("MILO could not find its application root.");

const configuredBase =
  document.querySelector<HTMLMetaElement>('meta[name="milo-base-path"]')?.content || "/";
const basePath = configuredBase === "/" ? "" : configuredBase.replace(/\/$/, "");
const relativePath =
  basePath && window.location.pathname.startsWith(basePath)
    ? window.location.pathname.slice(basePath.length) || "/"
    : window.location.pathname;
const initialPath = `${relativePath}${window.location.search}`;

createRoot(root).render(
  <StrictMode>
    <ToolshelfApp initialPath={initialPath} basePath={basePath} />
  </StrictMode>,
);

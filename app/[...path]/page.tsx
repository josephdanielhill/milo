import ToolshelfApp from "../toolshelf-app";

export default async function ToolshelfRoute({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  const route = `/${path.join("/")}`;
  const type = typeof query.type === "string" ? query.type : "";
  return <ToolshelfApp initialPath={`${route}${type ? `?type=${encodeURIComponent(type)}` : ""}`} />;
}

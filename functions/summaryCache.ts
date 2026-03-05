const CACHE_ROOT_DIR = "/Users/nilsborg/Repos/meeting-summaries-to-notion/generated_summaries";

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function getBaseName(path: string): string {
  const fileName = path.split("/").pop() ?? "unknown";
  return fileName.replace(/\.[^/.]+$/, "");
}

export function getSummaryCachePath(filePath: string, flowKey: string): string {
  const baseName = sanitizeFileName(getBaseName(filePath));
  const flowDir = sanitizeFileName(flowKey);
  return `${CACHE_ROOT_DIR}/${flowDir}/${baseName}.md`;
}

export async function readCachedSummary(
  filePath: string,
  flowKey: string,
): Promise<string | undefined> {
  const cachePath = getSummaryCachePath(filePath, flowKey);
  try {
    const content = await Deno.readTextFile(cachePath);
    return content.trim().length > 0 ? content : undefined;
  } catch {
    return undefined;
  }
}

export async function writeCachedSummary(
  filePath: string,
  flowKey: string,
  content: string,
): Promise<string> {
  const cachePath = getSummaryCachePath(filePath, flowKey);
  const dir = cachePath.split("/").slice(0, -1).join("/");
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(cachePath, content);
  return cachePath;
}

/**
 * Create a meeting summary page in Nextcloud Collectives via OCS API + WebDAV.
 * 1. Create page via OCS API (POST).
 * 2. Set markdown content via WebDAV (PUT).
 */

const OCS_API_REQUEST = "true";

export interface CollectivesConfig {
  baseUrl: string;
  username: string;
  appPassword: string;
  /** Numeric collective ID (use scripts/list-collectives.ts to get it). */
  collectiveId: string;
  /** Numeric parent page ID (use scripts/list-collectives.ts <collective_id> to get it). */
  parentPageId: string;
}

/** Normalize base URL (no trailing slash). */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Unwrap OCS JSON response (Nextcloud may return { ocs: { data: X } } or { data: X }). */
function unwrapOcsData<T>(body: unknown): T {
  if (body && typeof body === "object" && "ocs" in body) {
    const ocs = (body as { ocs?: { data?: T } }).ocs;
    if (ocs && typeof ocs === "object" && "data" in ocs) return ocs.data as T;
  }
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/** Fetch JSON with OCS auth and Accept. */
async function ocsFetch(
  url: string,
  config: { username: string; appPassword: string; method?: string; body?: string }
): Promise<unknown> {
  const credentials = btoa(`${config.username}:${config.appPassword}`);
  const res = await fetch(url, {
    method: config.method ?? "GET",
    headers: {
      Authorization: `Basic ${credentials}`,
      "OCS-APIRequest": OCS_API_REQUEST,
      Accept: "application/json",
      ...(config.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: config.body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nextcloud OCS error ${res.status}: ${text}`);
  }
  return res.json();
}

/** Require exact numeric collective ID. */
function parseCollectiveId(value: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || String(n) !== value.trim()) {
    throw new Error(
      `NEXTCLOUD_COLLECTIVE_ID must be a numeric id (e.g. 1). Run: deno run --allow-read --allow-net --allow-env scripts/list-collectives.ts`
    );
  }
  return n;
}

/** Require exact numeric parent page ID. */
function parseParentPageId(value: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || String(n) !== value.trim()) {
    throw new Error(
      `NEXTCLOUD_COLLECTIVE_PARENT_PAGE_ID must be a numeric id (e.g. 85481). Run: deno run --allow-read --allow-net --allow-env scripts/list-collectives.ts <collective_id>`
    );
  }
  return n;
}

/** Create a page via OCS and return page info. */
async function createPageViaOcs(
  baseUrl: string,
  auth: { username: string; appPassword: string },
  collectiveId: number,
  parentPageId: number,
  title: string
): Promise<{ id: number; filePath: string; fileName?: string; collectivePath: string; title: string }> {
  const url = `${normalizeBaseUrl(baseUrl)}/ocs/v2.php/apps/collectives/api/v1.0/collectives/${collectiveId}/pages/${parentPageId}?title=${encodeURIComponent(title)}`;
  const body = await ocsFetch(url, {
    ...auth,
    method: "POST",
  });
  const data = unwrapOcsData<{ page?: { id: number; filePath: string; collectivePath: string; title: string } }>(body);
  const page = data?.page ?? data;
  if (!page || typeof page !== "object" || typeof (page as { id?: number }).id !== "number") {
    throw new Error(`Unexpected create page response: ${JSON.stringify(body)}`);
  }
  const p = page as { id: number; filePath?: string; fileName?: string; collectivePath: string; title: string };
  const filePath = p.filePath ?? "";
  return {
    id: p.id,
    filePath,
    fileName: p.fileName,
    collectivePath: p.collectivePath ?? "",
    title: p.title ?? title,
  };
}

function buildWebDavFilePath(page: {
  filePath: string;
  fileName?: string;
  collectivePath: string;
  title: string;
}): string {
  const collectivePath = page.collectivePath.replace(/^\/+|\/+$/g, "");
  const rawFilePath = page.filePath.replace(/^\/+|\/+$/g, "");
  const rawFileName = (page.fileName ?? "").replace(/^\/+|\/+$/g, "");
  const fallbackName = `${page.title.replace(/[/\\]/g, "-")}.md`;

  // filePath can be either a full file path or a directory path, depending on API response shape.
  let relativePath = rawFilePath;
  if (!/\.md$/i.test(relativePath)) {
    const filename = rawFileName || fallbackName;
    relativePath = relativePath ? `${relativePath}/${filename}` : filename;
  }

  if (!relativePath.startsWith(collectivePath) && collectivePath.length > 0) {
    relativePath = `${collectivePath}/${relativePath}`;
  }

  return relativePath.replace(/\/+/g, "/").replace(/^\/+/, "");
}

/** Upload file content via WebDAV PUT. */
async function putWebDav(
  baseUrl: string,
  auth: { username: string; appPassword: string },
  path: string,
  content: string
): Promise<void> {
  const normalizedPath = path.replace(/^\/+/, "").replace(/\/+/g, "/");
  const url = `${normalizeBaseUrl(baseUrl)}/remote.php/dav/files/${encodeURIComponent(auth.username)}/${normalizedPath}`;
  const credentials = btoa(`${auth.username}:${auth.appPassword}`);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "text/markdown; charset=utf-8",
    },
    body: content,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nextcloud WebDAV PUT error ${res.status}: ${text}`);
  }
}

/**
 * Create a Collectives page with the given title and markdown content.
 * Returns the URL to open the page in the Collectives app.
 */
export async function createCollectivesDocument(
  title: string,
  content: string,
  config: CollectivesConfig
): Promise<string> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const auth = {
    username: config.username,
    appPassword: config.appPassword,
  };

  const collectiveId = parseCollectiveId(config.collectiveId);
  const parentPageId = parseParentPageId(config.parentPageId);

  const page = await createPageViaOcs(baseUrl, auth, collectiveId, parentPageId, title);

  const webDavPath = buildWebDavFilePath(page);

  const markdownBody = content.startsWith("#") ? content : `# ${title}\n\n${content}`;
  await putWebDav(baseUrl, auth, webDavPath, markdownBody);

  const pageUrl = `${baseUrl}/apps/collectives/#/c/${collectiveId}/p/${page.id}`;
  console.log("Document successfully created in Nextcloud Collectives.");
  return pageUrl;
}

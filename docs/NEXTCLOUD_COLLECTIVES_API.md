# Nextcloud Collectives – API options for adding meeting summaries

This doc summarizes what’s needed API‑wise to push the same meeting summary that currently goes to Notion into a **Nextcloud Collectives** collective as well.

## How Collectives stores pages

- Pages are **Markdown files** (`.md`) under a collective-specific folder.
- That folder is mounted into each member’s account (default name: **`.Collectives`**; can be changed in Collectives settings).
- So from the outside you can either:
  - Use the **Collectives OCS API** to create/update pages (recommended), or
  - Use **Nextcloud WebDAV** to upload/edit files in that folder (simpler but see caveats below).

---

## Option 1: Collectives OCS API (recommended)

The Collectives app exposes an **OCS API** (Nextcloud’s app API style). Base URL pattern:

```text
https://<nextcloud-host>/ocs/v2.php/apps/collectives/api/v1.0/...
```

- **Auth**: Basic Auth (`username` + **app password**) or session. Use an [app password](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/basic.html) for scripts.
- **Header**: `OCS-APIRequest: true`
- **Response**: XML by default; use `Accept: application/json` (or `?format=json`) for JSON.

### Endpoints you need

1. **List collectives** (get `collectiveId` and names)
   - `GET …/api/v1.0/collectives`
   - Returns the list of collectives the user can access.

2. **List pages** (get root/landing page id for a collective)
   - `GET …/api/v1.0/collectives/{collectiveId}/pages`
   - Returns a tree of pages; the **landing/root page** has a fixed role (e.g. `parentId: 0` or similar). You need its `id` as `parentId` when creating a new top-level page.

3. **Create page**
   - `POST …/api/v1.0/collectives/{collectiveId}/pages/{parentId}`
   - **Parameters**: `title` (required), `templateId` (optional). Typically sent as query params, e.g. `?title=Meeting%20Notes%20-%202025-01-27`.
   - **Response**: New page object including `id`, `title`, `filePath`, `collectivePath`, etc.
   - **Note**: This creates the page in the collective’s structure and DB; the **content** (markdown body) is not set by this call (the backend creates an empty or default file). So you need a second step to set content.

4. **Set page content**
   - The OCS API does **not** expose “set page body” in the routes we inspected. Content is stored in the underlying `.md` file.
   - So after creating the page via OCS, you set the markdown body by **updating the file via WebDAV** (see below), using the `filePath` / `collectivePath` from the create response to build the WebDAV path.

### Summary for “create + set content”

1. `GET` collectives → choose `collectiveId`.
2. `GET` `…/collectives/{collectiveId}/pages` → get root/landing page `id` → use as `parentId`.
3. `POST` `…/collectives/{collectiveId}/pages/{parentId}?title=...` → get new page `id`, `filePath`, `collectivePath`.
4. Build WebDAV path from response (e.g. `files/{username}/{collectivePath}/{filePath}`) and **PUT** the meeting summary markdown to that URL (see Option 2 for WebDAV details).

Same auth (e.g. app password) can be used for both OCS and WebDAV.

---

## Option 2: WebDAV only (upload file into collective folder)

Nextcloud’s standard **WebDAV** API can create/update files under the user’s storage, including the collective mount.

- **Base URL**: `https://<nextcloud-host>/remote.php/dav/files/<username>/`
- **Auth**: Same as above (Basic Auth with app password, or session).
- **Create/update a file**: `PUT` to the full file path, body = raw file content (e.g. UTF‑8 markdown).
- **Create parent folders if needed**: `MKCOL` for each path segment (or rely on `X-NC-WebDAV-AutoMkcol: 1` if your server supports it).

Example:

```bash
# Upload a new markdown page
curl -T meeting-notes.md -u "user:app-password" \
  "https://cloud.example.com/remote.php/dav/files/user/.Collectives/My%20Collective/Meeting%20Notes%20-%202025-01-27.md"
```

Caveats:

- The **default** collective folder name is **`.Collectives`** (with leading dot). It can be changed in Collectives settings; then the path changes (e.g. `Collectives/My Collective/...`).
- You must know the **exact folder name** of the collective (as seen in the Files app). It’s usually the collective’s display name.
- Creating **only** a file via WebDAV might not register it in Collectives’ internal page list (which uses DB + index pages). So the file may appear in the Files app but not in the Collectives UI, or not as a proper “page”. **Option 1 (OCS create + WebDAV content)** avoids that.

---

## Recommendation for this project

- Use **Option 1**: **OCS API to create the page**, then **WebDAV PUT to set the markdown content**.
- **Env/config**: Nextcloud base URL, username, app password, and either:
  - **collective ID** (and optionally parent page ID), or  
  - **collective name** (then resolve ID via `GET …/collectives`).

Implementation sketch:

1. **Adapter interface** (e.g. “destination” or “publish”): same shape as Notion: `(title: string, content: string) => Promise<url_or_id>`.
2. **Collectives adapter**:
   - If not cached: `GET` collectives and optionally pages to resolve collective (and parent page) from config.
   - `POST` create page with `title`.
   - Build WebDAV path from create response; `PUT` `content` (markdown) to that path.
   - Return the Collectives page URL (e.g. app URL to that page, if you have a stable pattern).
3. **Run both**: after generating the summary, call the Notion adapter and the Collectives adapter so the same meeting summary is pushed to both.

---

## References

- [Nextcloud WebDAV (basic)](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/basic.html) – auth, PUT, MKCOL.
- [Nextcloud Collectives – User docs (usage)](https://nextcloud.github.io/collectives/usage/) – pages as markdown, `.Collectives` folder.
- [Nextcloud Collectives – Developer docs](https://nextcloud.github.io/collectives/development/) – ownership/mount model.
- [Collectives app `appinfo/routes.php`](https://github.com/nextcloud/collectives/blob/main/appinfo/routes.php) – OCS routes for collectives, pages, templates, etc.
- [OCS API overview](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/OCS/ocs-api-overview.html) – `OCS-APIRequest`, auth, response format.

#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env
/**
 * List Nextcloud Collectives and their pages so you can copy numeric IDs into .env.
 *
 * Usage:
 *   deno run --allow-read --allow-net --allow-env scripts/list-collectives.ts
 *     → prints all collectives (id + name)
 *
 *   deno run --allow-read --allow-net --allow-env scripts/list-collectives.ts <collective_id>
 *     → prints pages in that collective (id + title) so you can pick NEXTCLOUD_COLLECTIVE_PARENT_PAGE_ID
 *
 * Requires in .env: NEXTCLOUD_BASE_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_APP_PASSWORD
 */

import { config } from "https://deno.land/x/dotenv/mod.ts";

// Run from project root: deno run --allow-read --allow-net --allow-env scripts/list-collectives.ts
const env = config({ path: ".env" }) as Record<string, string>;
const resolveEnv = (key: string) => env[key] ?? Deno.env.get(key);

const baseUrl = (resolveEnv("NEXTCLOUD_BASE_URL") ?? "").replace(/\/+$/, "");
const username = resolveEnv("NEXTCLOUD_USERNAME");
const appPassword = resolveEnv("NEXTCLOUD_APP_PASSWORD");

if (!baseUrl || !username || !appPassword) {
  console.error("Set NEXTCLOUD_BASE_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_APP_PASSWORD in .env");
  Deno.exit(1);
}

const credentials = btoa(`${username}:${appPassword}`);
const headers = {
  Authorization: `Basic ${credentials}`,
  "OCS-APIRequest": "true",
  Accept: "application/json",
};

function unwrapOcs<T>(body: unknown): T {
  if (body && typeof body === "object" && "ocs" in body) {
    const ocs = (body as { ocs?: { data?: T } }).ocs;
    if (ocs && typeof ocs === "object" && "data" in ocs) return ocs.data as T;
  }
  if (body && typeof body === "object" && "data" in body) return (body as { data: T }).data;
  return body as T;
}

async function listCollectives() {
  const res = await fetch(`${baseUrl}/ocs/v2.php/apps/collectives/api/v1.0/collectives`, { headers });
  if (!res.ok) {
    console.error("Failed to list collectives:", res.status, await res.text());
    Deno.exit(1);
  }
  const data = unwrapOcs<{ collectives?: { id: number; name: string }[] }>(await res.json());
  const list = data?.collectives ?? [];
  if (list.length === 0) {
    console.log("No collectives found (or API returned empty list).");
    return;
  }
  console.log("Collectives (use id for NEXTCLOUD_COLLECTIVE_ID):\n");
  for (const c of list) {
    console.log(`  ${c.id}  ${c.name}`);
  }
  console.log("\nTo list pages in a collective, run:");
  console.log(`  deno run --allow-read --allow-net --allow-env scripts/list-collectives.ts ${list[0].id}`);
}

type PageLike = { id: number; title: string; parentId?: number; pages?: PageLike[] };

function printPages(pages: PageLike[], indent = "") {
  for (const p of pages) {
    console.log(`${indent}  ${p.id}  ${p.title}`);
    if (Array.isArray(p.pages) && p.pages.length > 0) printPages(p.pages, indent + "    ");
  }
}

async function listPages(collectiveId: string) {
  const cId = parseInt(collectiveId, 10);
  if (Number.isNaN(cId)) {
    console.error("Collective id must be a number.");
    Deno.exit(1);
  }
  const res = await fetch(
    `${baseUrl}/ocs/v2.php/apps/collectives/api/v1.0/collectives/${cId}/pages`,
    { headers }
  );
  if (!res.ok) {
    console.error("Failed to list pages:", res.status, await res.text());
    Deno.exit(1);
  }
  const data = unwrapOcs<{ pages?: PageLike[] }>(await res.json());
  const list = data?.pages ?? [];
  if (list.length === 0) {
    console.log("No pages found.");
    return;
  }
  console.log(`Pages in collective ${cId} (use a page id for NEXTCLOUD_COLLECTIVE_PARENT_PAGE_ID):\n`);
  printPages(list);
  console.log("\nUse the id of the page under which new meeting notes should be created (e.g. a 'Meeting Minutes' page).");
}

const collectiveIdArg = Deno.args[0];
if (collectiveIdArg) {
  await listPages(collectiveIdArg);
} else {
  await listCollectives();
}

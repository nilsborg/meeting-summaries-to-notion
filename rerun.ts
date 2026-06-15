/// <reference lib="deno.ns" />

import { config } from "https://deno.land/x/dotenv/mod.ts";
import { loadPrompt } from "./functions/loadPrompt.ts";
import { createNotionDocument } from "./functions/createNotionDocument.ts";
import { createCollectivesDocument } from "./functions/createCollectivesDocument.ts";
import { showNotification } from "./functions/showNotification.ts";
import {
  getFailedFiles,
  logProcessedFile,
} from "./functions/logProcessedFile.ts";
import { getOpenRouterSummary } from "./functions/getOpenRouterSummary.ts";
import {
  MEETING_SUMMARY_MODELS,
  PROJECT_UPDATE_SUMMARY_MODELS,
  type SummaryModelConfig,
} from "./config/summaryModels.ts";
import {
  getSummaryCachePath,
  readCachedSummary,
  writeCachedSummary,
} from "./functions/summaryCache.ts";

const transcriptionFolder =
  "/Users/nilsborg/Repos/meeting-summaries-to-notion/source";
const audioFolder =
  "/Users/nilsborg/Repos/meeting-summaries-to-notion/source-audio";
const promptPaths = {
  meeting: "/Users/nilsborg/Repos/meeting-summaries-to-notion/prompt.md",
  "project-updates":
    "/Users/nilsborg/Repos/meeting-summaries-to-notion/project_updates_prompt.md",
} as const;

type FlowKey = keyof typeof promptPaths;
type SummaryLanguage = "english" | "german";

interface FlowConfig {
  promptFilePath: string;
  notionDatabaseEnvKey: string;
  includeAttendees?: boolean;
  documentTitleBuilder?: (baseName: string) => string;
  summaryModels: SummaryModelConfig[];
  titlePropertyName: string;
  additionalProperties?: Record<string, unknown>;
  notifications: {
    successTitle: string;
    successMessage: string;
    failureTitle: string;
    failureMessage: string;
  };
}

const FLOW_CONFIGS: Record<FlowKey, FlowConfig> = {
  meeting: {
    promptFilePath: promptPaths.meeting,
    notionDatabaseEnvKey: "NOTION_MEETING_DATABASE_ID",
    includeAttendees: true,
    summaryModels: [...MEETING_SUMMARY_MODELS],
    titlePropertyName: "Name",
    documentTitleBuilder: (name) => `Meeting Notes - ${name}`,
    notifications: {
      successTitle: "Document Created",
      successMessage: "Your meeting notes are ready",
      failureTitle: "Notion Error",
      failureMessage: "Failed to create document",
    },
  },
  "project-updates": {
    promptFilePath: promptPaths["project-updates"],
    notionDatabaseEnvKey: "NOTION_PROJECT_UPDATES_DATABASE_ID",
    includeAttendees: false,
    summaryModels: [...PROJECT_UPDATE_SUMMARY_MODELS],
    titlePropertyName: "Title",
    documentTitleBuilder: (name) => `Project Update - ${name}`,
    notifications: {
      successTitle: "Project Update Ready",
      successMessage: "Your project update has been saved",
      failureTitle: "Notion Error",
      failureMessage: "Failed to create project update",
    },
  },
};

const FLOW_ALIASES: Record<string, FlowKey> = {
  meeting: "meeting",
  meetings: "meeting",
  default: "meeting",
  "project-updates": "project-updates",
  "project_updates": "project-updates",
  project: "project-updates",
  projects: "project-updates",
};

// Load environment variables
const env = config({
  path: "/Users/nilsborg/Repos/meeting-summaries-to-notion/.env",
}) as Record<
  string,
  string
>;

const resolveEnv = (key: string): string | undefined => {
  return env[key] ?? Deno.env.get(key);
};

const parseFlowFromArgs = (args: string[]) => {
  let flowArg: string | undefined;
  let langArg: string | undefined;
  const filteredArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--flow" || arg === "-F") {
      flowArg = args[i + 1];
      i++; // Skip next since it's the value
      continue;
    }

    if (arg.startsWith("--flow=")) {
      flowArg = arg.split("=")[1];
      continue;
    }

    if (arg === "--lang" || arg === "-L") {
      langArg = args[i + 1];
      i++;
      continue;
    }

    if (arg.startsWith("--lang=")) {
      langArg = arg.split("=")[1];
      continue;
    }

    filteredArgs.push(arg);
  }

  return { flowArg, langArg, filteredArgs };
};

const { flowArg, langArg, filteredArgs } = parseFlowFromArgs([...Deno.args]);

const rawFlow = (flowArg ?? resolveEnv("FLOW_TYPE") ?? "meeting").trim()
  .toLowerCase();
const flowKey: FlowKey = FLOW_ALIASES[rawFlow] ?? "meeting";
const flowConfig = FLOW_CONFIGS[flowKey];

const OPENROUTER_API_KEY = resolveEnv("OPENROUTER_API_KEY");
const NOTION_API_KEY = resolveEnv("NOTION_API_KEY");
const NOTION_USER_ID = resolveEnv("NOTION_USER_ID");
const notionDatabaseId = resolveEnv(flowConfig.notionDatabaseEnvKey);

const NEXTCLOUD_BASE_URL = resolveEnv("NEXTCLOUD_BASE_URL");
const NEXTCLOUD_USERNAME = resolveEnv("NEXTCLOUD_USERNAME");
const NEXTCLOUD_APP_PASSWORD = resolveEnv("NEXTCLOUD_APP_PASSWORD");
const NEXTCLOUD_COLLECTIVE_ID = resolveEnv("NEXTCLOUD_COLLECTIVE_ID");
const NEXTCLOUD_COLLECTIVE_PARENT_PAGE_ID = resolveEnv(
  "NEXTCLOUD_COLLECTIVE_PARENT_PAGE_ID",
);

const hasNextcloud = NEXTCLOUD_BASE_URL &&
  NEXTCLOUD_USERNAME &&
  NEXTCLOUD_APP_PASSWORD &&
  NEXTCLOUD_COLLECTIVE_ID &&
  NEXTCLOUD_COLLECTIVE_PARENT_PAGE_ID;

const skipNotion = /^(1|true|yes)$/i.test(
  (resolveEnv("SKIP_NOTION") ?? "").trim(),
);

if (!OPENROUTER_API_KEY) {
  console.error("Error: Missing OPENROUTER_API_KEY");
  Deno.exit(1);
}

if (!skipNotion) {
  if (!NOTION_API_KEY) {
    console.error(
      "Error: Missing NOTION_API_KEY (or set SKIP_NOTION=1 to push only to Collectives)",
    );
    Deno.exit(1);
  }
  if (!notionDatabaseId) {
    console.error(
      `Error: Missing env var ${flowConfig.notionDatabaseEnvKey} for flow ${flowKey}`,
    );
    Deno.exit(1);
  }
  if (flowConfig.includeAttendees && !NOTION_USER_ID) {
    console.error("Error: Missing NOTION_USER_ID env var for attendees field");
    Deno.exit(1);
  }
} else if (!hasNextcloud) {
  console.error(
    "Error: SKIP_NOTION is set but Nextcloud Collectives is not configured. Set Nextcloud env vars or unset SKIP_NOTION.",
  );
  Deno.exit(1);
}

const summarizerConfigs = flowConfig.summaryModels;
console.log(`Running rerun flow: ${flowKey}`);

function getSummaryCacheFlowKey(language: SummaryLanguage): string {
  return language === "english" ? flowKey : `${flowKey}-${language}`;
}

function getSummaryLanguageInstruction(language: SummaryLanguage): string {
  return language === "german"
    ? "Write the summary in German. Also translate/adapt all headings and closing text to German."
    : "Write the summary in English. Also translate/adapt all headings and closing text to English.";
}

function getWhisperLanguage(language: SummaryLanguage): string {
  return language === "german" ? "de" : "auto";
}

async function findMatchingFiles(searchTerm: string): Promise<string[]> {
  const matchingFiles: string[] = [];

  try {
    for await (const entry of Deno.readDir(transcriptionFolder)) {
      if (
        entry.isFile &&
        entry.name.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        matchingFiles.push(`${transcriptionFolder}/${entry.name}`);
      }
    }
  } catch (error) {
    console.error("Error reading transcription folder:", error);
    return [];
  }

  return matchingFiles.sort();
}

type MatchItem =
  | { kind: "transcription"; filePath: string; fileName: string }
  | {
    kind: "audio";
    filePath: string;
    fileName: string;
    transcriptionPath: string;
    transcriptionExists: boolean;
  };

async function findMatchingItems(searchTerm: string): Promise<MatchItem[]> {
  const term = searchTerm.toLowerCase();
  const items: MatchItem[] = [];

  // Search transcriptions
  try {
    for await (const entry of Deno.readDir(transcriptionFolder)) {
      if (!entry.isFile) continue;
      if (!entry.name.toLowerCase().includes(term)) continue;
      items.push({
        kind: "transcription",
        filePath: `${transcriptionFolder}/${entry.name}`,
        fileName: entry.name,
      });
    }
  } catch (error) {
    console.error("Error reading transcription folder:", error);
  }

  // Search audio recordings (so you can pass a date and still pick audio → transcribe)
  try {
    for await (const entry of Deno.readDir(audioFolder)) {
      if (!entry.isFile) continue;
      if (!entry.name.toLowerCase().includes(term)) continue;
      const transcriptionPath = `${transcriptionFolder}/${
        getTranscriptionFileNameForAudio(entry.name)
      }`;
      let transcriptionExists = false;
      try {
        await Deno.stat(transcriptionPath);
        transcriptionExists = true;
      } catch {
        transcriptionExists = false;
      }
      items.push({
        kind: "audio",
        filePath: `${audioFolder}/${entry.name}`,
        fileName: entry.name,
        transcriptionPath,
        transcriptionExists,
      });
    }
  } catch {
    // ignore missing audio folder
  }

  return items.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

async function listRecentFiles(count: number = 10): Promise<void> {
  try {
    const entries = [];
    for await (const entry of Deno.readDir(transcriptionFolder)) {
      if (entry.isFile) {
        const filePath = `${transcriptionFolder}/${entry.name}`;
        const fileInfo = await Deno.stat(filePath);
        entries.push({ name: entry.name, mtime: fileInfo.mtime });
      }
    }

    const sortedFiles = entries
      .filter((entry) => entry.mtime)
      .sort((a, b) => b.mtime!.getTime() - a.mtime!.getTime())
      .slice(0, count);

    console.log(`\nMost recent ${count} transcription files:`);
    sortedFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file.name}`);
    });
    console.log();
  } catch (error) {
    console.error("Error listing recent files:", error);
  }
}

type RecentFileEntry = {
  filePath: string;
  fileName: string;
  mtime: Date;
  dayKey: string; // YYYY-MM-DD in local time
};

type RecentRecordingEntry = {
  kind: "transcription" | "audio";
  filePath: string;
  fileName: string;
  mtime: Date;
  dayKey: string; // YYYY-MM-DD in local time
  transcriptionPath?: string; // for audio
  transcriptionExists?: boolean; // for audio
};

function formatLocalDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateFromNameForDayKey(name: string): string | undefined {
  // Extract date from filename like "20250127 1502 ..." (audio or transcription)
  const match = name.match(/^(\d{8})\s+(\d{4})/);
  if (!match) return undefined;
  const dateStr = match[1];
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const day = parseInt(dateStr.substring(6, 8), 10);
  return formatLocalDayKey(new Date(year, month, day));
}

async function getRecentFileEntries(
  count: number = 10,
): Promise<RecentFileEntry[]> {
  const entries: RecentFileEntry[] = [];
  for await (const entry of Deno.readDir(transcriptionFolder)) {
    if (!entry.isFile) continue;
    const filePath = `${transcriptionFolder}/${entry.name}`;
    const fileInfo = await Deno.stat(filePath);
    if (!fileInfo.mtime) continue;
    entries.push({
      filePath,
      fileName: entry.name,
      mtime: fileInfo.mtime,
      dayKey: formatLocalDayKey(fileInfo.mtime),
    });
  }

  return entries
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    .slice(0, count);
}

function getTranscriptionFileNameForAudio(audioFileName: string): string {
  // Prefer the canonical "YYYYMMDD HHMM Transcription.txt" naming convention, even if
  // the audio filename has extra suffixes like "Recording.mp3".
  const match = audioFileName.match(/^(\d{8})\s+(\d{4})/);
  if (match) {
    return `${match[1]} ${match[2]} Transcription.txt`;
  }

  // Fallback: mirror the audio base name.
  const base = audioFileName.replace(/\.[^/.]+$/, "");
  return `${base} Transcription.txt`;
}

function isSupportedWhisperAudio(fileName: string): boolean {
  // whisper-cli supports: flac, mp3, ogg, wav
  // Formats like m4a are supported via ffmpeg conversion in ensureWavInput().
  return /\.(flac|mp3|ogg|wav)$/i.test(fileName);
}

async function resolveWhisperModelPath(): Promise<string> {
  const envModel =
    (resolveEnv("WHISPER_MODEL") ?? resolveEnv("WHISPER_MODEL_PATH") ?? "")
      .trim();
  if (envModel) return envModel;

  const home = Deno.env.get("HOME") ?? "";
  const modelsDir = `${home}/whisper-models`;

  const candidates: { path: string; name: string; mtime: Date }[] = [];
  try {
    for await (const entry of Deno.readDir(modelsDir)) {
      if (!entry.isFile) continue;
      if (!entry.name.endsWith(".bin")) continue;
      const path = `${modelsDir}/${entry.name}`;
      const stat = await Deno.stat(path);
      if (!stat.mtime) continue;
      candidates.push({ path, name: entry.name, mtime: stat.mtime });
    }
  } catch {
    // ignore and fallback below
  }

  const preferredNames = [
    // Default to medium for better accuracy (multilingual).
    "ggml-medium.bin",
    "ggml-large-v3.bin",
    "ggml-large-v3-turbo.bin",
    "ggml-large.bin",
    "ggml-base.bin",
    "ggml-base.en.bin",
    "ggml-small.bin",
    "ggml-tiny.bin",
  ];

  for (const pref of preferredNames) {
    const found = candidates.find((c) => c.name === pref);
    if (found) return found.path;
  }

  const newest =
    candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
  if (newest) return newest.path;

  // whisper-cli default expects models/ggml-base.en.bin, but user said they keep models in ~/whisper-models
  // so throw a clear error if we can't find anything.
  throw new Error(
    `Could not find a Whisper model. Set WHISPER_MODEL_PATH (or WHISPER_MODEL) or place a .bin model in ~/whisper-models`,
  );
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const proc = new Deno.Command("which", {
      args: [cmd],
      stdout: "null",
      stderr: "null",
    }).spawn();
    const status = await proc.status;
    return status.success;
  } catch {
    return false;
  }
}

async function ensureWavInput(
  audioPath: string,
  audioFileName: string,
  opts: { forceWav?: boolean } = {},
): Promise<{ path: string; cleanup?: () => Promise<void> }> {
  if (!opts.forceWav && isSupportedWhisperAudio(audioFileName)) {
    return { path: audioPath };
  }

  // Try best-effort conversion for formats like m4a using ffmpeg (if available)
  const hasFfmpeg = await commandExists("ffmpeg");
  if (!hasFfmpeg) {
    throw new Error(
      `Audio format not supported by whisper-cli (${audioFileName}). Install ffmpeg or convert to wav/mp3/flac/ogg (or m4a via ffmpeg).`,
    );
  }

  const tmpWav = await Deno.makeTempFile({ suffix: ".wav" });
  console.log(`Converting audio to wav for whisper.cpp: ${audioFileName}`);
  const proc = new Deno.Command("ffmpeg", {
    args: ["-y", "-i", audioPath, "-ar", "16000", "-ac", "1", tmpWav],
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  const status = await proc.status;
  if (!status.success) {
    throw new Error(`ffmpeg conversion failed for ${audioFileName}`);
  }

  return {
    path: tmpWav,
    cleanup: async () => {
      try {
        await Deno.remove(tmpWav);
      } catch {
        // ignore
      }
    },
  };
}

async function transcribeAudioToText(
  audioPath: string,
  audioFileName: string,
  opts: {
    force?: boolean;
    forceWav?: boolean;
    summaryLanguage?: SummaryLanguage;
  } = {},
): Promise<string> {
  const transcriptionFileName = getTranscriptionFileNameForAudio(audioFileName);
  const transcriptionPath = `${transcriptionFolder}/${transcriptionFileName}`;

  try {
    const st = await Deno.stat(transcriptionPath);
    if (!opts.force) return transcriptionPath;
    // Best-effort remove so whisper-cli can write cleanly.
    // (If this fails, whisper-cli may still overwrite depending on its behavior.)
    if (st.isFile) {
      try {
        await Deno.remove(transcriptionPath);
      } catch {
        // ignore
      }
    }
  } catch {
    // not present → continue
  }

  const modelPath = await resolveWhisperModelPath();
  const whisperLanguage = getWhisperLanguage(opts.summaryLanguage ?? "english");
  if (whisperLanguage !== "auto" && /\.en\.bin$/i.test(modelPath)) {
    throw new Error(
      `German transcription requires a multilingual Whisper model, but the selected model is English-only: ${modelPath}`,
    );
  }
  const input = await ensureWavInput(audioPath, audioFileName, {
    forceWav: opts.forceWav,
  });

  try {
    console.log(`\nTranscribing audio with whisper.cpp: ${audioFileName}`);
    console.log(`Model: ${modelPath}`);
    console.log(`Language: ${whisperLanguage}`);

    // whisper-cli output path is "without extension"
    const outputBase = transcriptionPath.replace(/\.txt$/i, "");
    const proc = new Deno.Command("whisper-cli", {
      args: [
        "--model",
        modelPath,
        "--file",
        input.path,
        "--language",
        whisperLanguage,
        "--max-context",
        "0",
        "--no-timestamps",
        "--output-txt",
        "--output-file",
        outputBase,
        "--print-progress",
      ],
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();

    const status = await proc.status;
    if (!status.success) {
      throw new Error(`whisper-cli failed for ${audioFileName}`);
    }

    // Verify output exists
    await Deno.stat(transcriptionPath);
    console.log(`\nSaved transcription: ${transcriptionPath}`);

    // If we just (re)generated the transcription, ensure we don't reuse an old cached summary.
    for (const cacheFlowKey of [flowKey, `${flowKey}-german`]) {
      const cachePath = getSummaryCachePath(transcriptionPath, cacheFlowKey);
      try {
        await Deno.remove(cachePath);
        console.log(`Deleted stale summary cache: ${cachePath}`);
      } catch {
        // ignore if missing
      }
    }

    return transcriptionPath;
  } finally {
    if (input.cleanup) await input.cleanup();
  }
}

async function getRecentRecordings(
  count: number = 10,
): Promise<RecentRecordingEntry[]> {
  const audio: RecentRecordingEntry[] = [];
  const transcription: RecentRecordingEntry[] = [];

  // Audio is the canonical "recording" list
  try {
    for await (const entry of Deno.readDir(audioFolder)) {
      if (!entry.isFile) continue;
      const filePath = `${audioFolder}/${entry.name}`;
      const stat = await Deno.stat(filePath);
      if (!stat.mtime) continue;
      const expectedTranscriptionPath = `${transcriptionFolder}/${
        getTranscriptionFileNameForAudio(entry.name)
      }`;
      let transcriptionExists = false;
      try {
        await Deno.stat(expectedTranscriptionPath);
        transcriptionExists = true;
      } catch {
        transcriptionExists = false;
      }
      audio.push({
        kind: "audio",
        filePath,
        fileName: entry.name,
        mtime: stat.mtime,
        dayKey: parseDateFromNameForDayKey(entry.name) ??
          formatLocalDayKey(stat.mtime),
        transcriptionPath: expectedTranscriptionPath,
        transcriptionExists,
      });
    }
  } catch {
    // ignore missing folder
  }

  // Fallback: include transcription files (in case audio is missing for older entries)
  try {
    for await (const entry of Deno.readDir(transcriptionFolder)) {
      if (!entry.isFile) continue;
      const filePath = `${transcriptionFolder}/${entry.name}`;
      const stat = await Deno.stat(filePath);
      if (!stat.mtime) continue;
      transcription.push({
        kind: "transcription",
        filePath,
        fileName: entry.name,
        mtime: stat.mtime,
        dayKey: parseDateFromNameForDayKey(entry.name) ??
          formatLocalDayKey(stat.mtime),
      });
    }
  } catch {
    // ignore
  }

  const byMtimeDesc = (a: RecentRecordingEntry, b: RecentRecordingEntry) =>
    b.mtime.getTime() - a.mtime.getTime();

  const audioSorted = audio.sort(byMtimeDesc);
  const transcriptionSorted = transcription.sort(byMtimeDesc);

  const combined: RecentRecordingEntry[] = [];
  const seenTranscriptions = new Set<string>();

  for (const a of audioSorted) {
    combined.push(a);
    if (a.transcriptionPath) seenTranscriptions.add(a.transcriptionPath);
    if (combined.length >= count) break;
  }

  if (combined.length < count) {
    for (const t of transcriptionSorted) {
      if (seenTranscriptions.has(t.filePath)) continue;
      combined.push(t);
      if (combined.length >= count) break;
    }
  }

  return combined.sort(byMtimeDesc).slice(0, count);
}

async function promptSelectFromRecentFiles(
  count: number = 10,
): Promise<RecentRecordingEntry | undefined> {
  try {
    const recent = await getRecentRecordings(count);
    if (recent.length === 0) {
      console.log(
        `No recordings found in: ${audioFolder} (or transcriptions in: ${transcriptionFolder})`,
      );
      return undefined;
    }

    console.log(
      `\nNo date/search term provided. Pick one of the last ${recent.length} recordings:\n`,
    );

    let currentDay: string | undefined;
    for (let i = 0; i < recent.length; i++) {
      const item = recent[i];
      if (item.dayKey !== currentDay) {
        currentDay = item.dayKey;
        console.log(`${currentDay}`);
      }
      if (item.kind === "audio") {
        const marker = item.transcriptionExists ? "" : " — needs transcription";
        console.log(`  ${i + 1}. ${item.fileName}${marker}`);
      } else {
        console.log(`  ${i + 1}. ${item.fileName}`);
      }
    }

    console.log(
      `\nEnter the number (1-${recent.length}) to process, or press Enter to cancel:`,
    );
    const input = prompt("Selection: ");
    if (!input || input.trim() === "") return undefined;

    const selection = parseInt(input.trim(), 10);
    if (Number.isNaN(selection) || selection < 1 || selection > recent.length) {
      console.log("Invalid selection.");
      return undefined;
    }

    return recent[selection - 1];
  } catch (error) {
    console.error("Error prompting for recent files:", error);
    return undefined;
  }
}

async function listFailedFiles(): Promise<void> {
  try {
    const failedFiles = await getFailedFiles();

    if (failedFiles.length === 0) {
      console.log("\nNo failed files found. ✅");
      return;
    }

    console.log(`\nFound ${failedFiles.length} failed processing attempts:`);
    failedFiles.forEach((record, index) => {
      const date = new Date(record.processedAt).toLocaleString();
      console.log(`${index + 1}. ${record.fileName} (failed: ${date})`);
    });
    console.log();
  } catch (error) {
    console.error("Error listing failed files:", error);
  }
}

function parseSummaryLanguage(value: string | undefined): SummaryLanguage | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;

  if (
    normalized === "2" || normalized === "de" || normalized === "deutsch" ||
    normalized === "german"
  ) {
    return "german";
  }

  if (
    normalized === "1" || normalized === "en" || normalized === "english" ||
    normalized === "englisch"
  ) {
    return "english";
  }

  return undefined;
}

function resolveSummaryLanguage(cliLang?: string): SummaryLanguage {
  const fromCli = parseSummaryLanguage(cliLang);
  if (fromCli) return fromCli;

  const fromEnv = parseSummaryLanguage(resolveEnv("SUMMARY_LANGUAGE"));
  if (fromEnv) return fromEnv;

  console.log("\nLanguage:");
  console.log("  1. English (default)");
  console.log("  2. German");
  const input = prompt("Choose language [1/2, default: 1]: ");
  return parseSummaryLanguage(input) ?? "english";
}

async function processTranscription(
  filePath: string,
  opts: { skipCache?: boolean; summaryLanguage?: SummaryLanguage } = {},
): Promise<void> {
  console.log(`Processing: ${filePath}`);
  const summaryLanguage = opts.summaryLanguage ?? "english";
  const summaryCacheFlowKey = getSummaryCacheFlowKey(summaryLanguage);

  // Check if file exists
  try {
    await Deno.stat(filePath);
  } catch {
    console.error(`File not found: ${filePath}`);
    return;
  }

  let combinedSummary = opts.skipCache
    ? null
    : await readCachedSummary(filePath, summaryCacheFlowKey);
  if (combinedSummary) {
    console.log(
      `Using cached summary from ${
        getSummaryCachePath(filePath, summaryCacheFlowKey)
      }`,
    );
  } else {
    // Read file contents
    let fileContents: string;
    try {
      fileContents = await Deno.readTextFile(filePath);
      console.log(`File contents loaded (${fileContents.length} characters)`);
    } catch (error) {
      console.error("Error reading file:", error);
      return;
    }

    // Load prompt and get summary
    const basePrompt = await loadPrompt(flowConfig.promptFilePath);
    const languageInstruction = getSummaryLanguageInstruction(summaryLanguage);
    const systemPrompt =
      `${basePrompt.trim()}\n\nAdditional rerun instruction:\n${languageInstruction}`;
    const summaries: { label: string; content: string }[] = [];

    for (const config of summarizerConfigs) {
      try {
        console.log(
          `Generating summary with ${config.label} (${config.model})...`,
        );
        const content = await getOpenRouterSummary({
          systemPrompt,
          content: fileContents,
          apiKey: OPENROUTER_API_KEY!,
          model: config.model,
        });
        summaries.push({ label: config.label, content });
        console.log(`${config.label} summary generated successfully`);
      } catch (error) {
        console.error(
          `Error during summarization with ${config.label} (${config.model}):`,
          error,
        );
        await logProcessedFile(filePath, false, undefined, flowKey);
        await showNotification(
          "Transcription Error",
          `Failed to generate ${config.label}`,
        );
        return;
      }
    }

    const hasMultipleSummaries = summaries.length > 1;
    combinedSummary = hasMultipleSummaries
      ? summaries
        .map((summary) => `## ${summary.label}\n\n${summary.content.trim()}`)
        .join("\n\n")
      : (summaries[0]?.content.trim() ?? "");

    const cachePath = await writeCachedSummary(
      filePath,
      summaryCacheFlowKey,
      combinedSummary,
    );
    console.log(`Saved summary cache: ${cachePath}`);
  }

  // Create document (Notion and/or Collectives)
  const fileName = filePath.split("/").pop() || "Unknown";
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  const documentTitle = flowConfig.documentTitleBuilder
    ? flowConfig.documentTitleBuilder(baseName)
    : `Summary - ${baseName}`;

  let documentUrl: string | undefined;

  try {
    if (!skipNotion) {
      console.log("Creating Notion document...");
      const notionUserIdForDoc = flowConfig.includeAttendees
        ? NOTION_USER_ID
        : undefined;
      documentUrl = await createNotionDocument(
        documentTitle,
        combinedSummary,
        notionUserIdForDoc,
        notionDatabaseId!,
        NOTION_API_KEY!,
        {
          includeAttendees: flowConfig.includeAttendees,
          titlePropertyName: flowConfig.titlePropertyName,
          additionalProperties: flowConfig.additionalProperties,
        },
      );
    }

    if (hasNextcloud) {
      try {
        const collectivesUrl = await createCollectivesDocument(
          documentTitle,
          combinedSummary,
          {
            baseUrl: NEXTCLOUD_BASE_URL!,
            username: NEXTCLOUD_USERNAME!,
            appPassword: NEXTCLOUD_APP_PASSWORD!,
            collectiveId: NEXTCLOUD_COLLECTIVE_ID!,
            parentPageId: NEXTCLOUD_COLLECTIVE_PARENT_PAGE_ID!,
          },
        );
        console.log("Collectives URL:", collectivesUrl);
        if (!documentUrl) documentUrl = collectivesUrl;
      } catch (collectivesError) {
        if (!skipNotion) {
          console.warn(
            "Nextcloud Collectives push failed (Notion succeeded):",
            collectivesError,
          );
        } else {
          throw collectivesError;
        }
      }
    }

    console.log(`✅ Success! Document created: ${documentUrl ?? "(no URL)"}`);
    await logProcessedFile(filePath, true, documentUrl, flowKey);
    await showNotification(
      flowConfig.notifications.successTitle,
      flowConfig.notifications.successMessage,
      documentUrl ?? "",
    );
  } catch (error) {
    console.error(
      skipNotion
        ? "Error creating Collectives document:"
        : "Error creating Notion document:",
      error,
    );
    await logProcessedFile(filePath, false, undefined, flowKey);
    await showNotification(
      flowConfig.notifications.failureTitle,
      flowConfig.notifications.failureMessage,
    );
  }
}

function showUsage(): void {
  console.log(`
Usage: deno run --allow-all rerun.ts [OPTIONS] [SEARCH_TERM]

OPTIONS:
  -h, --help     Show this help message
  -l, --list     List the 10 most recent transcription files
  -f, --failed   List files that failed to process previously
  -F, --flow     Specify the processing flow (meeting, project-updates)
  -L, --lang     Summary language (english|german, or en|de). Skips interactive prompt.
      --force-transcribe  Force re-transcription from audio (when selecting audio)
      --force-wav         Always convert audio to 16kHz mono wav before whisper.cpp

SEARCH_TERM:
  Partial filename or date pattern to match transcription files.
  If omitted, you'll be prompted to select from the last 10 recordings (grouped by day).

Examples:
  deno run --allow-all rerun.ts "20250127"              # Files from Jan 27, 2025
  deno run --allow-all rerun.ts "20250127 1502"        # Specific file by date and time
  deno run --allow-all rerun.ts "Transcription.txt"    # All standard transcription files
  deno run --allow-all rerun.ts --list                 # Show recent files
  deno run --allow-all rerun.ts --failed               # Show previously failed files
  deno run --allow-all rerun.ts --flow project-updates "20250127"
  deno run --allow-all rerun.ts                        # Pick from last 10 recordings

If multiple files match, you'll be prompted to select one.
`);
}

async function main() {
  const rawArgs = filteredArgs;

  if (rawArgs.includes("-h") || rawArgs.includes("--help")) {
    showUsage();
    return;
  }

  const forceTranscribe = rawArgs.includes("--force-transcribe");
  const forceWav = rawArgs.includes("--force-wav");

  // Filter out known flags so positional args are usable in any order.
  const args = rawArgs.filter((a, index, all) =>
    a !== "--force-transcribe" &&
    a !== "--force-wav" &&
    a !== "-l" &&
    a !== "--list" &&
    a !== "-f" &&
    a !== "--failed" &&
    a !== "--lang" &&
    a !== "-L" &&
    !a.startsWith("--lang=") &&
    !(index > 0 && (all[index - 1] === "--lang" || all[index - 1] === "-L"))
  );

  if (rawArgs.includes("-l") || rawArgs.includes("--list")) {
    await listRecentFiles();
    return;
  }

  if (rawArgs.includes("-f") || rawArgs.includes("--failed")) {
    await listFailedFiles();
    return;
  }

  if (args.length === 0) {
    const selected = await promptSelectFromRecentFiles(10);
    if (!selected) {
      console.log("Cancelled.");
      return;
    }
    const summaryLanguage = resolveSummaryLanguage(langArg);
    if (selected.kind === "audio") {
      // Selecting audio from the picker always re-transcribes to ensure the transcription matches the recording.
      const transcriptionPath = await transcribeAudioToText(
        selected.filePath,
        selected.fileName,
        { force: true, forceWav, summaryLanguage },
      );
      await processTranscription(transcriptionPath, {
        skipCache: true,
        summaryLanguage,
      });
    } else {
      await processTranscription(selected.filePath, { summaryLanguage });
    }
    return;
  }

  const searchTerm = args[0];
  const matchingItems = await findMatchingItems(searchTerm);

  if (matchingItems.length === 0) {
    console.log(`No files found matching: "${searchTerm}"`);
    console.log(
      "\nTry using --list to see recent files, or use a broader search term.",
    );
    return;
  }

  if (matchingItems.length === 1) {
    const item = matchingItems[0];
    const summaryLanguage = resolveSummaryLanguage(langArg);
    if (item.kind === "audio") {
      const transcriptionPath = await transcribeAudioToText(
        item.filePath,
        item.fileName,
        { force: true, forceWav, summaryLanguage },
      );
      await processTranscription(transcriptionPath, {
        skipCache: true,
        summaryLanguage,
      });
    } else {
      await processTranscription(item.filePath, { summaryLanguage });
    }
    return;
  }

  // Multiple matches - let user choose
  console.log(`Found ${matchingItems.length} matching files:`);
  matchingItems.forEach((item, index) => {
    if (item.kind === "audio") {
      const marker = item.transcriptionExists ? "" : " — needs transcription";
      console.log(`${index + 1}. ${item.fileName}${marker}`);
    } else {
      console.log(`${index + 1}. ${item.fileName}`);
    }
  });

  console.log(
    `\nEnter the number (1-${matchingItems.length}) to process, or press Enter to cancel:`,
  );

  const input = prompt("Selection: ");

  if (!input || input.trim() === "") {
    console.log("Cancelled.");
    return;
  }

  const selection = parseInt(input.trim());
  if (isNaN(selection) || selection < 1 || selection > matchingItems.length) {
    console.log("Invalid selection.");
    return;
  }

  const item = matchingItems[selection - 1];
  const summaryLanguage = resolveSummaryLanguage(langArg);
  if (item.kind === "audio") {
    const transcriptionPath = await transcribeAudioToText(
      item.filePath,
      item.fileName,
      { force: true, forceWav, summaryLanguage },
    );
    await processTranscription(transcriptionPath, {
      skipCache: true,
      summaryLanguage,
    });
  } else {
    await processTranscription(item.filePath, { summaryLanguage });
  }
}

main().catch(async (error) => {
  console.error("An error occurred:", error);
  await showNotification("Script Error", "An unexpected error occurred");
});

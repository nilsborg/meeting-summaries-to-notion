/// <reference lib="deno.ns" />

import { config } from "https://deno.land/x/dotenv/mod.ts";
import { getLatestFile } from "./functions/getLatestFile.ts";
import { loadPrompt } from "./functions/loadPrompt.ts";
import { createNotionDocument } from "./functions/createNotionDocument.ts";
import { createCollectivesDocument } from "./functions/createCollectivesDocument.ts";
import { showNotification } from "./functions/showNotification.ts";
import { logProcessedFile } from "./functions/logProcessedFile.ts";
import { getOpenRouterSummary } from "./functions/getOpenRouterSummary.ts";
import {
  getSummaryCachePath,
  readCachedSummary,
  writeCachedSummary,
} from "./functions/summaryCache.ts";
import {
  MEETING_SUMMARY_MODELS,
  PROJECT_UPDATE_SUMMARY_MODELS,
  type SummaryModelConfig,
} from "./config/summaryModels.ts";

const transcriptionFolder = "/Users/nilsborg/Repos/meeting-summaries-to-notion/source";
const promptPaths = {
  meeting: "/Users/nilsborg/Repos/meeting-summaries-to-notion/prompt.md",
  "project-updates": "/Users/nilsborg/Repos/meeting-summaries-to-notion/project_updates_prompt.md",
} as const;

type FlowKey = keyof typeof promptPaths;

interface FlowConfig {
  promptFilePath: string;
  notionDatabaseEnvKey: string;
  includeAttendees?: boolean;
  documentTitleBuilder?: () => string;
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
    documentTitleBuilder: () =>
      "Meeting Notes - " + new Date().toLocaleDateString(),
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
    documentTitleBuilder: () =>
      "Project Updates - " + new Date().toLocaleDateString(),
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
  project_updates: "project-updates",
  project: "project-updates",
  projects: "project-updates",
};

// Load environment variables
// Explicitly specify the path to the .env file
const env = config({ path: "/Users/nilsborg/Repos/meeting-summaries-to-notion/.env" }) as Record<
  string,
  string
>;

const resolveEnv = (key: string): string | undefined => {
  return env[key] ?? Deno.env.get(key);
};

const rawFlow = (Deno.args[0] ?? resolveEnv("FLOW_TYPE") ?? "meeting")
  .trim()
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
const NEXTCLOUD_COLLECTIVE_PARENT_PAGE_ID = resolveEnv("NEXTCLOUD_COLLECTIVE_PARENT_PAGE_ID");

const hasNextcloud =
  NEXTCLOUD_BASE_URL && NEXTCLOUD_USERNAME && NEXTCLOUD_APP_PASSWORD && NEXTCLOUD_COLLECTIVE_ID && NEXTCLOUD_COLLECTIVE_PARENT_PAGE_ID;

const skipNotion = /^(1|true|yes)$/i.test((resolveEnv("SKIP_NOTION") ?? "").trim());

if (!OPENROUTER_API_KEY) {
  console.error("Error: Missing OPENROUTER_API_KEY");
  Deno.exit(1);
}

if (!skipNotion) {
  if (!NOTION_API_KEY) {
    console.error("Error: Missing NOTION_API_KEY (or set SKIP_NOTION=1 to push only to Collectives)");
    Deno.exit(1);
  }
  if (!notionDatabaseId) {
    console.error(
      `Error: Missing env var ${flowConfig.notionDatabaseEnvKey} for flow ${flowKey}`
    );
    Deno.exit(1);
  }
  if (flowConfig.includeAttendees && !NOTION_USER_ID) {
    console.error("Error: Missing NOTION_USER_ID env var for attendees field");
    Deno.exit(1);
  }
} else if (!hasNextcloud) {
  console.error("Error: SKIP_NOTION is set but Nextcloud Collectives is not configured. Set Nextcloud env vars or unset SKIP_NOTION.");
  Deno.exit(1);
}

const summarizerConfigs = flowConfig.summaryModels;

console.log(`Running flow: ${flowKey}`);

async function main() {
  // 1. Get the latest transcription file
  const latestFile = await getLatestFile(transcriptionFolder);

  if (latestFile) {
    console.log(`Latest file: ${latestFile}`);

    let combinedSummary = await readCachedSummary(latestFile, flowKey);
    if (combinedSummary) {
      console.log(`Using cached summary from ${getSummaryCachePath(latestFile, flowKey)}`);
    } else {
      // 2. Read the contents of the latest file
      const fileContents = await Deno.readTextFile(latestFile);
      console.log(`Contents of the latest file:\n${fileContents}`);

      // 3. Send file contents to AI for summarization
      const basePrompt = await loadPrompt(flowConfig.promptFilePath);
      const summaries: { label: string; content: string }[] = [];

      for (const config of summarizerConfigs) {
        try {
          const content = await getOpenRouterSummary({
            systemPrompt: basePrompt,
            content: fileContents,
            apiKey: OPENROUTER_API_KEY!,
            model: config.model,
          });
          console.log(`${config.label} received:`, content);
          summaries.push({ label: config.label, content });
        } catch (error) {
          console.error(
            `Error during summarization with ${config.label} (${config.model}):`,
            error
          );
          await logProcessedFile(latestFile, false, undefined, flowKey);
          await showNotification(
            "Transcription Error",
            `Failed to generate ${config.label}`
          );
          Deno.exit();
        }
      }

      const hasMultipleSummaries = summaries.length > 1;
      combinedSummary = hasMultipleSummaries
        ? summaries
          .map((summary) => `## ${summary.label}\n\n${summary.content.trim()}`)
          .join("\n\n")
        : (summaries[0]?.content.trim() ?? "");

      const cachePath = await writeCachedSummary(latestFile, flowKey, combinedSummary);
      console.log(`Saved summary cache: ${cachePath}`);
    }

    // 4. Save summary (Notion and/or Collectives)
    const documentTitle = flowConfig.documentTitleBuilder
      ? flowConfig.documentTitleBuilder()
      : "Summary - " + new Date().toLocaleDateString();

    let documentUrl: string | undefined;

    try {
      if (!skipNotion) {
        documentUrl = await createNotionDocument(
          documentTitle,
          combinedSummary,
          NOTION_USER_ID,
          notionDatabaseId!,
          NOTION_API_KEY!,
          {
            includeAttendees: flowConfig.includeAttendees,
            titlePropertyName: flowConfig.titlePropertyName,
            additionalProperties: flowConfig.additionalProperties,
          }
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
            }
          );
          console.log("Collectives URL:", collectivesUrl);
          if (!documentUrl) documentUrl = collectivesUrl;
        } catch (collectivesError) {
          if (!skipNotion) {
            console.warn("Nextcloud Collectives push failed (Notion succeeded):", collectivesError);
          } else {
            throw collectivesError;
          }
        }
      }

      await logProcessedFile(latestFile, true, documentUrl, flowKey);
      await showNotification(
        flowConfig.notifications.successTitle,
        flowConfig.notifications.successMessage,
        documentUrl ?? ""
      );
    } catch (error) {
      console.error(skipNotion ? "Error creating Collectives document:" : "Error creating Notion document:", error);
      await logProcessedFile(latestFile, false, undefined, flowKey);
      await showNotification(
        flowConfig.notifications.failureTitle,
        flowConfig.notifications.failureMessage
      );
      Deno.exit();
    }
  } else {
    console.error("No valid files found in the folder.");
    await showNotification("Error", "No transcription files found");
    Deno.exit();
  }
}

main().catch(async (error) => {
  console.error("An error occurred:", error);
  await showNotification("Script Error", "An unexpected error occurred");
});

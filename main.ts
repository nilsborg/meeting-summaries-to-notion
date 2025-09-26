/// <reference lib="deno.ns" />

import { config } from "https://deno.land/x/dotenv/mod.ts";
import { getLatestFile } from "./functions/getLatestFile.ts";
import { loadPrompt } from "./functions/loadPrompt.ts";
import { createNotionDocument } from "./functions/createNotionDocument.ts";
import { showNotification } from "./functions/showNotification.ts";
import { logProcessedFile } from "./functions/logProcessedFile.ts";
import { getOpenRouterSummary } from "./functions/getOpenRouterSummary.ts";
import { getSummaryModelConfigs } from "./functions/getSummaryModelConfigs.ts";

const transcriptionFolder = "/Users/nilsborg/Transscripts/source";
const promptFilePath = "/Users/nilsborg/Transscripts/prompt.md"; // Path to your prompt file

// Load environment variables
// Explicitly specify the path to the .env file
const env = config({ path: "/Users/nilsborg/Transscripts/.env" });
const {
  OPENROUTER_API_KEY,
  OPENROUTER_SUMMARY_MODELS,
  NOTION_API_KEY,
  NOTION_DATABASE_ID,
  NOTION_USER_ID,
} = env;

if (
  !OPENROUTER_API_KEY ||
  !NOTION_API_KEY ||
  !NOTION_DATABASE_ID ||
  !NOTION_USER_ID
) {
  console.error("Error: Missing env vars");
  Deno.exit(1);
}

const summarizerConfigs = getSummaryModelConfigs(OPENROUTER_SUMMARY_MODELS);

async function main() {
  // 1. Get the latest transcription file
  const latestFile = await getLatestFile(transcriptionFolder);

  if (latestFile) {
    console.log(`Latest file: ${latestFile}`);

    // 2. Read the contents of the latest file
    const fileContents = await Deno.readTextFile(latestFile);
    console.log(`Contents of the latest file:\n${fileContents}`);

    // 3. Send file contents to Ai for summarization
    const basePrompt = await loadPrompt(promptFilePath);
    const summaries: { label: string; content: string }[] = [];

    for (const config of summarizerConfigs) {
      try {
        const content = await getOpenRouterSummary({
          systemPrompt: basePrompt,
          content: fileContents,
          apiKey: OPENROUTER_API_KEY,
          model: config.model,
        });
        console.log(`${config.label} received:`, content);
        summaries.push({ label: config.label, content });
      } catch (error) {
        console.error(
          `Error during summarization with ${config.label} (${config.model}):`,
          error,
        );
        await logProcessedFile(latestFile, false);
        await showNotification(
          "Transcription Error",
          `Failed to generate ${config.label}`,
        );
        Deno.exit();
      }
    }

    const combinedSummary = summaries
      .map((summary) => `## ${summary.label}\n\n${summary.content.trim()}`)
      .join("\n\n");

    // 4. Save summary to Notion
    const documentTitle = "Meeting Notes - " + new Date().toLocaleDateString();

    try {
      const documentUrl = await createNotionDocument(
        documentTitle,
        combinedSummary,
        NOTION_USER_ID,
        NOTION_DATABASE_ID,
        NOTION_API_KEY,
      );
      await logProcessedFile(latestFile, true, documentUrl);
      await showNotification(
        "Document Created",
        "Your meeting notes are ready",
        documentUrl,
      );
    } catch (error) {
      console.error("Error creating Notion document:", error);
      await logProcessedFile(latestFile, false);
      await showNotification("Notion Error", "Failed to create document");
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

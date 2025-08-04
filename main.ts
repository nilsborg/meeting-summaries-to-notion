/// <reference lib="deno.ns" />

import { config } from "https://deno.land/x/dotenv/mod.ts";
import { getLatestFile } from "./functions/getLatestFile.ts";
import { loadPrompt } from "./functions/loadPrompt.ts";
// import { getChatGPTSummary } from "./functions/getChatGPTSummary.ts";
import { createNotionDocument } from "./functions/createNotionDocument.ts";
import { getClaudeSummary } from "./functions/getClaudeSummary.ts";
import { showNotification } from "./functions/showNotification.ts";
import { logProcessedFile } from "./functions/logProcessedFile.ts";

const transcriptionFolder = "/Users/nilsborg/Transscripts/source";
const promptFilePath = "/Users/nilsborg/Transscripts/prompt.md"; // Path to your prompt file

// Load environment variables
// Explicitly specify the path to the .env file
const env = config({ path: "/Users/nilsborg/Transscripts/.env" });
const {
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
  NOTION_API_KEY,
  NOTION_DATABASE_ID,
  NOTION_USER_ID,
} = env;

if (
  !OPENAI_API_KEY ||
  !NOTION_API_KEY ||
  !NOTION_DATABASE_ID ||
  !NOTION_USER_ID
) {
  console.error("Error: Missing env vars");
  Deno.exit(1);
}

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
    // const prompt = `${basePrompt}\n\n---\n\n${fileContents}`;
    let summary;

    try {
      summary = await getClaudeSummary(
        basePrompt,
        fileContents,
        ANTHROPIC_API_KEY,
      );
      console.log("Summary received:", summary);
    } catch (error) {
      console.error("Error during summarization:", error);
      await logProcessedFile(latestFile, false);
      await showNotification(
        "Transcription Error",
        "Failed to generate summary",
      );
      Deno.exit();
    }

    // 4. Save summary to Notion
    const documentTitle = "Meeting Notes - " + new Date().toLocaleDateString();

    try {
      const documentUrl = await createNotionDocument(
        documentTitle,
        summary,
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

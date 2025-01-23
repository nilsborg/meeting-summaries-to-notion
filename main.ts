/// <reference lib="deno.ns" />

import { config } from "https://deno.land/x/dotenv/mod.ts";
import { getLatestFile } from "./functions/getLatestFile.ts";
import { loadPrompt } from "./functions/loadPrompt.ts";
// import { getChatGPTSummary } from "./functions/getChatGPTSummary.ts";
import { createNotionDocument } from "./functions/createNotionDocument.ts";
import { getClaudeSummary } from "./functions/getClaudeSummary.ts";

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
    const prompt = `${basePrompt}\n\n---\n\n${fileContents}`;
    let summary;

    try {
      // summary = await getChatGPTSummary(prompt, OPENAI_API_KEY);
      summary = await getClaudeSummary(prompt, ANTHROPIC_API_KEY);
      console.log("Summary received:", summary);
    } catch (error) {
      console.error("Error during summarization:", error);
    }

    if (!summary) {
      console.error("Error: Summary is empty.");
      return;
    }

    // 4. Save summary to Notion
    const documentTitle = "Meeting Notes - " + new Date().toLocaleDateString();

    try {
      await createNotionDocument(
        documentTitle,
        summary,
        NOTION_USER_ID,
        NOTION_DATABASE_ID,
        NOTION_API_KEY
      );
    } catch (error) {
      console.error("Error creating Notion document:", error);
    }
  } else {
    console.log("No valid files found in the folder.");
  }
}

main().catch((error) => console.error("An error occurred:", error));

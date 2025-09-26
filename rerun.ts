/// <reference lib="deno.ns" />

import { config } from "https://deno.land/x/dotenv/mod.ts";
import { loadPrompt } from "./functions/loadPrompt.ts";
import { createNotionDocument } from "./functions/createNotionDocument.ts";
import { showNotification } from "./functions/showNotification.ts";
import {
  getFailedFiles,
  logProcessedFile,
} from "./functions/logProcessedFile.ts";
import { getOpenRouterSummary } from "./functions/getOpenRouterSummary.ts";
import { getSummaryModelConfigs } from "./functions/getSummaryModelConfigs.ts";

const transcriptionFolder = "/Users/nilsborg/Transscripts/source";
const promptFilePath = "/Users/nilsborg/Transscripts/prompt.md";

// Load environment variables
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

async function processTranscription(filePath: string): Promise<void> {
  console.log(`Processing: ${filePath}`);

  // Check if file exists
  try {
    await Deno.stat(filePath);
  } catch {
    console.error(`File not found: ${filePath}`);
    return;
  }

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
  const basePrompt = await loadPrompt(promptFilePath);
  const summaries: { label: string; content: string }[] = [];

  for (const config of summarizerConfigs) {
    try {
      console.log(
        `Generating summary with ${config.label} (${config.model})...`,
      );
      const content = await getOpenRouterSummary({
        systemPrompt: basePrompt,
        content: fileContents,
        apiKey: OPENROUTER_API_KEY,
        model: config.model,
      });
      summaries.push({ label: config.label, content });
      console.log(`${config.label} summary generated successfully`);
    } catch (error) {
      console.error(
        `Error during summarization with ${config.label} (${config.model}):`,
        error,
      );
      await logProcessedFile(filePath, false);
      await showNotification(
        "Transcription Error",
        `Failed to generate ${config.label}`,
      );
      return;
    }
  }

  const combinedSummary = summaries
    .map((summary) => `## ${summary.label}\n\n${summary.content.trim()}`)
    .join("\n\n");

  // Create Notion document
  const fileName = filePath.split("/").pop() || "Unknown";
  const documentTitle = `Meeting Notes - ${fileName.replace(".txt", "")}`;

  try {
    console.log("Creating Notion document...");
    const documentUrl = await createNotionDocument(
      documentTitle,
      combinedSummary,
      NOTION_USER_ID,
      NOTION_DATABASE_ID,
      NOTION_API_KEY,
    );

    console.log(`✅ Success! Document created: ${documentUrl}`);
    await logProcessedFile(filePath, true, documentUrl);
    await showNotification(
      "Document Created",
      "Your meeting notes are ready",
      documentUrl,
    );
  } catch (error) {
    console.error("Error creating Notion document:", error);
    await logProcessedFile(filePath, false);
    await showNotification("Notion Error", "Failed to create document");
  }
}

function showUsage(): void {
  console.log(`
Usage: deno run --allow-all rerun.ts [OPTIONS] [SEARCH_TERM]

OPTIONS:
  -h, --help     Show this help message
  -l, --list     List the 10 most recent transcription files
  -f, --failed   List files that failed to process previously

SEARCH_TERM:
  Partial filename or date pattern to match transcription files.

Examples:
  deno run --allow-all rerun.ts "20250127"              # Files from Jan 27, 2025
  deno run --allow-all rerun.ts "20250127 1502"        # Specific file by date and time
  deno run --allow-all rerun.ts "Transcription.txt"    # All standard transcription files
  deno run --allow-all rerun.ts --list                 # Show recent files
  deno run --allow-all rerun.ts --failed               # Show previously failed files

If multiple files match, you'll be prompted to select one.
`);
}

async function main() {
  const args = Deno.args;

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    showUsage();
    return;
  }

  if (args.includes("-l") || args.includes("--list")) {
    await listRecentFiles();
    return;
  }

  if (args.includes("-f") || args.includes("--failed")) {
    await listFailedFiles();
    return;
  }

  const searchTerm = args[0];
  const matchingFiles = await findMatchingFiles(searchTerm);

  if (matchingFiles.length === 0) {
    console.log(`No files found matching: "${searchTerm}"`);
    console.log(
      "\nTry using --list to see recent files, or use a broader search term.",
    );
    return;
  }

  if (matchingFiles.length === 1) {
    await processTranscription(matchingFiles[0]);
    return;
  }

  // Multiple matches - let user choose
  console.log(`Found ${matchingFiles.length} matching files:`);
  matchingFiles.forEach((file, index) => {
    const fileName = file.split("/").pop();
    console.log(`${index + 1}. ${fileName}`);
  });

  console.log(
    `\nEnter the number (1-${matchingFiles.length}) to process, or press Enter to cancel:`,
  );

  const input = prompt("Selection: ");

  if (!input || input.trim() === "") {
    console.log("Cancelled.");
    return;
  }

  const selection = parseInt(input.trim());
  if (isNaN(selection) || selection < 1 || selection > matchingFiles.length) {
    console.log("Invalid selection.");
    return;
  }

  await processTranscription(matchingFiles[selection - 1]);
}

main().catch(async (error) => {
  console.error("An error occurred:", error);
  await showNotification("Script Error", "An unexpected error occurred");
});

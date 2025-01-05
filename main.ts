/// <reference lib="deno.ns" />

import { config } from "https://deno.land/x/dotenv/mod.ts";
import { getLatestFile } from "./functions/getLatestFile.ts";
import { loadPrompt } from "./functions/loadPrompt.ts";
import { getChatGPTSummary } from "./functions/getChatGPTSummary.ts";

const transcriptionFolder = "/Users/nilsborg/Transscripts/source";
const promptFilePath = "/Users/nilsborg/Transscripts/prompt.md"; // Path to your prompt file
const outputFilePath = "/Users/nilsborg/Transscripts/summary.txt"; // File to save the summary

// Load environment variables
const env = config();
const apiKey = env.OPENAI_API_KEY; // The API key is read from the .env file

if (!apiKey) {
  console.error("Error: Missing OPENAI_API_KEY in the environment file.");
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

    // 3. Send file contents to ChatGPT for summarization
    const basePrompt = await loadPrompt(promptFilePath);
    const prompt = `${basePrompt}\n\n---\n\n${fileContents}`;

    console.log("Sending content to ChatGPT for summarization...");
    try {
      const summary = await getChatGPTSummary(prompt, apiKey);
      console.log("Summary received. Writing to output file...");
      await Deno.writeTextFile(outputFilePath, summary);
      console.log(`Summary saved to ${outputFilePath}`);
    } catch (error) {
      console.error("Error during ChatGPT summarization:", error);
    }
  } else {
    console.log("No valid files found in the folder.");
  }
}

main().catch((error) => console.error("An error occurred:", error));

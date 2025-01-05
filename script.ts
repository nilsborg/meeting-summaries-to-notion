/// <reference lib="deno.ns" />

import { config } from "https://deno.land/x/dotenv/mod.ts";

const transcriptionFolder = "/Users/nilsborg/Transscripts/source";
const apiKey = ""; // Replace with your OpenAI API key
const promptFilePath = "/Users/nilsborg/Transscripts/prompt.md"; // Path to your prompt file
const outputFilePath = "/Users/nilsborg/Transscripts/summary.txt"; // File to save the summary

// Load environment variables
const env = config();
const apiKey = env.OPENAI_API_KEY; // The API key is read from the .env file

if (!apiKey) {
  console.error("Error: Missing OPENAI_API_KEY in the environment file.");
  Deno.exit(1);
}

async function getLatestFile(folder: string): Promise<string | null> {
  try {
    const entries = [];
    for await (const entry of Deno.readDir(folder)) {
      if (entry.isFile) {
        const filePath = `${folder}/${entry.name}`;
        const fileInfo = await Deno.stat(filePath);
        entries.push({ file: filePath, mtime: fileInfo.mtime });
      }
    }

    const sortedFiles = entries
      .filter((entry) => entry.mtime) // Ensure mtime is not null
      .sort((a, b) => b.mtime!.getTime() - a.mtime!.getTime());

    return sortedFiles.length > 0 ? sortedFiles[0].file : null;
  } catch (error) {
    console.error("Error retrieving the latest file:", error);
    return null;
  }
}

async function loadPrompt(): Promise<string> {
  try {
    const prompt = await Deno.readTextFile(promptFilePath);
    console.log("Loaded prompt from file.");
    return prompt;
  } catch (error) {
    console.error("Error loading prompt file:", error);
    throw error;
  }
}

async function sendToChatGPT(prompt: string): Promise<string> {
  const apiUrl = "https://api.openai.com/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const body = {
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant summarizing meeting transcripts.",
      },
      { role: "user", content: prompt },
    ],
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.statusText}, ${errorText}`);
  }

  const jsonResponse = await response.json();
  const summary = jsonResponse.choices[0].message.content;
  return summary;
}

async function main() {
  const latestFile = await getLatestFile(transcriptionFolder);
  if (latestFile) {
    console.log(`Latest file: ${latestFile}`);

    // Read the contents of the latest file
    const fileContents = await Deno.readTextFile(latestFile);
    console.log(`Contents of the latest file:\n${fileContents}`);

    // Load the prompt
    const basePrompt = await loadPrompt();
    const prompt = `${basePrompt}\n\n---\n\n${fileContents}`;

    console.log("Sending content to ChatGPT for summarization...");
    try {
      const summary = await sendToChatGPT(prompt);
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

export async function loadPrompt(promptFilePath: string): Promise<string> {
  try {
    const prompt = await Deno.readTextFile(promptFilePath);
    console.log("Loaded prompt from file.");
    return prompt;
  } catch (error) {
    console.error("Error loading prompt file:", error);
    throw error;
  }
}

export async function getClaudeSummary(
  prompt: string,
  apiKey: string
): Promise<string> {
  console.log("Sending content to Claude for summarization...");

  const apiUrl = "https://api.anthropic.com/v1/messages";
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  const body = {
    model: "claude-3-5-sonnet-latest",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    system: "You are a helpful assistant summarizing meeting transcripts.",
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.statusText}, ${errorText}`);
  }

  const jsonResponse = await response.json();
  const summary = jsonResponse.content[0].text;
  return summary;
}

export async function getChatGPTSummary(
  prompt: string,
  apiKey: string
): Promise<string> {
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

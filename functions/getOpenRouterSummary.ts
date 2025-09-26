export interface OpenRouterSummaryOptions {
  systemPrompt: string;
  content: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export async function getOpenRouterSummary(
  options: OpenRouterSummaryOptions,
): Promise<string> {
  const {
    systemPrompt,
    content,
    apiKey,
    model,
    maxTokens = 4096,
    temperature = 0.2,
  } = options;

  console.log(`Sending content to OpenRouter (${model}) for summarization...`);

  const apiUrl = "https://openrouter.ai/api/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-Title": "Transscripts Summarizer",
  };

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content:
          "Summarize the following meeting transcript using your system instructions:\n\n" +
          content,
      },
    ],
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter API error (${model}): ${response.statusText}, ${errorText}`,
    );
  }

  const jsonResponse = await response.json();
  const summary = jsonResponse.choices?.[0]?.message?.content?.trim();

  if (!summary) {
    throw new Error(
      `OpenRouter API error (${model}): No content returned in response`,
    );
  }

  return summary;
}

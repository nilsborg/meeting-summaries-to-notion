function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeRequestWithRetry(
  apiUrl: string,
  headers: HeadersInit,
  body: any,
  maxRetries = 3,
  delayMs = 30000
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorData = JSON.parse(errorText);

        if (
          errorData.error?.type === "overloaded_error" &&
          attempt < maxRetries
        ) {
          console.log(
            `Claude API overloaded. Attempt ${attempt}/${maxRetries}. Waiting ${
              delayMs / 1000
            }s...`
          );
          await delay(delayMs);
          continue;
        }

        throw new Error(
          `Claude API error: ${response.statusText}, ${errorText}`
        );
      }

      const jsonResponse = await response.json();
      return jsonResponse.content[0].text;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.log(`Attempt ${attempt} failed. Retrying...`);
      await delay(delayMs);
    }
  }
  throw new Error("All retry attempts failed");
}

export async function getClaudeSummary(
  prompt: string,
  content: string,
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
        content:
          "Summarize the following meeting transcript using your system instructions:" +
          content,
      },
    ],
    system: prompt,
  };

  return await makeRequestWithRetry(apiUrl, headers, body);
}

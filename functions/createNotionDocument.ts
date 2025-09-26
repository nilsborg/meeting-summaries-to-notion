import { markdownToBlocks } from "npm:@tryfabric/martian@1.2.4";

export interface CreateNotionDocumentOptions {
  properties?: Record<string, unknown>;
  includeAttendees?: boolean;
  titlePropertyName?: string;
  additionalProperties?: Record<string, unknown>;
}

export async function createNotionDocument(
  title: string,
  content: string,
  userId: string | undefined,
  notionDatabaseId: string,
  notionApiKey: string,
  options: CreateNotionDocumentOptions = {}
): Promise<string> {
  const url = "https://api.notion.com/v1/pages";

  const shouldIncludeAttendees = options.includeAttendees ?? Boolean(userId);
  const titlePropertyName = options.titlePropertyName ?? "Name";

  const defaultProperties: Record<string, unknown> = {
    [titlePropertyName]: { title: [{ text: { content: title } }] },
    ...(shouldIncludeAttendees && userId
      ? { Attendees: { people: [{ object: "user", id: userId }] } }
      : {}),
    ...(options.additionalProperties ?? {}),
  };

  const properties = options.properties ?? defaultProperties;

  const body = {
    parent: { database_id: notionDatabaseId },
    properties,
    children: await markdownToBlocks(content),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API error: ${response.statusText}, ${errorText}`);
  }

  const responseData = await response.json();
  const documentUrl = `https://notion.so/${responseData.id.replace(/-/g, "")}`;

  console.log("Document successfully created in Notion.");
  return documentUrl;
}

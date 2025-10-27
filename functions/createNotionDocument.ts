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
  const appendUrlBase = "https://api.notion.com/v1/blocks";
  const MAX_CHILDREN_PER_REQUEST = 100;

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

  const blocks = await markdownToBlocks(content);
  const initialChildren = blocks.slice(0, MAX_CHILDREN_PER_REQUEST);

  const requestHeaders = {
    Authorization: `Bearer ${notionApiKey}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  const body = {
    parent: { database_id: notionDatabaseId },
    properties,
    ...(initialChildren.length > 0 ? { children: initialChildren } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API error: ${response.statusText}, ${errorText}`);
  }

  const responseData = await response.json();
  const pageId: string = responseData.id;

  for (
    let index = MAX_CHILDREN_PER_REQUEST;
    index < blocks.length;
    index += MAX_CHILDREN_PER_REQUEST
  ) {
    const chunk = blocks.slice(index, index + MAX_CHILDREN_PER_REQUEST);

    const appendResponse = await fetch(
      `${appendUrlBase}/${pageId}/children`,
      {
        method: "PATCH",
        headers: requestHeaders,
        body: JSON.stringify({ children: chunk }),
      }
    );

    if (!appendResponse.ok) {
      const appendErrorText = await appendResponse.text();
      throw new Error(
        `Failed to append Notion blocks: ${appendResponse.statusText}, ${appendErrorText}`,
      );
    }
  }

  const documentUrl = `https://notion.so/${responseData.id.replace(/-/g, "")}`;

  console.log("Document successfully created in Notion.");
  return documentUrl;
}

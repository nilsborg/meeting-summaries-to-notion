import { markdownToBlocks } from "npm:@tryfabric/martian@1.2.4";

export async function createNotionDocument(
  title: string,
  content: string,
  userId: string,
  notionDatabaseId: string,
  notionApiKey: string
): Promise<void> {
  const url = "https://api.notion.com/v1/pages";

  const body = {
    parent: { database_id: notionDatabaseId },
    properties: {
      Name: { title: [{ text: { content: title } }] },
      Attendees: { people: [{ object: "user", id: userId }] }, // Replace "Author" with your database's author property name
    },
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

  console.log("Document successfully created in Notion.");
}

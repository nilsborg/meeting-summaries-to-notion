export async function getLatestFile(folder: string): Promise<string | null> {
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

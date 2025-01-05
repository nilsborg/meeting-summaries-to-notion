const transcriptionFolder = "/Users/nilsborg/Transscripts/source";

async function getLatestFile(folder: string): Promise<string | null> {
  try {
    // Read all entries in the folder
    const entries = [];
    for await (const entry of Deno.readDir(folder)) {
      if (entry.isFile) {
        const filePath = `${folder}/${entry.name}`;
        const fileInfo = await Deno.stat(filePath);
        entries.push({ file: filePath, mtime: fileInfo.mtime });
      }
    }

    // Sort files by modification time (descending)
    const sortedFiles = entries
      .filter((entry) => entry.mtime) // Ensure mtime is not null
      .sort((a, b) => b.mtime!.getTime() - a.mtime!.getTime());

    // Return the most recently modified file
    return sortedFiles.length > 0 ? sortedFiles[0].file : null;
  } catch (error) {
    console.error("Error retrieving the latest file:", error);
    return null;
  }
}

async function main() {
  const latestFile = await getLatestFile(transcriptionFolder);
  console.log("hi from deno");
  if (latestFile) {
    console.log(`Latest file: ${latestFile}`);

    // Read the contents of the latest file
    const fileContents = await Deno.readTextFile(latestFile);
    console.log(`Contents of the latest file:\n${fileContents}`);
  } else {
    console.log("No valid files found in the folder.");
  }
}

main();

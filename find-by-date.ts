/// <reference lib="deno.ns" />

const transcriptionFolder = "/Users/nilsborg/Transscripts/source";

interface FileWithDate {
  filePath: string;
  fileName: string;
  date: Date;
  dateString: string;
}

function parseFileDate(fileName: string): Date | null {
  // Extract date from filename like "20250127 1502 Transcription.txt"
  const match = fileName.match(/^(\d{8})\s+(\d{4})/);
  if (!match) return null;

  const [, dateStr, timeStr] = match;
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
  const day = parseInt(dateStr.substring(6, 8));
  const hour = parseInt(timeStr.substring(0, 2));
  const minute = parseInt(timeStr.substring(2, 4));

  return new Date(year, month, day, hour, minute);
}

function parseInputDate(input: string): Date | null {
  // Support formats: YYYY-MM-DD, YYYYMMDD, MM/DD/YYYY
  let normalized = input.replace(/[-\/]/g, '');

  if (normalized.length === 8) {
    // YYYYMMDD
    const year = parseInt(normalized.substring(0, 4));
    const month = parseInt(normalized.substring(4, 6)) - 1;
    const day = parseInt(normalized.substring(6, 8));
    return new Date(year, month, day);
  }

  // Try parsing as regular date string
  const date = new Date(input);
  return isNaN(date.getTime()) ? null : date;
}

async function getFilesWithDates(): Promise<FileWithDate[]> {
  const filesWithDates: FileWithDate[] = [];

  try {
    for await (const entry of Deno.readDir(transcriptionFolder)) {
      if (entry.isFile) {
        const filePath = `${transcriptionFolder}/${entry.name}`;
        const date = parseFileDate(entry.name);

        if (date) {
          filesWithDates.push({
            filePath,
            fileName: entry.name,
            date,
            dateString: entry.name.substring(0, 13) // "20250127 1502"
          });
        }
      }
    }
  } catch (error) {
    console.error("Error reading transcription folder:", error);
  }

  return filesWithDates.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function showUsage(): void {
  console.log(`
Usage: deno run --allow-all find-by-date.ts [OPTIONS] [DATE_RANGE]

OPTIONS:
  -h, --help     Show this help message
  -t, --today    Show files from today
  -y, --yesterday Show files from yesterday
  -w, --week     Show files from the last 7 days
  -m, --month    Show files from the last 30 days

DATE_RANGE:
  Single date:     YYYY-MM-DD or YYYYMMDD
  Date range:      YYYY-MM-DD..YYYY-MM-DD or YYYYMMDD..YYYYMMDD

Examples:
  deno run --allow-all find-by-date.ts --today
  deno run --allow-all find-by-date.ts --week
  deno run --allow-all find-by-date.ts 2025-01-27
  deno run --allow-all find-by-date.ts 20250127
  deno run --allow-all find-by-date.ts 2025-01-20..2025-01-27
  deno run --allow-all find-by-date.ts 20250120..20250127
`);
}

function isDateInRange(date: Date, startDate: Date, endDate: Date): boolean {
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const startOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  return dateOnly >= startOnly && dateOnly <= endOnly;
}

async function main() {
  const args = Deno.args;

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    showUsage();
    return;
  }

  const allFiles = await getFilesWithDates();
  let filteredFiles: FileWithDate[] = [];

  if (args.includes("-t") || args.includes("--today")) {
    const today = new Date();
    filteredFiles = allFiles.filter(file =>
      isDateInRange(file.date, today, today)
    );
  } else if (args.includes("-y") || args.includes("--yesterday")) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    filteredFiles = allFiles.filter(file =>
      isDateInRange(file.date, yesterday, yesterday)
    );
  } else if (args.includes("-w") || args.includes("--week")) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    filteredFiles = allFiles.filter(file =>
      isDateInRange(file.date, startDate, endDate)
    );
  } else if (args.includes("-m") || args.includes("--month")) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    filteredFiles = allFiles.filter(file =>
      isDateInRange(file.date, startDate, endDate)
    );
  } else {
    // Parse date range from argument
    const dateArg = args[0];

    if (dateArg.includes("..")) {
      // Date range
      const [startStr, endStr] = dateArg.split("..");
      const startDate = parseInputDate(startStr);
      const endDate = parseInputDate(endStr);

      if (!startDate || !endDate) {
        console.error("Invalid date range format. Use YYYY-MM-DD..YYYY-MM-DD or YYYYMMDD..YYYYMMDD");
        return;
      }

      filteredFiles = allFiles.filter(file =>
        isDateInRange(file.date, startDate, endDate)
      );
    } else {
      // Single date
      const targetDate = parseInputDate(dateArg);

      if (!targetDate) {
        console.error("Invalid date format. Use YYYY-MM-DD or YYYYMMDD");
        return;
      }

      filteredFiles = allFiles.filter(file =>
        isDateInRange(file.date, targetDate, targetDate)
      );
    }
  }

  if (filteredFiles.length === 0) {
    console.log("No files found for the specified date range.");
    return;
  }

  console.log(`Found ${filteredFiles.length} file(s):`);
  filteredFiles.forEach((file, index) => {
    const formattedDate = file.date.toLocaleDateString();
    const formattedTime = file.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    console.log(`${index + 1}. ${file.fileName} (${formattedDate} ${formattedTime})`);
  });

  console.log(`\nTo process any of these files, use:`);
  filteredFiles.forEach((file, index) => {
    console.log(`  deno run --allow-all rerun.ts "${file.dateString}"`);
  });
}

main().catch((error) => {
  console.error("An error occurred:", error);
});

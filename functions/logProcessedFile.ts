export interface ProcessedFileRecord {
  filePath: string;
  fileName: string;
  processedAt: string;
  notionUrl?: string;
  success: boolean;
  flowType?: string;
}

const LOG_FILE_PATH = "/Users/nilsborg/Transscripts/processed_files.json";

export async function logProcessedFile(
  filePath: string,
  success: boolean,
  notionUrl?: string,
  flowType?: string
): Promise<void> {
  const fileName = filePath.split('/').pop() || 'unknown';
  const normalizedFlowType = flowType ?? 'meeting';

  const record: ProcessedFileRecord = {
    filePath,
    fileName,
    processedAt: new Date().toISOString(),
    notionUrl,
    success,
    flowType: normalizedFlowType
  };

  try {
    let existingRecords: ProcessedFileRecord[] = [];

    // Try to read existing log file
    try {
      const existingData = await Deno.readTextFile(LOG_FILE_PATH);
      existingRecords = JSON.parse(existingData);
    } catch {
      // File doesn't exist or is invalid, start with empty array
      existingRecords = [];
    }

    // Remove any existing record for this file (to avoid duplicates)
    existingRecords = existingRecords.filter(r => {
      const recordFlow = r.flowType ?? 'meeting';
      if (r.filePath !== filePath) {
        return true;
      }
      return recordFlow !== normalizedFlowType;
    });

    // Add the new record
    existingRecords.push(record);

    // Sort by processed date (most recent first)
    existingRecords.sort((a, b) =>
      new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
    );

    // Write back to file
    await Deno.writeTextFile(
      LOG_FILE_PATH,
      JSON.stringify(existingRecords, null, 2)
    );

    console.log(`✓ Logged processing result for ${fileName} (${normalizedFlowType})`);
  } catch (error) {
    console.error("Error logging processed file:", error);
    // Don't throw - logging failure shouldn't stop the main process
  }
}

export async function isFileProcessed(filePath: string): Promise<boolean> {
  try {
    const data = await Deno.readTextFile(LOG_FILE_PATH);
    const records: ProcessedFileRecord[] = JSON.parse(data);

    return records.some(record =>
      record.filePath === filePath && record.success
    );
  } catch {
    // If we can't read the log file, assume not processed
    return false;
  }
}

export async function getProcessedFiles(): Promise<ProcessedFileRecord[]> {
  try {
    const data = await Deno.readTextFile(LOG_FILE_PATH);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function getFailedFiles(): Promise<ProcessedFileRecord[]> {
  const allRecords = await getProcessedFiles();
  return allRecords.filter(record => !record.success);
}

export async function getRecentlyProcessed(count: number = 10): Promise<ProcessedFileRecord[]> {
  const allRecords = await getProcessedFiles();
  return allRecords.slice(0, count);
}

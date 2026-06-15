/// <reference lib="deno.ns" />

import { config } from "https://deno.land/x/dotenv/mod.ts";
import {
  MEETING_COMPARISON_MODELS,
  type SummaryModelConfig,
} from "../config/summaryModels.ts";
import { getOpenRouterSummary } from "../functions/getOpenRouterSummary.ts";
import { loadPrompt } from "../functions/loadPrompt.ts";

const ROOT = "/Users/nilsborg/Repos/meeting-summaries-to-notion";
const PROMPT_PATH = `${ROOT}/prompt.md`;
const OUTPUT_DIR = `${ROOT}/model_comparison`;

const TRANSCRIPTS = [
  `${ROOT}/source/20260615 1300 Transcription.txt`,
  `${ROOT}/source/20260615 1116 Transcription.txt`,
  `${ROOT}/source/20260602 1615 Transcription.txt`,
];

const env = config({ path: `${ROOT}/.env` }) as Record<string, string>;
const apiKey = env.OPENROUTER_API_KEY ?? Deno.env.get("OPENROUTER_API_KEY");

if (!apiKey) {
  console.error("Error: Missing OPENROUTER_API_KEY");
  Deno.exit(1);
}

interface ComparisonJob {
  transcriptPath: string;
  fileName: string;
  fileContents: string;
  modelConfig: SummaryModelConfig;
}

interface ComparisonResult {
  fileName: string;
  label: string;
  model: string;
  path: string;
  ok: boolean;
  elapsedSec: string;
}

function sanitizeDirName(name: string): string {
  return name
    .replace(/\.[^/.]+$/, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

async function runJob(
  job: ComparisonJob,
  basePrompt: string,
): Promise<ComparisonResult> {
  const { fileName, fileContents, modelConfig } = job;
  const transcriptDir = sanitizeDirName(fileName);
  const outputTranscriptDir = `${OUTPUT_DIR}/${transcriptDir}`;
  const outputFileName = `${sanitizeFileName(modelConfig.label)}.md`;
  const outputPath = `${outputTranscriptDir}/${outputFileName}`;

  await Deno.mkdir(outputTranscriptDir, { recursive: true });

  console.log(`→ ${fileName} / ${modelConfig.label}`);

  try {
    const startedAt = Date.now();
    const content = await getOpenRouterSummary({
      systemPrompt: basePrompt,
      content: fileContents,
      apiKey: apiKey!,
      model: modelConfig.model,
      maxTokens: 8192,
    });
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    const markdown = [
      `# ${fileName} — ${modelConfig.label}`,
      "",
      `- Model: \`${modelConfig.model}\``,
      `- Generated: ${new Date().toISOString()}`,
      `- Duration: ${elapsedSec}s`,
      "",
      "---",
      "",
      content.trim(),
      "",
    ].join("\n");

    await Deno.writeTextFile(outputPath, markdown);
    console.log(`  ✓ ${modelConfig.label} on ${fileName} (${elapsedSec}s)`);

    return {
      fileName,
      label: modelConfig.label,
      model: modelConfig.model,
      path: outputPath.replace(`${ROOT}/`, ""),
      ok: true,
      elapsedSec,
    };
  } catch (error) {
    console.error(`  ✗ ${modelConfig.label} on ${fileName}:`, error);

    const errorMarkdown = [
      `# ${fileName} — ${modelConfig.label}`,
      "",
      `- Model: \`${modelConfig.model}\``,
      `- Generated: ${new Date().toISOString()}`,
      `- Status: **failed**`,
      "",
      "## Error",
      "",
      "```",
      String(error),
      "```",
      "",
    ].join("\n");

    await Deno.writeTextFile(outputPath, errorMarkdown);

    return {
      fileName,
      label: modelConfig.label,
      model: modelConfig.model,
      path: outputPath.replace(`${ROOT}/`, ""),
      ok: false,
      elapsedSec: "—",
    };
  }
}

async function main() {
  const basePrompt = await loadPrompt(PROMPT_PATH);
  const runStartedAt = new Date().toISOString();
  const jobs: ComparisonJob[] = [];

  for (const transcriptPath of TRANSCRIPTS) {
    const fileName = transcriptPath.split("/").pop() ?? "unknown";

    let fileContents: string;
    try {
      fileContents = await Deno.readTextFile(transcriptPath);
    } catch (error) {
      console.error(`Skipping missing transcript: ${transcriptPath}`, error);
      continue;
    }

    for (const modelConfig of MEETING_COMPARISON_MODELS) {
      jobs.push({ transcriptPath, fileName, fileContents, modelConfig });
    }
  }

  console.log(
    `Running ${jobs.length} comparisons in parallel (${TRANSCRIPTS.length} transcripts × ${MEETING_COMPARISON_MODELS.length} models)...\n`,
  );

  const startedAt = Date.now();
  const results = await Promise.all(
    jobs.map((job) => runJob(job, basePrompt)),
  );
  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  const indexLines = [
    "# Model Comparison Run",
    "",
    `Generated: ${runStartedAt}`,
    `Total wall time: ${totalSec}s (parallel)`,
    `Jobs: ${jobs.length}`,
    "",
    "## Transcripts",
    "",
  ];

  const byFile = new Map<string, ComparisonResult[]>();
  for (const result of results) {
    const group = byFile.get(result.fileName) ?? [];
    group.push(result);
    byFile.set(result.fileName, group);
  }

  for (const transcriptPath of TRANSCRIPTS) {
    const fileName = transcriptPath.split("/").pop() ?? "unknown";
    const group = byFile.get(fileName);
    if (!group) continue;

    indexLines.push(`### ${fileName}`, "");
    for (const result of group) {
      const status = result.ok ? `ok, ${result.elapsedSec}s` : "failed";
      indexLines.push(
        `- [${result.label}](${result.path}) (\`${result.model}\`, ${status})`,
      );
    }
    indexLines.push("");
  }

  const indexPath = `${OUTPUT_DIR}/index.md`;
  await Deno.mkdir(OUTPUT_DIR, { recursive: true });
  await Deno.writeTextFile(indexPath, indexLines.join("\n"));
  console.log(`\nDone in ${totalSec}s. Index: ${indexPath}`);
}

main();

export interface SummaryModelConfig {
  label: string;
  model: string;
}

const DEFAULT_MODELS: SummaryModelConfig[] = [
  { label: "Claude Summary", model: "anthropic/claude-sonnet-4.5" },
];

export function getSummaryModelConfigs(
  configValue?: string
): SummaryModelConfig[] {
  if (!configValue || !configValue.trim()) {
    return DEFAULT_MODELS;
  }

  const entries = configValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const configs: SummaryModelConfig[] = [];

  for (const entry of entries) {
    const separatorIndex = entry.includes("=")
      ? entry.indexOf("=")
      : entry.indexOf(":");

    let label = "";
    let model = "";

    if (separatorIndex === -1) {
      model = entry.trim();
      label = model;
    } else {
      label = entry.slice(0, separatorIndex).trim();
      model = entry.slice(separatorIndex + 1).trim();
    }

    if (!model) {
      console.warn(
        `Skipping invalid OPENROUTER_SUMMARY_MODELS entry: "${entry}"`
      );
      continue;
    }

    if (!label) {
      label = model;
    }

    configs.push({ label, model });
  }

  if (configs.length === 0) {
    console.warn(
      "OPENROUTER_SUMMARY_MODELS did not contain any valid entries, using defaults."
    );
    return DEFAULT_MODELS;
  }

  return configs;
}

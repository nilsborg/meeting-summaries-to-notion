export interface SummaryModelConfig {
  label: string;
  model: string;
}

/** Production summarizer — change here to update all flows. */
export const DEFAULT_SUMMARY_MODEL: SummaryModelConfig = {
  label: "Opus 4.6",
  model: "anthropic/claude-opus-4.6",
};

export const MEETING_SUMMARY_MODELS: SummaryModelConfig[] = [
  DEFAULT_SUMMARY_MODEL,
];

export const PROJECT_UPDATE_SUMMARY_MODELS: SummaryModelConfig[] = [
  DEFAULT_SUMMARY_MODEL,
];

/** Models to compare when evaluating summarization quality. */
export const MEETING_COMPARISON_MODELS: SummaryModelConfig[] = [
  { label: "Opus 4.6", model: "anthropic/claude-opus-4.6" },
  { label: "Opus 4.8", model: "anthropic/claude-opus-4.8" },
  { label: "GPT-5.4", model: "openai/gpt-5.4" },
  { label: "GPT-5.5", model: "openai/gpt-5.5" },
];

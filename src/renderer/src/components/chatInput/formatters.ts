import type { ContextUsage, ModelInfo } from '../../../../shared/ipcContract';

const TOKEN_UNIT = 1000;
const TOKEN_SUFFIX = 'k';
const MODEL_OPTION_KEY_SEPARATOR = '|';
const CONTEXT_USAGE_UNAVAILABLE = 'context --';
const AUTO_COMPACT_LABEL = 'auto';

export const UNKNOWN_STATUS = '--';

export function modelOptionKey(model: ModelInfo): string {
  return `${model.provider}${MODEL_OPTION_KEY_SEPARATOR}${model.id}`;
}

export function modelSearchValue(model: ModelInfo): string {
  return [model.name, model.provider, model.id, model.api].join(' ');
}

export function formatModelDetails(model: ModelInfo): string {
  return `${model.provider}/${model.id} - ${formatTokenCount(model.contextWindow)} context`;
}

export function formatContextUsage(
  contextUsage: ContextUsage | null,
  autoCompactionEnabled: boolean,
): string {
  if (!contextUsage || contextUsage.tokens === null || contextUsage.percent === null) {
    return CONTEXT_USAGE_UNAVAILABLE;
  }
  const suffix = autoCompactionEnabled ? ` (${AUTO_COMPACT_LABEL})` : '';
  return `${formatPercent(contextUsage.percent)}/${formatTokenCount(contextUsage.contextWindow)}${suffix}`;
}

export function formatContextWindow(contextUsage: ContextUsage | null): string {
  if (!contextUsage) {
    return UNKNOWN_STATUS;
  }
  return formatTokenCount(contextUsage.contextWindow);
}

export function formatUsedContext(contextUsage: ContextUsage | null): string {
  if (!contextUsage || contextUsage.tokens === null || contextUsage.percent === null) {
    return UNKNOWN_STATUS;
  }
  return `${formatTokenCount(contextUsage.tokens)} (${formatPercent(contextUsage.percent)})`;
}

export function formatAutoCompactExplanation(autoCompactionEnabled: boolean): string {
  if (autoCompactionEnabled) {
    return 'Context auto compact is enabled.';
  }
  return 'Context auto compact is not enabled.';
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatTokenCount(value: number): string {
  return `${Math.round(value / TOKEN_UNIT)}${TOKEN_SUFFIX}`;
}

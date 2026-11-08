import {
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';

/**
 * Whether pi would apply this project's settings.json at runtime. Mirrors the
 * non-interactive fallback: an explicit trust entry wins, then the global
 * defaultProjectTrust, then "trusted unless the project has gated resources".
 */
export function resolveProjectTrust(cwd: string, agentDir: string): boolean {
  const decision = new ProjectTrustStore(agentDir).get(cwd);
  if (decision !== null) {
    return decision;
  }
  const fallback = SettingsManager.create(cwd, agentDir, {
    projectTrusted: false,
  }).getDefaultProjectTrust();
  if (fallback === 'always') {
    return true;
  }
  if (fallback === 'never') {
    return false;
  }
  return !hasTrustRequiringProjectResources(cwd);
}

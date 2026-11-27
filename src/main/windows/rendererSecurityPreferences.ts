/**
 * The renderer is untrusted by construction: model output reaches its DOM, and
 * a cloned repository arrives through it. These flags are that boundary, kept
 * in one place so a change that relaxes one of them fails a test
 * (`windowSecurity.test.ts`) instead of shipping quietly.
 *
 * `preload`, `sandbox` and the rest per window stay with the window that needs
 * them; everything here is the same for both.
 */
export const RENDERER_SECURITY_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
} as const;

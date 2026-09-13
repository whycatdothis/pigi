/**
 * What pigi tells the model about the window it is answering in.
 *
 * The SDK's own prompt covers the tools and the working directory. What a pi
 * session running inside pigi can additionally assume about the surface its
 * answer is read on belongs here, and it is appended to that prompt for every
 * session.
 *
 * Kept as source rather than as a file on disk so it travels with the build:
 * the SDK's own append file (`<project>/.pi/APPEND_SYSTEM.md`) belongs to
 * whatever project is open, and this belongs to the app. One entry per point,
 * so what the model is told about the UI reads as a list of what the UI does.
 */
export const PIGI_SYSTEM_PROMPT = ['The UI supports Mermaid diagrams.'].join('\n');

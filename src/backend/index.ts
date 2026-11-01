export * from './contracts.ts';
export { openBackend } from './service.ts';
export type { Backend, BackendOptions } from './service.ts';
export { createTemplateIntelligence, createOllamaIntelligence } from './intelligence.ts';
export { TENNIS_REFERENCES } from './references.ts';
export { fromFrontendDraft, fromFrontendPhoto } from './frontend.ts';
// Compatibility only for the earlier handoff.
export { createLarpService, LarpError } from './legacy.ts';

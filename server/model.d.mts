import { ModelConfig } from './core.mjs';
export const SYSTEM_PROMPT: string;
export function callModel(config: ModelConfig, messages: { role: string; content: string }[], signal?: AbortSignal, json?: boolean): Promise<string>;

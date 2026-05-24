// Extension settings resolved from environment variables and persisted config.
//
// OLLAMA_HOST                 — Ollama server host[:port]. Default: localhost:11434
// OLLAMA_NATIVE_GHOST_RETRIES — Max retries on ghost-token response. Default: 2
// OLLAMA_CONTEXT_LENGTH       — User-set context length override (also Ollama's own
//                                env var, honored for cross-tool consistency).
//                                Superseded by any slash-command-set persisted value.

import { loadPersistedConfig } from "./config.js";

export interface OllamaExtensionSettings {
	/** Base URL of the Ollama server, e.g. http://localhost:11434 */
	baseUrl: string;
	/** keep_alive value sent on every request. Default: "5m" */
	keepAlive: string | number;
	/** Default num_ctx if model's contextWindow is unavailable. Default: 32768 */
	numCtx: number;
	/** Max ghost-token retries before surfacing an error. Default: 2 */
	ghostRetries: number;
	/**
	 * User-set context length override. Resolution order:
	 *   1. Persisted config from `/ollama-context` slash command
	 *   2. `OLLAMA_CONTEXT_LENGTH` env var
	 *   3. undefined (fall through to min(model.contextWindow, numCtx) in provider)
	 *
	 * Mutable at runtime — the slash command writes here AND to the persisted
	 * config file so changes survive restart.
	 */
	contextLength?: number;
}

export function loadSettings(): OllamaExtensionSettings {
	// OLLAMA_HOST may be bare "host:port" or already include a protocol.
	const rawHost = process.env.OLLAMA_HOST ?? "localhost:11434";
	const baseUrl = rawHost.startsWith("http")
		? rawHost
		: `http://${rawHost}`;

	const rawRetries = process.env.OLLAMA_NATIVE_GHOST_RETRIES;
	const ghostRetries = (() => {
		if (!rawRetries) return 2;
		const n = parseInt(rawRetries, 10);
		return Number.isFinite(n) && n >= 0 ? n : 2;
	})();

	// contextLength resolution: persisted (slash-command set) wins over env var.
	const persistedContextLength = loadPersistedConfig().contextLength;
	const envContextLength = (() => {
		const raw = process.env.OLLAMA_CONTEXT_LENGTH;
		if (!raw) return undefined;
		const n = parseInt(raw, 10);
		return Number.isFinite(n) && n > 0 ? n : undefined;
	})();
	const contextLength = persistedContextLength ?? envContextLength;

	return {
		baseUrl: baseUrl.replace(/\/+$/, ""),
		keepAlive: "5m",
		numCtx: 32768,
		ghostRetries,
		contextLength,
	};
}

// Auto-attach local image files referenced by path in user input.
//
// Pi's clipboard paste (Ctrl+V) and typed paths insert an image file PATH as
// plain text; nothing in the TUI turns that into an image attachment, so the
// model only sees a path and must (unreliably) decide to call the read tool —
// whose image result Ollama can't carry on a tool message anyway. This input
// hook detects image-file paths in the submitted text, reads them, and attaches
// them as real image content blocks so vision models see the picture directly.

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dbg } from "./debug.js";

interface ImageContent {
	type: "image";
	mimeType: string;
	data: string;
}

export interface InputEvent {
	text?: string;
	images?: ImageContent[];
}

export type InputResult =
	| { action: "continue" }
	| { action: "transform"; text: string; images?: ImageContent[] };

interface InputCapableApi {
	on?: (
		event: string,
		handler: (e: InputEvent) => InputResult | Promise<InputResult>,
	) => void;
}

const MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
};

// Match absolute (/…) or home (~/…) paths with no whitespace ending in an image
// extension. Covers pi-clipboard temp paths and plain paste/typed paths. Paths
// containing spaces (e.g. macOS "Screenshot … .png") are intentionally NOT matched
// here — use the CLI @file route, or paste (which yields a space-free temp path).
const IMAGE_PATH = /(~?\/[^\s"']+?\.(?:png|jpe?g|webp|gif))(?=$|[\s"'])/gi;

function expandHome(p: string): string {
	return p.startsWith("~/") ? homedir() + p.slice(1) : p;
}

function toImage(absPath: string): ImageContent | null {
	try {
		if (!existsSync(absPath) || !statSync(absPath).isFile()) return null;
		const ext = (absPath.split(".").pop() ?? "").toLowerCase();
		const mimeType = MIME[ext];
		if (!mimeType) return null;
		return {
			type: "image",
			mimeType,
			data: readFileSync(absPath).toString("base64"),
		};
	} catch {
		return null;
	}
}

export function registerImageInput(pi: InputCapableApi): void {
	if (typeof pi.on !== "function") return;
	pi.on("input", (event) => {
		const text = event?.text ?? "";
		const matches = text.match(IMAGE_PATH);
		if (!matches || matches.length === 0) return { action: "continue" };

		const added: ImageContent[] = [];
		let newText = text;
		for (const raw of matches) {
			const img = toImage(expandHome(raw));
			if (!img) continue;
			added.push(img);
			// Drop the raw path from the prompt so the model doesn't also try to
			// read() it; it now has the image directly.
			newText = newText.split(raw).join("");
		}
		if (added.length === 0) return { action: "continue" };

		newText = newText.replace(/\s{2,}/g, " ").trim();
		dbg("image-input attached", { count: added.length });
		return {
			action: "transform",
			text: newText || "What is in this image?",
			images: [...(event.images ?? []), ...added],
		};
	});
}

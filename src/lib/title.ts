import { yamlFrontmatterEnd } from '$lib/md';

export const TITLE_SOURCES = ['filename', 'heading', 'yaml'] as const;
export type TitleSource = (typeof TITLE_SOURCES)[number];

export type TitleSettings = {
	source: TitleSource;
	yamlProperty: string;
};

export const DEFAULT_TITLE_SETTINGS: TitleSettings = {
	source: 'filename',
	yamlProperty: 'title'
};

export function isTitleSource(value: string): value is TitleSource {
	return (TITLE_SOURCES as readonly string[]).includes(value);
}

export function fileNameTitle(relativePath: string): string {
	const base = relativePath.split(/[/\\]/).pop() ?? relativePath;
	return base.replace(/\.md$/i, '') || relativePath;
}

export function firstHeadingTitle(content: string): string | null {
	const body = content.slice(yamlFrontmatterEnd(content));
	const heading = body.match(/^#{1,6}\s+(.+)$/m);
	const text = heading?.[1]?.trim();
	return text || null;
}

export function yamlPropertyTitle(content: string, property: string): string | null {
	const key = property.trim();
	if (!key) return null;
	const end = yamlFrontmatterEnd(content);
	if (!end) return null;
	const block = content.slice(0, end);
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`^${escaped}\\s*:\\s*(.*)$`);
	for (const line of block.split(/\r?\n/)) {
		if (!line || /^\s/.test(line) || line.startsWith('---') || line === '...') continue;
		const match = line.match(pattern);
		if (!match) continue;
		return scalarYamlValue(match[1] ?? '');
	}
	return null;
}

function scalarYamlValue(raw: string): string | null {
	let value = raw.trim();
	if (!value) return null;
	if (value.startsWith('#') || value === '|' || value === '>' || value === '|-' || value === '>-') {
		return null;
	}
	if (value.startsWith('{') || value.startsWith('[')) return null;
	if (
		(value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
		(value.startsWith("'") && value.endsWith("'") && value.length >= 2)
	) {
		value = value.slice(1, -1);
	} else {
		const comment = value.search(/\s+#/);
		if (comment >= 0) value = value.slice(0, comment);
	}
	value = value.trim();
	return value || null;
}

export function deriveDocumentTitle(
	content: string,
	relativePath: string,
	settings: TitleSettings = DEFAULT_TITLE_SETTINGS
): string {
	const fallback = fileNameTitle(relativePath);
	if (settings.source === 'heading') return firstHeadingTitle(content) || fallback;
	if (settings.source === 'yaml') {
		return yamlPropertyTitle(content, settings.yamlProperty) || fallback;
	}
	return fallback;
}

export function shouldShowDisplayTitle(
	settings: TitleSettings,
	surface: 'article' | 'source'
): boolean {
	if (settings.source === 'heading') return false;
	if (settings.source === 'yaml' && surface === 'source') return false;
	return settings.source === 'filename' || settings.source === 'yaml';
}

export const DISPLAY_TITLE_PATH = '__display_title__';

export function isDisplayTitleSelector(sel: { headingPath?: string | null }): boolean {
	return sel.headingPath === DISPLAY_TITLE_PATH;
}

export function displayTitleHint(): { path: string; paraOrdinal: number } {
	return { path: DISPLAY_TITLE_PATH, paraOrdinal: 0 };
}

export function headingPathLabel(path: string): string {
	return path === DISPLAY_TITLE_PATH ? 'Title' : path;
}

export function yamlQuote(value: string): string {
	if (/^[\w.-]+$/.test(value)) return value;
	return JSON.stringify(value);
}

export function setYamlPropertyValue(content: string, property: string, value: string): string {
	const key = property.trim();
	if (!key) return content;
	const line = `${key}: ${yamlQuote(value)}`;
	const end = yamlFrontmatterEnd(content);
	if (!end) return `---\n${line}\n---\n\n${content}`;
	const block = content.slice(0, end);
	const rest = content.slice(end);
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`^${escaped}\\s*:`);
	const parts = block.split(/(\r?\n)/);
	let found = false;
	const next: string[] = [];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i]!;
		if (!found && !/^\s/.test(part) && pattern.test(part)) {
			next.push(line);
			found = true;
			continue;
		}
		next.push(part);
	}
	if (found) return next.join('') + rest;
	const rebuilt = block.replace(/^(---\r?\n)/, `$1${line}\n`);
	return rebuilt + rest;
}

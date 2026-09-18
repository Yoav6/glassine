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

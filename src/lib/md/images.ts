/** Absolute / data / blob URLs are left alone; vault-relative paths become asset routes. */
export function isExternalImageSrc(src: string): boolean {
	const trimmed = src.trim();
	if (!trimmed) return true;
	return /^(https?:|data:|blob:)/i.test(trimmed) || trimmed.startsWith('//');
}

/**
 * Resolve a markdown image URL against the document file's directory.
 * Leading `/` means vault root (documents dir). Returns null if the path escapes.
 */
export function resolveAssetRelativePath(documentRelativePath: string, src: string): string | null {
	const trimmed = src.trim();
	if (!trimmed || isExternalImageSrc(trimmed)) return null;

	let decoded = trimmed;
	try {
		decoded = decodeURIComponent(trimmed);
	} catch {
		/* keep raw */
	}

	const raw = decoded.replace(/\\/g, '/');
	const docPath = documentRelativePath.replace(/\\/g, '/');
	const slash = docPath.lastIndexOf('/');
	const baseDir = slash === -1 ? '' : docPath.slice(0, slash);

	const joined = raw.startsWith('/')
		? raw.replace(/^\/+/, '')
		: baseDir
			? `${baseDir}/${raw}`
			: raw.replace(/^\/+/, '');

	const parts: string[] = [];
	for (const part of joined.split('/')) {
		if (!part || part === '.') continue;
		if (part === '..') {
			if (!parts.length) return null;
			parts.pop();
			continue;
		}
		if (part.includes('\0')) return null;
		parts.push(part);
	}
	return parts.length ? parts.join('/') : null;
}

const IMAGE_EXT = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'svg',
	'avif',
	'bmp',
	'ico'
]);

/** File-picker `accept` for vault images the editor can embed. */
export const IMAGE_FILE_ACCEPT = [
	...[...IMAGE_EXT].map((ext) => `.${ext}`),
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'image/svg+xml',
	'image/avif',
	'image/bmp',
	'image/x-icon'
].join(',');

export function imageContentType(relativePath: string): string | null {
	const base = relativePath.replace(/\\/g, '/').split('/').pop() ?? '';
	const dot = base.lastIndexOf('.');
	if (dot <= 0) return null;
	const ext = base.slice(dot + 1).toLowerCase();
	if (!IMAGE_EXT.has(ext)) return null;
	switch (ext) {
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'svg':
			return 'image/svg+xml';
		case 'ico':
			return 'image/x-icon';
		default:
			return `image/${ext}`;
	}
}

/**
 * Browser URL for an `image` node's `src`. Only a `local` image (always a
 * wiki-embed — see parse.ts and schema.ts) is resolved against the vault;
 * a plain markdown `![]()` image's src is used exactly as written; Glassine
 * no longer has a local-file form of that syntax, so there is nothing to
 * resolve, and this is unconditionally either a real absolute URL or broken,
 * same as it would be in any other markdown renderer. A local image's path
 * is always vault-root-relative (wiki-embeds have no other form — no
 * relative-to-document convention to distinguish), hence the `__root__`
 * marker unconditionally, not just for a path that happens to start with
 * `/`; the asset route decodes it back via `assetSrcFromRoutePath`.
 */
export function documentAssetUrl(slug: string, src: string, local: boolean): string {
	if (!local) return src.trim();
	const trimmed = src.trim().replace(/^\/+/, '');
	if (!trimmed) return src;
	const segments = trimmed.split('/').filter(Boolean).map(encodeURIComponent).join('/');
	return `/api/documents/${encodeURIComponent(slug)}/assets/__root__/${segments}`;
}

/** Inverse of the `__root__/` prefix used in asset URLs. */
export function assetSrcFromRoutePath(pathSegments: string[]): string {
	const joined = pathSegments.filter(Boolean).join('/');
	if (joined === '__root__' || joined.startsWith('__root__/')) {
		return `/${joined.slice('__root__'.length).replace(/^\//, '')}`;
	}
	return joined;
}

/** Relative markdown src from a document file to a vault asset path. */
export function relativeAssetSrc(documentRelativePath: string, assetRelativePath: string): string {
	const docPath = documentRelativePath.replace(/\\/g, '/');
	const slash = docPath.lastIndexOf('/');
	const baseDir = slash === -1 ? '' : docPath.slice(0, slash);
	const asset = assetRelativePath.replace(/\\/g, '/').replace(/^\/+/, '');
	if (!baseDir) return asset;

	const fromParts = baseDir.split('/').filter(Boolean);
	const toParts = asset.split('/').filter(Boolean);
	let i = 0;
	while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
	const ups = fromParts.length - i;
	const down = toParts.slice(i);
	const parts = [...Array.from({ length: ups }, () => '..'), ...down];
	return parts.join('/') || '.';
}

/** Prefer the same root-vs-relative style the author already used. */
export function rewriteAssetSrc(
	documentRelativePath: string,
	src: string,
	fromAsset: string,
	toAsset: string
): string | null {
	const resolved = resolveAssetRelativePath(documentRelativePath, src);
	if (resolved !== fromAsset) return null;
	const trimmed = src.trim();
	if (trimmed.startsWith('/')) return `/${toAsset.replace(/^\/+/, '')}`;
	return relativeAssetSrc(documentRelativePath, toAsset);
}

const MD_REF_RE =
	/(!?\[[^\]]*\]\()(\s*<?)([^)\s>]+)(>?)((?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\))/g;

/**
 * Obsidian's `![[path]]` / `![[path|alias]]` image embed syntax, understood
 * alongside plain `![]()` (see parse.ts, which renders these the same way).
 * Unlike plain markdown links, a bare wiki-embed path is Obsidian's own
 * vault-root-relative convention, not relative to the document — so callers
 * resolve it with a synthetic leading `/` rather than plain
 * `resolveAssetRelativePath(documentRelativePath, linkpath)`.
 */
const WIKI_EMBED_RE = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/g;

export type WikiImageEmbed = { raw: string; index: number; linkpath: string; alias: string | null };

/** Wiki-embed matches with a recognized image extension — a non-image target (a note transclusion, a heading link) is left alone. */
export function extractWikiImageEmbeds(content: string): WikiImageEmbed[] {
	const out: WikiImageEmbed[] = [];
	for (const m of content.matchAll(WIKI_EMBED_RE)) {
		const linkpath = m[1].trim();
		if (!imageContentType(linkpath)) continue;
		out.push({ raw: m[0], index: m.index ?? 0, linkpath, alias: m[2]?.trim() || null });
	}
	return out;
}

/**
 * Local link/embed destinations that resolve inside the vault: plain markdown
 * *links* (`[text](path)`) to a local file, and wiki-embed *images*
 * (`![[path]]`). A plain markdown *image* (`![](path)`) is deliberately
 * excluded — Glassine no longer treats that syntax as a local file (see
 * `documentAssetUrl`), so it isn't a real reference to track here either.
 */
export function extractLocalAssetRefs(
	content: string,
	documentRelativePath: string
): string[] {
	const found = new Set<string>();
	for (const match of content.matchAll(MD_REF_RE)) {
		if (String(match[1]).startsWith('!')) continue;
		const dest = match[3] ?? '';
		const resolved = resolveAssetRelativePath(documentRelativePath, dest);
		if (resolved) found.add(resolved);
	}
	for (const embed of extractWikiImageEmbeds(content)) {
		const resolved = resolveAssetRelativePath(documentRelativePath, `/${embed.linkpath}`);
		if (resolved) found.add(resolved);
	}
	return [...found];
}

/**
 * Rewrite local refs that point at `fromAsset` so they point at `toAsset` —
 * plain markdown links and wiki-embed images (see `extractLocalAssetRefs`
 * for why a plain markdown *image* isn't one of these).
 */
export function rewriteMarkdownAssetRefs(
	content: string,
	documentRelativePath: string,
	fromAsset: string,
	toAsset: string
): string {
	if (fromAsset === toAsset) return content;
	let next = content.replace(MD_REF_RE, (full, head, open, dest, close, tail) => {
		if (String(head).startsWith('!')) return full;
		const rewritten = rewriteAssetSrc(documentRelativePath, String(dest), fromAsset, toAsset);
		if (rewritten == null) return full;
		return `${head}${open}${rewritten}${close}${tail}`;
	});
	next = next.replace(WIKI_EMBED_RE, (full, linkpathRaw, aliasRaw) => {
		const linkpath = String(linkpathRaw).trim();
		if (!imageContentType(linkpath)) return full;
		const resolved = resolveAssetRelativePath(documentRelativePath, `/${linkpath}`);
		if (resolved !== fromAsset) return full;
		const alias = aliasRaw ? `|${aliasRaw}` : '';
		return `![[${toAsset}${alias}]]`;
	});
	return next;
}

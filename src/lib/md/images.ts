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

/** Browser URL for a vault-relative markdown image src. */
export function documentAssetUrl(slug: string, src: string): string {
	if (isExternalImageSrc(src)) return src.trim();
	const trimmed = src.trim();
	if (!trimmed) return src;
	// Leading `/` means vault root; encode as `__root__/…` so the API can tell.
	const path = trimmed.startsWith('/')
		? `__root__/${trimmed.replace(/^\/+/, '')}`
		: trimmed;
	const segments = path
		.split('/')
		.filter(Boolean)
		.map((part) => encodeURIComponent(part))
		.join('/');
	return `/api/documents/${encodeURIComponent(slug)}/assets/${segments}`;
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

/** Local markdown image/link destinations that resolve inside the vault. */
export function extractLocalAssetRefs(
	content: string,
	documentRelativePath: string
): string[] {
	const found = new Set<string>();
	for (const match of content.matchAll(MD_REF_RE)) {
		const dest = match[3] ?? '';
		const resolved = resolveAssetRelativePath(documentRelativePath, dest);
		if (resolved) found.add(resolved);
	}
	return [...found];
}

/** Rewrite local refs that point at `fromAsset` so they point at `toAsset`. */
export function rewriteMarkdownAssetRefs(
	content: string,
	documentRelativePath: string,
	fromAsset: string,
	toAsset: string
): string {
	if (fromAsset === toAsset) return content;
	return content.replace(MD_REF_RE, (full, head, open, dest, close, tail) => {
		const next = rewriteAssetSrc(documentRelativePath, String(dest), fromAsset, toAsset);
		if (next == null) return full;
		return `${head}${open}${next}${close}${tail}`;
	});
}

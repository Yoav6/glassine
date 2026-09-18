/** Keep the uploaded basename, including spaces and punctuation. URL slugs stay separate. */
export function preservedMarkdownFileName(filename: string): string {
	const base = filename.replace(/\\/g, '/').split('/').pop() ?? filename;
	const cleaned = base.replace(/\0/g, '').trim();
	const stem = cleaned.replace(/\.md$/i, '').trim();
	if (!stem || stem === '.' || stem === '..') return 'document.md';
	return `${stem}.md`;
}

/** Keep nested vault paths, but drop `.` / `..` segments. */
export function relativeMarkdownPath(filename: string): string {
	const parts = filename
		.replace(/\\/g, '/')
		.split('/')
		.filter((part) => part && part !== '.' && part !== '..');
	if (!parts.length) return 'document.md';
	const last = preservedMarkdownFileName(parts[parts.length - 1]!);
	return [...parts.slice(0, -1), last].join('/');
}

export function downloadFileName(relativePath: string): string {
	return preservedMarkdownFileName(relativePath);
}

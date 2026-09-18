/** Keep the uploaded basename, including spaces and punctuation. URL slugs stay separate. */
export function preservedMarkdownFileName(filename: string): string {
	const base = filename.replace(/\\/g, '/').split('/').pop() ?? filename;
	const cleaned = base.replace(/\0/g, '').trim();
	const stem = cleaned.replace(/\.md$/i, '').trim();
	if (!stem || stem === '.' || stem === '..') return 'document.md';
	return `${stem}.md`;
}

export function downloadFileName(relativePath: string): string {
	return preservedMarkdownFileName(relativePath);
}

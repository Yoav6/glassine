import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { relativeAssetPath } from '$lib/filename';
import {
	extractLocalAssetRefs,
	imageContentType,
	rewriteMarkdownAssetRefs
} from '$lib/md/images';
import { listDocuments } from './documents';
import { documentsDir } from './env';
import { maybeGitCommit, maybeGitMove, maybeGitRemove } from './git';
import {
	commitWrite,
	readDocument,
	relativePathTaken,
	vaultFilePath
} from './write';

const SKIP_DIRS = new Set(['.git', '.obsidian']);

export type VaultAsset = {
	relativePath: string;
	name: string;
	usedIn: number;
};

function walkAssets(dir: string, prefix: string, out: string[]) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue;
		if (SKIP_DIRS.has(entry.name)) continue;
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			walkAssets(abs, relative, out);
			continue;
		}
		if (!entry.isFile()) continue;
		if (entry.name.toLowerCase().endsWith('.md')) continue;
		out.push(relative.replace(/\\/g, '/'));
	}
}

function assetUsageByPath(): Map<string, number> {
	const counts = new Map<string, Set<string>>();
	for (const doc of listDocuments()) {
		let content: string;
		try {
			content = readDocument(doc.relativePath);
		} catch {
			continue;
		}
		for (const asset of extractLocalAssetRefs(content, doc.relativePath)) {
			let set = counts.get(asset);
			if (!set) {
				set = new Set();
				counts.set(asset, set);
			}
			set.add(doc.id);
		}
	}
	const usedIn = new Map<string, number>();
	for (const [path, docs] of counts) usedIn.set(path, docs.size);
	return usedIn;
}

export function listAssets(): VaultAsset[] {
	const paths: string[] = [];
	walkAssets(documentsDir(), '', paths);
	const usage = assetUsageByPath();
	return paths
		.sort((a, b) => a.localeCompare(b))
		.map((relativePath) => ({
			relativePath,
			name: relativePath.split('/').pop() ?? relativePath,
			usedIn: usage.get(relativePath) ?? 0
		}));
}

export function uniqueAssetRelativePath(filename: string, opts?: { except?: string }): string {
	const original = relativeAssetPath(filename);
	if (!relativePathTaken(original, opts?.except)) return original;
	const slash = original.lastIndexOf('/');
	const dir = slash === -1 ? '' : original.slice(0, slash);
	const base = slash === -1 ? original : original.slice(slash + 1);
	const dot = base.lastIndexOf('.');
	const stem = dot > 0 ? base.slice(0, dot) : base;
	const ext = dot > 0 ? base.slice(dot) : '';
	let i = 2;
	let relativePath = dir ? `${dir}/${stem} (${i})${ext}` : `${stem} (${i})${ext}`;
	while (relativePathTaken(relativePath, opts?.except)) {
		i++;
		relativePath = dir ? `${dir}/${stem} (${i})${ext}` : `${stem} (${i})${ext}`;
	}
	return relativePath;
}

export async function uploadAsset(
	filename: string,
	body: Buffer | Uint8Array
): Promise<{ relativePath: string }> {
	const relativePath = uniqueAssetRelativePath(filename);
	if (!imageContentType(relativePath)) {
		throw new Error('Upload an image file');
	}
	const path = vaultFilePath(relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, body);
	await maybeGitCommit(relativePath, `upload asset: ${relativePath}`);
	return { relativePath };
}

export function readVaultAsset(
	relativePath: string
): { body: Buffer; contentType: string; fileName: string } | null {
	let path: string;
	try {
		path = vaultFilePath(relativePath);
	} catch {
		return null;
	}
	if (!existsSync(path) || relativePath.toLowerCase().endsWith('.md')) return null;
	const fileName = relativePath.replace(/\\/g, '/').split('/').pop() ?? relativePath;
	const contentType = imageContentType(relativePath) ?? 'application/octet-stream';
	return { body: readFileSync(path), contentType, fileName };
}

export async function renameAsset(opts: {
	relativePath: string;
	filename: string;
	actorId: string;
}): Promise<{ relativePath: string }> {
	const from = opts.relativePath.replace(/\\/g, '/');
	if (!from || from.toLowerCase().endsWith('.md')) throw new Error('Asset not found');
	const fromPath = vaultFilePath(from);
	if (!existsSync(fromPath)) throw new Error('Asset not found');

	const nextName = opts.filename.replace(/\s+/g, ' ').trim();
	if (!nextName) throw new Error('File name is required');
	const dir = dirname(from.replace(/\\/g, '/'));
	const file = relativeAssetPath(nextName).split('/').pop()!;
	const candidate = dir === '.' ? file : `${dir}/${file}`;
	const to = uniqueAssetRelativePath(candidate, { except: from });
	if (to === from) return { relativePath: from };

	const toPath = vaultFilePath(to);
	mkdirSync(dirname(toPath), { recursive: true });
	renameSync(fromPath, toPath);
	await maybeGitMove(from, to, `rename asset: ${to}`);

	for (const doc of listDocuments()) {
		let content: string;
		try {
			content = readDocument(doc.relativePath);
		} catch {
			continue;
		}
		const next = rewriteMarkdownAssetRefs(content, doc.relativePath, from, to);
		if (next === content) continue;
		await commitWrite({
			documentId: doc.id,
			content: next,
			source: 'edit',
			actorId: opts.actorId
		});
	}

	return { relativePath: to };
}

export async function deleteAsset(relativePath: string): Promise<boolean> {
	const pathKey = relativePath.replace(/\\/g, '/');
	if (!pathKey || pathKey.toLowerCase().endsWith('.md')) return false;
	let abs: string;
	try {
		abs = vaultFilePath(pathKey);
	} catch {
		return false;
	}
	if (!existsSync(abs)) return false;
	await maybeGitRemove(pathKey, `delete asset: ${pathKey}`);
	if (existsSync(abs)) unlinkSync(abs);
	return true;
}

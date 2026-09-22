import { isTriggering } from '$lib/notify';

export type DigestEntry = {
	id: string;
	kind: string;
	actorName: string;
	documentSlug: string;
	documentTitle: string;
	annotationId: string | null;
	threadId: string | null;
	/** The passage the annotation is anchored to. */
	quote: string | null;
	/** Comment text, or a suggestion's proposed replacement. */
	body: string | null;
};

export type ComposedMail = {
	subject: string;
	text: string;
	html: string;
	headers: Record<string, string>;
};

const MAX_QUOTE = 160;
/** Past this many of one passenger kind, count them instead of listing them. */
const NAME_LIMIT = 4;

function truncate(value: string, max = MAX_QUOTE): string {
	const flat = value.replace(/\s+/g, ' ').trim();
	return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

function link(origin: string, entry: DigestEntry): string {
	const base = `${origin}/documents/${encodeURIComponent(entry.documentSlug)}`;
	const target = entry.threadId ?? entry.annotationId;
	return target ? `${base}?annotation=${encodeURIComponent(target)}` : base;
}

function actionPhrase(entry: DigestEntry): string {
	if (entry.kind === 'reply') return 'replied to a thread on';
	if (entry.kind === 'suggestion') return 'suggested an edit on';
	return 'commented on';
}

function subjectFor(triggers: DigestEntry[], docs: string[]): string {
	if (triggers.length === 1) {
		const only = triggers[0];
		return `${only.actorName} ${actionPhrase(only)} “${only.documentTitle}”`;
	}
	const actors = [...new Set(triggers.map((entry) => entry.actorName))];
	if (docs.length === 1) {
		const title = triggers[0].documentTitle;
		return actors.length === 1
			? `${actors[0]} reviewed “${title}”`
			: `${plural(triggers.length, 'new item')} on “${title}”`;
	}
	return `Glassine: ${plural(triggers.length, 'new item')} on ${plural(docs.length, 'article')}`;
}

/** "12 of your suggestions were accepted, 3 rejected" — or names them while the list is short. */
function passengerLines(passengers: DigestEntry[]): string[] {
	const lines: string[] = [];
	const group = (kind: string) => passengers.filter((entry) => entry.kind === kind);

	const accepted = group('accepted');
	const rejected = group('rejected');
	if (accepted.length || rejected.length) {
		const parts: string[] = [];
		if (accepted.length) parts.push(`${plural(accepted.length, 'suggestion')} accepted`);
		if (rejected.length) parts.push(`${rejected.length} rejected`);
		lines.push(parts.join(', '));
		const named = [...accepted, ...rejected].filter((entry) => entry.quote);
		if (named.length && named.length <= NAME_LIMIT) {
			for (const entry of named) {
				const verb = entry.kind === 'accepted' ? 'accepted' : 'rejected';
				lines.push(`    ${verb}: “${truncate(entry.quote ?? '', 80)}”`);
			}
		}
	}

	const resolved = group('resolved');
	if (resolved.length) {
		lines.push(`${plural(resolved.length, 'thread')} resolved`);
		const named = resolved.filter((entry) => entry.quote);
		if (named.length && named.length <= NAME_LIMIT) {
			for (const entry of named) lines.push(`    “${truncate(entry.quote ?? '', 80)}”`);
		}
	}
	return lines;
}

/**
 * Turns one recipient's pending notifications into a single message.
 *
 * Triggering entries are the body; passenger entries are summarised at the end.
 * A batch with no triggers should never reach here — the dispatcher checks first.
 */
export function composeDigest(
	entries: DigestEntry[],
	opts: { origin: string; domain: string; batchId: string }
): ComposedMail {
	const triggers = entries.filter((entry) => isTriggering(entry.kind));
	const passengers = entries.filter((entry) => !isTriggering(entry.kind));
	const docs = [...new Set(triggers.map((entry) => entry.documentSlug))];

	const text: string[] = [];
	const html: string[] = [
		'<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">'
	];

	for (const slug of docs) {
		const inDoc = triggers.filter((entry) => entry.documentSlug === slug);
		const title = inDoc[0].documentTitle;
		if (docs.length > 1) {
			text.push(`## ${title}`, '');
			html.push(`<h2 style="font-size:16px;margin:24px 0 8px">${escapeHtml(title)}</h2>`);
		}
		for (const entry of inDoc) {
			const href = link(opts.origin, entry);
			text.push(`${entry.actorName} ${actionPhrase(entry)} “${title}”.`);
			html.push(
				`<p style="margin:16px 0 4px"><strong>${escapeHtml(entry.actorName)}</strong> ${escapeHtml(actionPhrase(entry))} “${escapeHtml(title)}”.</p>`
			);
			if (entry.quote) {
				text.push(`  > ${truncate(entry.quote)}`);
				html.push(
					`<blockquote style="margin:4px 0;padding-left:12px;border-left:3px solid #d0d0d0;color:#555">${escapeHtml(truncate(entry.quote))}</blockquote>`
				);
			}
			if (entry.body) {
				text.push(`  ${entry.actorName}: ${truncate(entry.body, 400)}`);
				html.push(
					`<p style="margin:4px 0">${escapeHtml(truncate(entry.body, 400))}</p>`
				);
			}
			text.push(`  ${href}`, '');
			html.push(`<p style="margin:4px 0"><a href="${escapeHtml(href)}">Open in Glassine</a></p>`);
		}
	}

	const extra = passengerLines(passengers);
	if (extra.length) {
		text.push('Also since your last email:');
		for (const line of extra) text.push(`  - ${line}`);
		text.push('');
		html.push(
			'<h3 style="font-size:14px;margin:24px 0 4px;color:#555">Also since your last email</h3>',
			`<ul style="margin:4px 0;padding-left:20px;color:#555">${extra
				.map((line) => `<li>${escapeHtml(line.trim())}</li>`)
				.join('')}</ul>`
		);
	}

	text.push(`Open Glassine: ${opts.origin}/`);
	html.push(
		`<p style="margin:24px 0 0;font-size:13px;color:#777"><a href="${escapeHtml(opts.origin)}/">Open Glassine</a></p>`,
		'</div>'
	);

	// One thread means clients can collapse the conversation; a batch that spans
	// threads references the document instead.
	const threads = [...new Set(triggers.map((entry) => entry.threadId ?? entry.annotationId))];
	const reference =
		threads.length === 1 && threads[0]
			? `<glassine.thread.${threads[0]}@${opts.domain}>`
			: `<glassine.doc.${docs[0]}@${opts.domain}>`;

	return {
		subject: subjectFor(triggers, docs),
		text: text.join('\n'),
		html: html.join(''),
		headers: {
			'Message-ID': `<glassine.batch.${opts.batchId}@${opts.domain}>`,
			References: reference,
			'In-Reply-To': reference,
			'List-Id': `Glassine <glassine.${opts.domain}>`
		}
	};
}

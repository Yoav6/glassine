import nodemailer, { type Transporter } from 'nodemailer';
import { mailEnabled, mailFrom, smtpUrl } from './env';

export type MailMessage = {
	to: string;
	subject: string;
	text: string;
	html?: string;
	headers?: Record<string, string>;
};

let transport: Transporter | null = null;
let override: Transporter | null = null;

/** Lets a test capture messages without an SMTP server. Pass null to restore. */
export function setTransportForTests(fake: Transporter | null) {
	override = fake;
	transport = null;
}

function getTransport(): Transporter | null {
	if (override) return override;
	if (!smtpUrl()) return null;
	// nodemailer parses the whole connection out of the URL, so any provider
	// works from one env var: smtps://user:pass@host:465, smtp://…:587, etc.
	transport ??= nodemailer.createTransport(smtpUrl());
	return transport;
}

/**
 * Sends one message, or logs it when SMTP is not configured. Callers must not
 * assume delivery: the dispatcher is what retries, and this throws on failure so
 * it can.
 */
export async function sendMail(opts: MailMessage) {
	const from = mailFrom();
	const tx = getTransport();
	if (!tx || !from) {
		console.info(`[mail:dry-run] to=${opts.to} subject=${opts.subject}\n${opts.text}`);
		return;
	}
	await tx.sendMail({
		from,
		to: opts.to,
		subject: opts.subject,
		text: opts.text,
		...(opts.html ? { html: opts.html } : {}),
		...(opts.headers ? { headers: opts.headers } : {})
	});
}

/** Checks the SMTP settings without sending anything. Used by the settings page. */
export async function verifyMail(): Promise<{ ok: boolean; error?: string }> {
	if (!mailEnabled()) return { ok: false, error: 'SMTP_URL and MAIL_FROM are not set.' };
	if (!smtpUrl()) return { ok: false, error: 'SMTP_URL is not set.' };
	if (!mailFrom()) return { ok: false, error: 'MAIL_FROM is not set.' };
	const tx = getTransport();
	if (!tx) return { ok: false, error: 'No transport could be created from SMTP_URL.' };
	try {
		const result = await Promise.race([
			tx.verify(),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('SMTP verification timed out after 5 seconds')), 5000)
			)
		]);
		return { ok: true };
	} catch (err) {
		if (err instanceof Error && err.message.includes('timed out')) {
			return {
				ok: false,
				error: `SMTP connection timeout: Check that SMTP_URL (${mailHost()}) is reachable from your server`
			};
		}
		return {
			ok: false,
			error: `SMTP connection failed: ${err instanceof Error ? err.message : 'unknown error'}`
		};
	}
}

/** Host shown on the settings page, without leaking the password in SMTP_URL. */
export function mailHost(): string {
	try {
		return new URL(smtpUrl()).host;
	} catch {
		return '';
	}
}

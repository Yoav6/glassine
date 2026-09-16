export async function sendMail(opts: { to: string; subject: string; text: string }) {
	const from = process.env.MAIL_FROM;
	const smtp = process.env.SMTP_URL;
	if (!from || !smtp) {
		console.info(`[mail:dry-run] to=${opts.to} subject=${opts.subject}\n${opts.text}`);
		return;
	}
	console.warn('SMTP_URL is set but a transport is not wired in v1 beyond logging. Set up a provider later.');
	console.info(`[mail] to=${opts.to} subject=${opts.subject}\n${opts.text}`);
}

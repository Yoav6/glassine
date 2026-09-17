import { TAB_ACCOUNT_KEY, TAB_NONCE_KEY } from './accounts';

export function readTabAccountId(): string | null {
	try {
		return sessionStorage.getItem(TAB_ACCOUNT_KEY);
	} catch {
		return null;
	}
}

function newNonce(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}
}

export function ensureTabNonce(): string | null {
	try {
		let nonce = sessionStorage.getItem(TAB_NONCE_KEY);
		if (!nonce) {
			nonce = newNonce();
			sessionStorage.setItem(TAB_NONCE_KEY, nonce);
		}
		return nonce;
	} catch {
		return null;
	}
}

export function writeTabAccountId(userId: string) {
	try {
		sessionStorage.setItem(TAB_ACCOUNT_KEY, userId);
		ensureTabNonce();
	} catch {
		// Private mode can throw; the chooser still works, this tab just cannot remember.
	}
}

export function clearTabAccountId() {
	try {
		sessionStorage.removeItem(TAB_ACCOUNT_KEY);
		sessionStorage.removeItem(TAB_NONCE_KEY);
	} catch {
		// ignore
	}
}

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			session: import('better-auth').Session | null;
			user: (import('better-auth').User & {
				role?: 'author' | 'reviewer';
				highlightColor?: string | null;
			}) | null;
			deviceAccounts: import('$lib/accounts').DeviceAccount[];
			needsAccountChoice: boolean;
		}
	}
}

export {};

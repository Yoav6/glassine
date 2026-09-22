// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			session: import('better-auth').Session | null;
			user:
				| (Omit<import('better-auth').User, 'email'> & {
						// Better Auth's own type says `string`; reviewers may not
						// have one. See $lib/server/guard.ts.
						email: string | null;
						role?: 'author' | 'reviewer';
						highlightColor?: string | null;
				  })
				| null;
			deviceAccounts: import('$lib/accounts').DeviceAccount[];
			needsAccountChoice: boolean;
		}
	}
}

export {};

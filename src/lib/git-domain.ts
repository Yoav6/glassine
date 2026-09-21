/**
 * Default hostname for the git HTTP remote.
 *
 * It sits next to the app, not under it: `glassine-git.` plus the app's parent
 * domain. `DOMAIN=glassine.example.com` and `DOMAIN=example.com` both give
 * `glassine-git.example.com`. That keeps it one label below the registrable
 * domain, so a wildcard certificate (`*.example.com`, SWAG's default) covers it;
 * `git.glassine.example.com` would be two labels deep and would not be.
 *
 * A DOMAIN with three or more labels is treated as app-subdomain-plus-parent.
 * That is wrong for an apex under a multi-part suffix such as `example.co.uk`;
 * set `GIT_DOMAIN` explicitly there.
 */
export function defaultGitDomain(domain: string): string {
	const labels = domain.split('.');
	const parent = labels.length >= 3 ? labels.slice(1) : labels;
	return `glassine-git.${parent.join('.')}`;
}

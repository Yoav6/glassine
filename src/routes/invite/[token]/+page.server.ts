import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	return {
		token: params.token,
		next: url.searchParams.get('article') ? `/articles/${url.searchParams.get('article')}` : '/reviews'
	};
};

import { requireAuthor } from '$lib/server/guard';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const user = requireAuthor(event);
	return { user };
};

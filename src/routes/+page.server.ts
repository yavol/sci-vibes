import { readPublicResearchState } from '$lib/server/runStore';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		state: await readPublicResearchState()
	};
};

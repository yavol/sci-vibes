import { json } from '@sveltejs/kit';
import { readPublicResearchState } from '$lib/server/runStore';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const state = await readPublicResearchState();
	return json(state, {
		headers: {
			'cache-control': 'no-store, max-age=0'
		}
	});
};

import { json } from '@sveltejs/kit';
import { enqueueControlCommand, parseControlCommand } from '$lib/server/runStore';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ accepted: false, error: 'Request body must be valid JSON.' }, { status: 400 });
	}

	try {
		const input = parseControlCommand(body);
		const command = await enqueueControlCommand(input);
		return json(
			{
				accepted: true,
				commandId: command.id,
				createdAt: command.createdAt
			},
			{ status: 202 }
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to enqueue command.';
		return json({ accepted: false, error: message }, { status: 400 });
	}
};

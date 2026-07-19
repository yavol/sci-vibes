import { Codex } from '@openai/codex-sdk';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import {
	appendJsonl,
	compactError,
	ensureDir,
	isoNow,
	writeJsonAtomic,
	writeTextAtomic
} from './run-store.mjs';

const SUBSCRIPTION_ENV_ALLOWLIST = [
	'PATH',
	'HOME',
	'SHELL',
	'USER',
	'LOGNAME',
	'TMPDIR',
	'TEMP',
	'TMP',
	'LANG',
	'LC_ALL',
	'HTTP_PROXY',
	'HTTPS_PROXY',
	'NO_PROXY',
	'CODEX_HOME',
	'CHATGPT_CODEX_PROXY_URL',
	'CHATGPT_CODEX_PROXY_API_KEY'
];

export function minimalCodexEnvironment(source = process.env) {
	const environment = {};
	for (const name of SUBSCRIPTION_ENV_ALLOWLIST) {
		const value = source[name];
		if (value !== undefined) environment[name] = value;
	}
	return environment;
}

export async function runCodexSdkTurn({
	prompt,
	workDir,
	eventsPath,
	lastMessagePath,
	summaryPath,
	threadStatePath,
	resumeThreadId = null,
	outputSchema,
	model = process.env.SCI_VIBES_CODEX_MODEL || undefined,
	thinkingLevel = process.env.SCI_VIBES_CODEX_REASONING || 'high',
	timeoutMs = Number(process.env.SCI_VIBES_CODEX_TIMEOUT_MS || 2_700_000),
	signal: externalSignal,
	onThreadId
}) {
	await ensureDir(workDir);
	await ensureDir(path.dirname(eventsPath));
	await writeTextAtomic(eventsPath, '');
	if (lastMessagePath) await writeTextAtomic(lastMessagePath, '');

	const controller = new AbortController();
	let abortKind = null;
	const abortFromExternal = () => {
		abortKind = abortKind ?? 'canceled';
		controller.abort(externalSignal?.reason);
	};
	if (externalSignal?.aborted) abortFromExternal();
	else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

	const timer =
		timeoutMs > 0
			? setTimeout(() => {
					abortKind = abortKind ?? 'timed_out';
					controller.abort(new Error(`Codex turn exceeded ${timeoutMs} ms.`));
				}, timeoutMs)
			: null;

	const startedAt = isoNow();
	const started = performance.now();
	let threadId = resumeThreadId;
	let finalResponse = '';
	let fatalError = null;
	let turnCompletedCount = 0;
	let turnFailedCount = 0;
	let eventCount = 0;
	let commandCount = 0;
	let failedCommandCount = 0;
	let fileChangeCount = 0;
	let agentMessageCount = 0;
	let usage = null;

	try {
		const codex = new Codex({ env: minimalCodexEnvironment() });
		const threadOptions = {
			...(model ? { model } : {}),
			modelReasoningEffort: thinkingLevel,
			sandboxMode: 'workspace-write',
			approvalPolicy: 'never',
			workingDirectory: workDir,
			skipGitRepoCheck: false,
			networkAccessEnabled: false,
			webSearchMode: 'disabled',
			additionalDirectories: []
		};
		const thread = resumeThreadId
			? codex.resumeThread(resumeThreadId, threadOptions)
			: codex.startThread(threadOptions);
		const streamed = await thread.runStreamed(prompt, {
			signal: controller.signal,
			...(outputSchema ? { outputSchema } : {})
		});

		for await (const event of streamed.events) {
			eventCount += 1;
			await appendJsonl(eventsPath, event);

			if (event.type === 'thread.started') {
				threadId = event.thread_id;
				const threadState = { threadId, persistedAt: isoNow() };
				if (threadStatePath) await writeJsonAtomic(threadStatePath, threadState);
				if (onThreadId) await onThreadId(threadId);
			}
			if (event.type === 'turn.completed') {
				turnCompletedCount += 1;
				usage = event.usage ?? null;
			}
			if (event.type === 'turn.failed') {
				turnFailedCount += 1;
				fatalError = event.error?.message ?? 'Codex turn failed.';
			}
			if (event.type === 'error') {
				fatalError = event.message || 'Codex event stream failed.';
			}
			if (event.type === 'item.completed' && event.item?.type === 'error') {
				fatalError = event.item.message || 'Codex emitted an error item.';
			}
			if (event.type === 'item.completed' && event.item?.type === 'command_execution') {
				commandCount += 1;
				if (event.item.status === 'failed' || Number(event.item.exit_code ?? 0) !== 0) {
					failedCommandCount += 1;
				}
			}
			if (event.type === 'item.completed' && event.item?.type === 'file_change') {
				fileChangeCount += event.item.changes?.length ?? 0;
			}
			if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
				agentMessageCount += 1;
				finalResponse = event.item.text ?? '';
				if (lastMessagePath) await writeTextAtomic(lastMessagePath, finalResponse);
			}
		}
	} catch (error) {
		if (!controller.signal.aborted) fatalError = compactError(error);
	} finally {
		if (timer) clearTimeout(timer);
		externalSignal?.removeEventListener('abort', abortFromExternal);
	}

	if (!abortKind && !fatalError && turnCompletedCount !== 1) {
		fatalError = `Expected exactly one turn.completed event; received ${turnCompletedCount}.`;
	}
	if (!abortKind && !fatalError && turnFailedCount > 0) {
		fatalError = 'Codex reported a failed turn.';
	}
	if (!abortKind && !fatalError && !threadId) {
		fatalError = 'Codex completed without emitting a thread id.';
	}
	if (!abortKind && !fatalError && !finalResponse.trim()) {
		fatalError = 'Codex completed without a final response.';
	}

	let structuredOutput = null;
	let validationErrors = [];
	if (!abortKind && !fatalError && outputSchema) {
		try {
			structuredOutput = JSON.parse(finalResponse);
			validationErrors = validateJsonSchema(structuredOutput, outputSchema);
			if (validationErrors.length > 0) {
				fatalError = `Structured output failed schema validation: ${validationErrors
					.slice(0, 8)
					.join('; ')}`;
			}
		} catch (error) {
			fatalError = `Structured output was not valid JSON: ${compactError(error)}`;
		}
	}

	const status = abortKind ?? (fatalError ? 'failed' : 'passed');
	const summary = {
		status,
		error: fatalError ? compactError(fatalError) : null,
		threadId,
		model: model ?? 'codex-default',
		thinkingLevel,
		workDir,
		startedAt,
		finishedAt: isoNow(),
		durationSeconds: Number(((performance.now() - started) / 1000).toFixed(3)),
		eventCount,
		turnCompletedCount,
		turnFailedCount,
		commandCount,
		failedCommandCount,
		fileChangeCount,
		agentMessageCount,
		usage,
		validationErrors
	};
	if (summaryPath) await writeJsonAtomic(summaryPath, summary);

	return { ...summary, finalResponse, structuredOutput };
}

export function validateJsonSchema(value, schema, location = '$', rootSchema = schema) {
	const errors = [];
	if (!schema || typeof schema !== 'object') return errors;
	if (schema.$ref) {
		const resolved = resolveLocalReference(rootSchema, schema.$ref);
		if (!resolved) return [`${location} uses unresolved schema reference ${schema.$ref}`];
		return validateJsonSchema(value, resolved, location, rootSchema);
	}

	if (schema.const !== undefined && value !== schema.const) {
		errors.push(`${location} must equal ${JSON.stringify(schema.const)}`);
		return errors;
	}
	if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => candidate === value)) {
		errors.push(`${location} must be one of ${schema.enum.map(JSON.stringify).join(', ')}`);
		return errors;
	}
	if (Array.isArray(schema.anyOf)) {
		const candidateErrors = schema.anyOf.map((candidate) =>
			validateJsonSchema(value, candidate, location, rootSchema)
		);
		if (candidateErrors.every((candidate) => candidate.length > 0)) {
			errors.push(`${location} did not match any allowed schema`);
		}
		return errors;
	}

	const actualType = jsonType(value);
	if (schema.type && actualType !== schema.type && !(schema.type === 'number' && actualType === 'integer')) {
		errors.push(`${location} must be ${schema.type}, received ${actualType}`);
		return errors;
	}

	if (actualType === 'object') {
		const properties = schema.properties ?? {};
		for (const required of schema.required ?? []) {
			if (!Object.hasOwn(value, required)) errors.push(`${location}.${required} is required`);
		}
		if (schema.additionalProperties === false) {
			for (const key of Object.keys(value)) {
				if (!Object.hasOwn(properties, key)) errors.push(`${location}.${key} is not allowed`);
			}
		}
		for (const [key, childSchema] of Object.entries(properties)) {
			if (Object.hasOwn(value, key)) {
				errors.push(
					...validateJsonSchema(value[key], childSchema, `${location}.${key}`, rootSchema)
				);
			}
		}
	}

	if (actualType === 'array') {
		if (schema.minItems !== undefined && value.length < schema.minItems) {
			errors.push(`${location} must contain at least ${schema.minItems} items`);
		}
		if (schema.maxItems !== undefined && value.length > schema.maxItems) {
			errors.push(`${location} must contain at most ${schema.maxItems} items`);
		}
		if (schema.items) {
			value.forEach((item, index) => {
				errors.push(
					...validateJsonSchema(item, schema.items, `${location}[${index}]`, rootSchema)
				);
			});
		}
	}

	if (actualType === 'string') {
		if (schema.minLength !== undefined && value.length < schema.minLength) {
			errors.push(`${location} must be at least ${schema.minLength} characters`);
		}
		if (schema.maxLength !== undefined && value.length > schema.maxLength) {
			errors.push(`${location} must be at most ${schema.maxLength} characters`);
		}
		if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
			errors.push(`${location} does not match its required pattern`);
		}
	}

	if ((actualType === 'number' || actualType === 'integer') && schema.minimum !== undefined) {
		if (value < schema.minimum) errors.push(`${location} must be >= ${schema.minimum}`);
	}
	if ((actualType === 'number' || actualType === 'integer') && schema.maximum !== undefined) {
		if (value > schema.maximum) errors.push(`${location} must be <= ${schema.maximum}`);
	}

	return errors;
}

function jsonType(value) {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	if (Number.isInteger(value)) return 'integer';
	if (typeof value === 'number') return 'number';
	return typeof value;
}

function resolveLocalReference(rootSchema, reference) {
	if (typeof reference !== 'string' || !reference.startsWith('#/')) return null;
	let current = rootSchema;
	for (const rawPart of reference.slice(2).split('/')) {
		const part = rawPart.replaceAll('~1', '/').replaceAll('~0', '~');
		if (!current || typeof current !== 'object' || !Object.hasOwn(current, part)) return null;
		current = current[part];
	}
	return current;
}

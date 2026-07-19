// @ts-ignore The app runs on Node; this starter intentionally does not install global Node typings.
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
// @ts-expect-error The app runs on Node; this starter intentionally does not install global Node typings.
import { dirname, resolve } from 'node:path';
// @ts-expect-error The app runs on Node; this starter intentionally does not install global Node typings.
import { fileURLToPath } from 'node:url';
import type {
	BranchProjection,
	BranchStatus,
	ControlAction,
	ControlCommand,
	DatasetPublicManifest,
	ManagerHealth,
	ManagerStatus,
	MetricProjection,
	ProposalProjection,
	PublicResearchState,
	ResearchStage,
	RunProjection,
	SanitizedEvent,
	VibeApplyMode,
	VibeCard
} from '$lib/research/types';

const SAFE_ID = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
const MAX_EVENT_COUNT = 80;
const MAX_EVENT_BYTES = 512 * 1024;
const MAX_BRANCHES = 4;
const MAX_TEXT = 2_000;
const MAX_LIST_ITEMS = 24;
const HEARTBEAT_STALE_MS = 30_000;

type JsonObject = Record<string, unknown>;
type DirectoryEntry = { name: string; isDirectory(): boolean };

declare const process: {
	env: Record<string, string | undefined>;
	cwd(): string;
};

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function isObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback = '', max = MAX_TEXT): string {
	return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function asNullableString(value: unknown, max = MAX_TEXT): string | null {
	const text = asString(value, '', max);
	return text.length > 0 ? text : null;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asInteger(value: unknown, fallback = 0): number {
	const number = asFiniteNumber(value, fallback);
	return Number.isInteger(number) ? number : fallback;
}

function asStringList(value: unknown, maxItems = MAX_LIST_ITEMS, maxText = 500): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => asString(item, '', maxText))
		.filter(Boolean)
		.slice(0, maxItems);
}

function isSafeId(value: unknown): value is string {
	return typeof value === 'string' && SAFE_ID.test(value);
}

function toIso(value: unknown): string | null {
	if (typeof value !== 'string' && typeof value !== 'number') return null;
	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function normalizeStage(value: unknown): ResearchStage {
	const stages: ResearchStage[] = [
		'idle',
		'proposer',
		'awaiting_human',
		'implementer',
		'evaluation',
		'judge',
		'conclusions',
		'complete',
		'stopped',
		'failed'
	];
	if (stages.includes(value as ResearchStage)) return value as ResearchStage;
	const aliases: Record<string, ResearchStage> = {
		created: 'idle',
		proposing: 'proposer',
		implementing: 'implementer',
		public_evaluating: 'evaluation',
		final_evaluating: 'evaluation',
		judging: 'judge',
		concluding: 'conclusions',
		frozen: 'complete',
		canceled: 'stopped',
		timed_out: 'failed'
	};
	return typeof value === 'string' ? (aliases[value] ?? 'idle') : 'idle';
}

function normalizeStatus(value: unknown): BranchStatus {
	const statuses: BranchStatus[] = [
		'queued',
		'running',
		'awaiting_human',
		'stopped',
		'failed',
		'complete'
	];
	if (statuses.includes(value as BranchStatus)) return value as BranchStatus;
	const aliases: Record<string, BranchStatus> = {
		created: 'queued',
		proposing: 'running',
		implementing: 'running',
		public_evaluating: 'running',
		final_evaluating: 'running',
		judging: 'running',
		concluding: 'running',
		frozen: 'complete',
		canceled: 'stopped',
		timed_out: 'failed'
	};
	return typeof value === 'string' ? (aliases[value] ?? 'queued') : 'queued';
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function looksLikeWorkspace(path: string): Promise<boolean> {
	try {
		const packageJson = JSON.parse(await readFile(resolve(path, 'package.json'), 'utf8')) as JsonObject;
		return packageJson.name === 'sci-vibes';
	} catch {
		return false;
	}
}

let workspaceRootPromise: Promise<string> | null = null;

export function getWorkspaceRoot(): Promise<string> {
	if (!workspaceRootPromise) {
		workspaceRootPromise = (async () => {
			const candidates = [
				process.env.SCI_VIBES_ROOT,
				process.cwd(),
				sourceRoot
			].filter((candidate): candidate is string => Boolean(candidate));

			for (const candidate of candidates) {
				const absolute = resolve(candidate);
				if (await looksLikeWorkspace(absolute)) return absolute;
			}

			// sourceRoot remains deterministic even before package metadata is available.
			return sourceRoot;
		})();
	}
	return workspaceRootPromise;
}

async function readJson(path: string): Promise<unknown | null> {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as unknown;
	} catch {
		return null;
	}
}

function sanitizeDataset(raw: unknown): DatasetPublicManifest | null {
	if (!isObject(raw)) return null;
	const rows = isObject(raw.rows) ? raw.rows : {};
	const curves = isObject(raw.curves) ? raw.curves : {};
	const split = isObject(raw.split) ? raw.split : {};

	return {
		datasetId: asString(raw.dataset_id ?? raw.datasetId, 'retalt1-aedb-v3', 100),
		name: asString(raw.name, 'RETALT1 Aerodynamic Data Base 2.0', 200),
		version: asString(raw.version, '', 50),
		source: asString(raw.source, '', 500),
		doi: asString(raw.doi, '', 100),
		license: asString(raw.license, '', 100),
		rows: {
			all: asInteger(rows.all),
			train: asInteger(rows.train),
			validation: asInteger(rows.validation),
			hidden: asInteger(rows.hidden)
		},
		curves: {
			all: asInteger(curves.all),
			train: asInteger(curves.train),
			validation: asInteger(curves.validation),
			hidden: asInteger(curves.hidden)
		},
		features: asStringList(raw.features, 40, 100),
		targets: asStringList(raw.targets, 40, 100),
		tolerances: asStringList(raw.tolerances, 40, 100),
		split: {
			train: asString(split.train, 'Public development split.', 300),
			validation: asString(split.validation, 'Public validation split.', 300),
			// Deliberately replace any stored description that could identify held-out configurations.
			hidden: 'Sealed manager-only evaluation split.'
		},
		scientificScope: asString(raw.scientific_scope ?? raw.scientificScope, '', 500)
	};
}

async function readManagerHealth(root: string): Promise<ManagerHealth> {
	const runsRoot = resolve(root, 'runs');
	const candidates = [
		resolve(runsRoot, 'manager-health.json'),
		resolve(runsRoot, 'manager.json'),
		resolve(runsRoot, 'state', 'manager.json')
	];

	let raw: JsonObject | null = null;
	for (const candidate of candidates) {
		const value = await readJson(candidate);
		if (isObject(value)) {
			raw = value;
			break;
		}
	}

	if (!raw) {
		return {
			status: 'offline',
			heartbeatAt: null,
			activeRunId: null,
			pid: null,
			message: 'Research manager is not reporting.'
		};
	}

	const heartbeatAt = toIso(
		raw.heartbeatAt ?? raw.lastHeartbeatAt ?? raw.heartbeat_at ?? raw.updatedAt
	);
	const heartbeatAge = heartbeatAt ? Date.now() - new Date(heartbeatAt).valueOf() : Infinity;
	const claimed = asString(raw.status, 'idle', 30);
	const validStatuses: ManagerStatus[] = ['offline', 'idle', 'running', 'degraded'];
	let status: ManagerStatus = validStatuses.includes(claimed as ManagerStatus)
		? (claimed as ManagerStatus)
		: 'idle';
	if (status !== 'offline' && heartbeatAge > HEARTBEAT_STALE_MS) status = 'offline';

	const activeRunId = raw.activeRunId ?? raw.active_run_id;
	return {
		status,
		heartbeatAt,
		activeRunId: isSafeId(activeRunId) ? activeRunId : null,
		pid: asInteger(raw.pid) > 0 ? asInteger(raw.pid) : null,
		message:
			status === 'offline'
				? 'Research manager heartbeat is stale.'
				: asString(raw.publicMessage ?? raw.message, status === 'running' ? 'Research in progress.' : 'Ready.', 300)
	};
}

function sanitizeProposal(raw: unknown): ProposalProjection | null {
	if (!isObject(raw)) return null;
	const architecture = isObject(raw.architecture) ? raw.architecture : {};
	const nodes = Array.isArray(architecture.nodes) ? architecture.nodes : [];
	const edges = Array.isArray(architecture.edges) ? architecture.edges : [];
	const title = asString(raw.title, '', 160);
	const thesis = asString(raw.thesis, '', 1_200);
	const summary = asString(raw.summary, '', 2_000);
	if (!title && !thesis && !summary) return null;

	return {
		title: title || 'Untitled architecture',
		shortName: asString(raw.shortName ?? raw.short_name, title || 'Proposal', 80),
		thesis,
		summary,
		architecture: {
			nodes: nodes
				.filter(isObject)
				.map((node, index) => ({
					id: asString(node.id, `node-${index + 1}`, 80),
					label: asString(node.label, `Stage ${index + 1}`, 120),
					detail: asString(node.detail, '', 500)
				}))
				.slice(0, 16),
			edges: edges
				.filter(isObject)
				.map((edge) => ({
					from: asString(edge.from, '', 80),
					to: asString(edge.to, '', 80),
					label: asString(edge.label, '', 120)
				}))
				.filter((edge) => edge.from && edge.to)
				.slice(0, 24)
		},
		trainingPlan: asStringList(raw.trainingPlan ?? raw.training_plan),
		inductiveBiases: asStringList(raw.inductiveBiases ?? raw.inductive_biases),
		visibleMetrics: asStringList(raw.visibleMetrics ?? raw.visible_metrics),
		strengths: asStringList(raw.strengths),
		risks: asStringList(raw.risks),
		falsificationTests: asStringList(raw.falsificationTests ?? raw.falsification_tests),
		expectedComplexity: asString(raw.expectedComplexity ?? raw.expected_complexity, '', 300),
		expectedRuntime: asString(raw.expectedRuntime ?? raw.expected_runtime, '', 300),
		humanQuestions: asStringList(raw.humanQuestions ?? raw.human_questions),
		comparisonHook: asString(raw.comparisonHook ?? raw.comparison_hook, '', 500)
	};
}

async function readBranch(
	runRoot: string,
	id: string,
	runBranch: JsonObject | null
): Promise<BranchProjection> {
	const branchRoot = resolve(runRoot, 'branches', id);
	const stored = await readJson(resolve(branchRoot, 'branch.json'));
	const raw = isObject(stored) ? { ...(runBranch ?? {}), ...stored } : (runBranch ?? {});
	const proposalCandidates = [
		resolve(branchRoot, 'proposal.json'),
		resolve(branchRoot, 'proposer', 'proposal.json'),
		resolve(branchRoot, 'stages', 'proposer', 'proposal.json')
	];

	let proposal = sanitizeProposal(raw.proposal);
	if (!proposal) {
		for (const candidate of proposalCandidates) {
			proposal = sanitizeProposal(await readJson(candidate));
			if (proposal) break;
		}
	}

	return {
		id,
		title: asString(raw.title ?? raw.name, proposal?.title ?? id, 160),
		lens: asString(raw.lens, '', 500),
		status: normalizeStatus(raw.status),
		stage: normalizeStage(raw.stage),
		createdAt: toIso(raw.createdAt ?? raw.created_at),
		updatedAt: toIso(raw.updatedAt ?? raw.updated_at),
		// Thread ids are opaque coordination handles, not model output.
		threadId: asNullableString(raw.threadId ?? raw.thread_id, 200),
		proposal,
		lastPublicMessage: asString(raw.publicMessage ?? raw.lastPublicMessage, '', 500)
	};
}

function sanitizeMetrics(value: unknown): MetricProjection[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(isObject)
		.map((metric, index) => {
			const better = asString(metric.better, 'neutral', 20);
			const rawValue = metric.value;
			return {
				key: asString(metric.key, `metric-${index + 1}`, 80),
				label: asString(metric.label, `Metric ${index + 1}`, 120),
				value:
					typeof rawValue === 'number' && Number.isFinite(rawValue)
						? rawValue
						: asNullableString(rawValue, 120),
				unit: asString(metric.unit, '', 30),
				better: (better === 'lower' || better === 'higher' ? better : 'neutral') as
					| 'lower'
					| 'higher'
					| 'neutral'
			};
		})
		.slice(0, 16);
}

async function readRun(root: string, runId: string): Promise<RunProjection | null> {
	if (!isSafeId(runId)) return null;
	const runRoot = resolve(root, 'runs', runId);
	const stored = await readJson(resolve(runRoot, 'run.json'));
	if (!isObject(stored)) return null;

	const embedded = Array.isArray(stored.branches) ? stored.branches.filter(isObject) : [];
	const embeddedById = new Map(
		embedded
			.map((branch) => [isSafeId(branch.id) ? branch.id : null, branch] as const)
			.filter((entry): entry is [string, JsonObject] => entry[0] !== null)
	);

	let directoryIds: string[] = [];
	try {
		directoryIds = (await readdir(resolve(runRoot, 'branches'), { withFileTypes: true }))
			.filter((entry: DirectoryEntry) => entry.isDirectory() && isSafeId(entry.name))
			.map((entry: DirectoryEntry) => entry.name);
	} catch {
		// A just-created run can legitimately have no branch directory yet.
	}

	const declaredIds = Array.isArray(stored.branchIds)
		? stored.branchIds.filter(isSafeId)
		: Array.isArray(stored.branch_ids)
			? stored.branch_ids.filter(isSafeId)
			: [];
	const branchIds = [...new Set([...declaredIds, ...embeddedById.keys(), ...directoryIds])].slice(
		0,
		MAX_BRANCHES
	);
	const branches = await Promise.all(
		branchIds.map((branchId) => readBranch(runRoot, branchId, embeddedById.get(branchId) ?? null))
	);

	return {
		id: runId,
		title: asString(stored.title ?? stored.name, 'RETALT1 architecture search', 200),
		status: normalizeStatus(stored.status),
		stage: normalizeStage(stored.stage),
		createdAt: toIso(stored.createdAt ?? stored.created_at),
		updatedAt: toIso(stored.updatedAt ?? stored.updated_at),
		problem: asString(stored.problem ?? stored.publicProblem, '', 2_000),
		branchCount: branches.length,
		branches,
		metrics: sanitizeMetrics(stored.metrics)
	};
}

async function discoverRunId(root: string, manager: ManagerHealth): Promise<string | null> {
	if (manager.activeRunId) return manager.activeRunId;
	const pointer = await readJson(resolve(root, 'runs', 'current.json'));
	if (isObject(pointer)) {
		const value = pointer.runId ?? pointer.activeRunId ?? pointer.id;
		if (isSafeId(value)) return value;
	}

	try {
		const discovered: Array<{ id: string; mtime: number } | null> = await Promise.all(
				(await readdir(resolve(root, 'runs'), { withFileTypes: true }))
					.filter((entry: DirectoryEntry) => entry.isDirectory() && isSafeId(entry.name))
					.map(async (entry: DirectoryEntry) => {
						try {
							return {
								id: entry.name,
								mtime: (await stat(resolve(root, 'runs', entry.name, 'run.json'))).mtimeMs
							};
						} catch {
							return null;
						}
					})
			);
		const candidates: Array<{ id: string; mtime: number }> = discovered.filter(
			(candidate: { id: string; mtime: number } | null): candidate is {
				id: string;
				mtime: number;
			} => candidate !== null
		);
		candidates.sort(
			(a: { id: string; mtime: number }, b: { id: string; mtime: number }) => b.mtime - a.mtime
		);
		return candidates[0]?.id ?? null;
	} catch {
		return null;
	}
}

async function readJsonLinesTail(path: string): Promise<unknown[]> {
	let handle: Awaited<ReturnType<typeof open>> | null = null;
	try {
		handle = await open(path, 'r');
		const info = await handle.stat();
		const length = Math.min(info.size, MAX_EVENT_BYTES);
		const buffer = new Uint8Array(length);
		await handle.read(buffer, 0, length, Math.max(0, info.size - length));
		const text = new TextDecoder().decode(buffer);
		const lines = text.split(/\r?\n/);
		if (info.size > length) lines.shift();
		return lines
			.filter(Boolean)
			.slice(-MAX_EVENT_COUNT * 3)
			.flatMap((line: string) => {
				try {
					return [JSON.parse(line) as unknown];
				} catch {
					return [];
				}
			});
	} catch {
		return [];
	} finally {
		await handle?.close();
	}
}

const safeEventTypes = new Set<SanitizedEvent['type']>([
	'run_created',
	'run_completed',
	'branch_started',
	'branch_stopped',
	'branch_resumed',
	'branch_forked',
	'stage_started',
	'stage_completed',
	'proposal_ready',
	'vibe_received',
	'evaluation_complete',
	'manager_status',
	'error'
]);

function sanitizeEvent(raw: unknown, defaultRunId: string): SanitizedEvent | null {
	if (!isObject(raw)) return null;
	const rawType = asString(raw.type ?? raw.kind, 'activity', 80);
	const type = safeEventTypes.has(rawType as SanitizedEvent['type'])
		? (rawType as SanitizedEvent['type'])
		: 'activity';
	const runId = raw.runId ?? raw.run_id;
	const branchId = raw.branchId ?? raw.branch_id;

	// Only fields explicitly authored for the public projection are exposed. In particular,
	// raw SDK item payloads, assistant text, commands, diffs and reasoning are never copied.
	const publicMessage = asString(raw.publicMessage ?? raw.public_message, '', 500);
	const title = asString(
		raw.publicTitle ?? raw.public_title,
		type === 'activity' ? 'Branch activity' : type.replaceAll('_', ' '),
		160
	);

	return {
		id: asString(raw.id, crypto.randomUUID(), 100),
		timestamp: toIso(raw.timestamp ?? raw.createdAt ?? raw.created_at),
		type,
		runId: isSafeId(runId) ? runId : defaultRunId,
		branchId: isSafeId(branchId) ? branchId : null,
		stage: raw.stage === undefined ? null : normalizeStage(raw.stage),
		status: raw.status === undefined ? null : normalizeStatus(raw.status),
		title,
		message: publicMessage
	};
}

async function readPublicEvents(root: string, runId: string): Promise<SanitizedEvent[]> {
	const runRoot = resolve(root, 'runs', runId);
	const candidates = [
		resolve(runRoot, 'public-events.jsonl'),
		resolve(runRoot, 'events', 'public.jsonl'),
		// The top-level stream is part of the public projection contract. Raw SDK streams
		// belong under a branch stage directory and are never traversed here.
		resolve(runRoot, 'events.jsonl')
	];
	let rows: unknown[] = [];
	for (const candidate of candidates) {
		if (await pathExists(candidate)) {
			rows = await readJsonLinesTail(candidate);
			break;
		}
	}

	return rows
		.map((event) => sanitizeEvent(event, runId))
		.filter((event): event is SanitizedEvent => event !== null)
		.slice(-MAX_EVENT_COUNT);
}

export async function readPublicResearchState(): Promise<PublicResearchState> {
	const root = await getWorkspaceRoot();
	const [manager, datasetRaw] = await Promise.all([
		readManagerHealth(root),
		readJson(resolve(root, 'data', 'retalt1', 'manifest.json'))
	]);
	const runId = await discoverRunId(root, manager);
	const [run, events] = runId
		? await Promise.all([readRun(root, runId), readPublicEvents(root, runId)])
		: [null, []];

	return {
		generatedAt: new Date().toISOString(),
		manager,
		dataset: sanitizeDataset(datasetRaw),
		run,
		events
	};
}

function requireSafeId(value: unknown, field: string): string {
	if (!isSafeId(value)) {
		throw new Error(`${field} must use 1-64 lowercase letters, numbers, hyphens, or underscores.`);
	}
	return value;
}

function requireText(value: unknown, field: string, max: number): string {
	if (typeof value !== 'string') throw new Error(`${field} must be a string.`);
	const normalized = value.trim();
	if (!normalized) throw new Error(`${field} is required.`);
	if (normalized.length > max) throw new Error(`${field} must be at most ${max} characters.`);
	return normalized;
}

function parseVibeCard(value: unknown): VibeCard {
	if (!isObject(value)) throw new Error('vibeCard is required.');
	const confidence = value.confidence;
	if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
		throw new Error('vibeCard.confidence must be a number from 0 to 1.');
	}
	const applyMode = value.applyMode;
	const modes: VibeApplyMode[] = ['next_stage', 'immediate'];
	if (!modes.includes(applyMode as VibeApplyMode)) {
		throw new Error('vibeCard.applyMode must be next_stage or immediate.');
	}
	return {
		intent: requireText(value.intent, 'vibeCard.intent', 500),
		observation: requireText(value.observation, 'vibeCard.observation', 1_000),
		direction: requireText(value.direction, 'vibeCard.direction', 1_000),
		avoidance: requireText(value.avoidance, 'vibeCard.avoidance', 1_000),
		successSignal: requireText(value.successSignal, 'vibeCard.successSignal', 1_000),
		confidence,
		applyMode: applyMode as VibeApplyMode
	};
}

export function parseControlCommand(value: unknown): Omit<ControlCommand, 'id' | 'createdAt'> {
	if (!isObject(value)) throw new Error('Request body must be a JSON object.');
	const allowed: ControlAction[] = [
		'start_demo',
		'stop_branch',
		'continue_branch',
		'fork_branch',
		'inject_vibe'
	];
	if (!allowed.includes(value.action as ControlAction)) throw new Error('Unsupported action.');
	const action = value.action as ControlAction;
	if (action === 'start_demo') return { action };

	const runId = requireSafeId(value.runId, 'runId');
	const branchId = requireSafeId(value.branchId, 'branchId');
	if (action === 'inject_vibe') {
		return { action, runId, branchId, vibeCard: parseVibeCard(value.vibeCard) };
	}
	return { action, runId, branchId };
}

export async function enqueueControlCommand(
	input: Omit<ControlCommand, 'id' | 'createdAt'>
): Promise<ControlCommand> {
	const root = await getWorkspaceRoot();
	const inbox = resolve(root, 'runs', 'commands');
	await mkdir(inbox, { recursive: true });
	const command: ControlCommand = {
		...input,
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString()
	};
	const finalPath = resolve(inbox, `${command.createdAt.replaceAll(':', '-')}-${command.id}.json`);
	const temporaryPath = `${finalPath}.${crypto.randomUUID()}.tmp`;

	try {
		await writeFile(temporaryPath, `${JSON.stringify(command, null, 2)}\n`, {
			encoding: 'utf8',
			flag: 'wx',
			mode: 0o600
		});
		await rename(temporaryPath, finalPath);
	} catch (error) {
		await unlink(temporaryPath).catch(() => undefined);
		throw error;
	}

	return command;
}

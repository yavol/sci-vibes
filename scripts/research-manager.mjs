#!/usr/bin/env node

import {
	copyFile,
	cp,
	mkdtemp,
	open,
	readFile,
	readdir,
	rm,
	unlink,
} from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import {
	appendJsonl,
	claimCommand,
	compactError,
	enqueueCommand,
	ensureDir,
	isoNow,
	listJsonFiles,
	moveCommand,
	pathExists,
	publicBranchProjection,
	publicRunProjection,
	readJson,
	updateJsonAtomic,
	writeJsonAtomic,
	writeTextAtomic
} from './lib/run-store.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const RUNS_DIR = path.join(ROOT, 'runs');
const COMMANDS_DIR = path.join(RUNS_DIR, 'commands');
const PROCESSING_DIR = path.join(COMMANDS_DIR, 'processing');
const DONE_DIR = path.join(COMMANDS_DIR, 'done');
const FAILED_DIR = path.join(COMMANDS_DIR, 'failed');
const TEMPLATE_DIR = path.join(ROOT, 'research', 'branch-template');
const PROPOSAL_SCHEMA_PATH = path.join(ROOT, 'research', 'schemas', 'proposal.schema.json');
const SEALED_EVALUATOR_PATH = path.join(ROOT, 'modal_jobs', 'retalt_evaluator.py');
const PUBLIC_DATA_DIR = path.join(ROOT, 'data', 'retalt1');
const MANAGER_EVENTS_PATH = path.join(RUNS_DIR, 'events.jsonl');
const STATE_PATH = path.join(RUNS_DIR, 'state.json');
const CONTROLLERS_PATH = path.join(RUNS_DIR, 'controllers.json');
const MANAGER_LOCK_PATH = path.join(RUNS_DIR, 'manager.lock');
const MANAGER_HEALTH_PATH = path.join(RUNS_DIR, 'manager-health.json');
const CURRENT_RUN_PATH = path.join(RUNS_DIR, 'current.json');
const POLL_MS = Number(process.env.SCI_VIBES_MANAGER_POLL_MS || 750);

const BRANCH_SPECS = [
	{
		id: 'branch-a',
		label: 'Traceable Mechanics',
		lens: 'interpretability-first',
		directive:
			'Prioritize legibility, compactness, and the ability to explain coefficient behavior without sacrificing configuration generalization.'
	},
	{
		id: 'branch-b',
		label: 'Flight Regimes',
		lens: 'regime-specialization',
		directive:
			'Prioritize how Mach, angle of attack, engine state, and control-surface regimes should share or specialize computation.'
	},
	{
		id: 'branch-c',
		label: 'Physical Structure',
		lens: 'symmetry/physics-first',
		directive:
			'Prioritize physically defensible invariances, sign changes, couplings, or residual structure that can be falsified on public data.'
	},
	{
		id: 'branch-d',
		label: 'Robust Confidence',
		lens: 'uncertainty/robustness-first',
		directive:
			'Prioritize calibrated confidence, scarce-configuration robustness, and honest behavior away from well-supported public regimes.'
	}
];

const activeChildren = new Map();
let shuttingDown = false;
let controllerRegistryWrite = Promise.resolve();

async function main() {
	const [mode = 'daemon', ...args] = process.argv.slice(2);
	await initializeRunDirectories();

	switch (mode) {
		case 'daemon':
			await runDaemon();
			break;
		case 'once':
			await reconcileStaleBranches();
			await processPendingCommands();
			await Promise.allSettled([...activeChildren.values()].map((entry) => entry.promise));
			await writeStateProjection();
			break;
		case 'state':
			console.log(JSON.stringify(await buildStateProjection(), null, 2));
			break;
		case 'start-demo': {
			const command = await enqueueCommand(RUNS_DIR, { action: 'start_demo' });
			console.log(JSON.stringify({ accepted: true, commandId: command.id }, null, 2));
			break;
		}
		case 'branch-worker':
			await branchWorker(parseNamedArgs(args));
			break;
		case 'smoke-provision':
			await smokeProvision();
			break;
		default:
			throw new Error(
				`Unknown mode "${mode}". Use daemon, once, state, start-demo, or smoke-provision.`
			);
	}
}

async function initializeRunDirectories() {
	await Promise.all([
		ensureDir(RUNS_DIR),
		ensureDir(COMMANDS_DIR),
		ensureDir(PROCESSING_DIR),
		ensureDir(DONE_DIR),
		ensureDir(FAILED_DIR)
	]);
}

async function runDaemon() {
	const lockHandle = await acquireManagerLock();
	await reconcileStaleBranches();
	await appendManagerEvent({ type: 'manager_started', pid: process.pid });

	const stop = () => {
		shuttingDown = true;
		for (const entry of activeChildren.values()) {
			entry.controller.abort();
			entry.child.kill('SIGTERM');
		}
	};
	process.once('SIGINT', stop);
	process.once('SIGTERM', stop);

	try {
		while (!shuttingDown) {
			await processPendingCommands();
			await writeStateProjection();
			await writeManagerHealth();
			await delay(POLL_MS);
		}
		await Promise.allSettled([...activeChildren.values()].map((entry) => entry.promise));
	} finally {
		await appendManagerEvent({ type: 'manager_stopped', pid: process.pid });
		await writeJsonAtomic(MANAGER_HEALTH_PATH, {
			status: 'offline',
			heartbeatAt: isoNow(),
			activeRunId: (await readJson(CURRENT_RUN_PATH, null).catch(() => null))?.runId ?? null,
			pid: process.pid,
			publicMessage: 'Research manager is stopped.'
		});
		await lockHandle.close().catch(() => {});
		await unlink(MANAGER_LOCK_PATH).catch(() => {});
		await writeControllerRegistry();
	}
}

async function acquireManagerLock() {
	try {
		const handle = await open(MANAGER_LOCK_PATH, 'wx');
		await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: isoNow() })}\n`);
		return handle;
	} catch (error) {
		if (error?.code !== 'EEXIST') throw error;
		const existing = await readJson(MANAGER_LOCK_PATH, null).catch(() => null);
		if (existing?.pid && isProcessAlive(existing.pid)) {
			throw new Error(`Research manager is already running as PID ${existing.pid}.`);
		}
		await unlink(MANAGER_LOCK_PATH).catch(() => {});
		const handle = await open(MANAGER_LOCK_PATH, 'wx');
		await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: isoNow() })}\n`);
		return handle;
	}
}

async function processPendingCommands() {
	for (const pendingPath of await listJsonFiles(COMMANDS_DIR)) {
		const claimedPath = await claimCommand(pendingPath, PROCESSING_DIR);
		if (!claimedPath) continue;
		let command = null;
		try {
			command = await readJson(claimedPath);
			await handleCommand(command);
			await writeJsonAtomic(claimedPath, { ...command, processedAt: isoNow(), result: 'accepted' });
			await moveCommand(claimedPath, DONE_DIR);
		} catch (error) {
			const message = compactError(error);
			await writeJsonAtomic(claimedPath, {
				...(command ?? {}),
				processedAt: isoNow(),
				result: 'rejected',
				error: message
			});
			await moveCommand(claimedPath, FAILED_DIR);
			await appendManagerEvent({
				type: 'command_rejected',
				commandId: command?.id ?? path.basename(claimedPath),
				error: message
			});
		}
	}
}

async function handleCommand(command) {
	if (!command || typeof command !== 'object') throw new Error('Command must be a JSON object.');
	const action = command.action ?? command.type;
	switch (action) {
		case 'start_demo':
			await startDemoRun();
			return;
		case 'stop_branch':
			await stopBranch(command);
			return;
		case 'inject_vibe':
			await injectVibe(command);
			return;
		case 'continue_branch':
			await continueBranch(command);
			return;
		case 'fork_branch':
			await forkBranch(command);
			return;
		default:
			throw new Error(`Unsupported command action: ${action}`);
	}
}

async function startDemoRun() {
	await assertProvisioningInputs();
	const createdAt = isoNow();
	const runId = `retalt1-${createdAt.replaceAll(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 6)}`;
	const runDirectory = path.join(RUNS_DIR, runId);
	await ensureDir(path.join(runDirectory, 'branches'));
	await ensureDir(path.join(runDirectory, 'vibes'));

	const publicManifest = await readJson(path.join(PUBLIC_DATA_DIR, 'manifest.json'));
	const proposalTimeoutMs = Number(process.env.SCI_VIBES_CODEX_TIMEOUT_MS || 2_700_000);
	const run = {
		id: runId,
		title: 'RETALT1 architecture search',
		problem:
			'Design a compact offline surrogate for eight RETALT1 integral aerodynamic coefficients, then compare four falsifiable architecture trade-offs before implementation.',
		problemId: 'retalt1-integral-surrogate-v1',
		status: 'running',
		stage: 'proposer',
		createdAt,
		updatedAt: createdAt,
		dataset: {
			id: publicManifest.dataset_id,
			name: publicManifest.name,
			version: publicManifest.version,
			license: publicManifest.license,
			rows: publicManifest.rows,
			hiddenLabels: 'sealed-manager-only'
		},
		bindings: {
			publicManifestSha256: await sha256File(path.join(PUBLIC_DATA_DIR, 'manifest.json')),
			proposalSchemaSha256: await sha256File(PROPOSAL_SCHEMA_PATH),
			branchContractSha256: await sha256Files([
				path.join(TEMPLATE_DIR, 'AGENTS.md'),
				path.join(TEMPLATE_DIR, 'PROBLEM.md'),
				path.join(TEMPLATE_DIR, 'DATASET.md'),
				path.join(TEMPLATE_DIR, 'EVALUATION.md')
			]),
			sealedEvaluatorSha256: await sha256File(SEALED_EVALUATOR_PATH)
		},
		equalProposalBudget: {
			model: process.env.SCI_VIBES_CODEX_MODEL || 'codex-default',
			reasoning: process.env.SCI_VIBES_CODEX_REASONING || 'high',
			timeoutSeconds: Math.round(proposalTimeoutMs / 1000),
			network: 'disabled',
			publicData: 'identical',
			startMode: 'four-way-parallel'
		},
		branchIds: BRANCH_SPECS.map((branch) => branch.id)
	};
	await writeJsonAtomic(path.join(runDirectory, 'run.json'), run);
	await writeJsonAtomic(CURRENT_RUN_PATH, { runId, updatedAt: createdAt });

	for (const spec of BRANCH_SPECS) await provisionBranch(runId, spec);
	await appendManagerEvent({
		type: 'run_created',
		runId,
		branchCount: BRANCH_SPECS.length,
		stage: 'proposer',
		status: 'running',
		publicTitle: 'Architecture search started',
		publicMessage: 'Four isolated Codex proposers are drafting alternatives.'
	});
	for (const spec of BRANCH_SPECS) await spawnBranchWorker(runId, spec.id, 'proposer');
	await writeStateProjection();
	return run;
}

async function assertProvisioningInputs() {
	const required = [
		TEMPLATE_DIR,
		PROPOSAL_SCHEMA_PATH,
		path.join(PUBLIC_DATA_DIR, 'train.csv'),
		path.join(PUBLIC_DATA_DIR, 'validation.csv'),
		path.join(PUBLIC_DATA_DIR, 'manifest.json'),
		SEALED_EVALUATOR_PATH
	];
	for (const target of required) {
		if (!(await pathExists(target))) throw new Error(`Required provisioning input is missing: ${target}`);
	}
}

async function smokeProvision() {
	await assertProvisioningInputs();
	const temporaryRoot = await mkdtemp(path.join(process.env.TMPDIR || '/tmp', 'sci-vibes-manager-'));
	const repository = path.join(temporaryRoot, 'repo');
	try {
		await cp(TEMPLATE_DIR, repository, { recursive: true });
		await ensureDir(path.join(repository, 'data'));
		for (const name of ['train.csv', 'validation.csv', 'manifest.json']) {
			await copyFile(path.join(PUBLIC_DATA_DIR, name), path.join(repository, 'data', name));
		}
		await runProcess('git', ['init', '-b', 'main'], { cwd: repository });
		await runProcess('git', ['config', 'user.name', 'Sci Vibes Smoke Test'], { cwd: repository });
		await runProcess('git', ['config', 'user.email', 'smoke@sci-vibes.local'], {
			cwd: repository
		});
		await runProcess('git', ['add', '.'], { cwd: repository });
		await runProcess('git', ['commit', '-m', 'Verify isolated branch provisioning'], {
			cwd: repository
		});
		const manifest = await readJson(path.join(repository, 'data', 'manifest.json'));
		const trainPresent = await pathExists(path.join(repository, 'data', 'train.csv'));
		const validationPresent = await pathExists(path.join(repository, 'data', 'validation.csv'));
		const gitPresent = await pathExists(path.join(repository, '.git'));
		if (!trainPresent || !validationPresent || !gitPresent) {
			throw new Error('Provisioning smoke test did not create all required branch inputs.');
		}
		console.log(
			JSON.stringify(
				{
					ok: true,
					datasetId: manifest.dataset_id,
					trainRows: manifest.rows?.train,
					validationRows: manifest.rows?.validation,
					hiddenCopied: await pathExists(path.join(repository, 'data', 'hidden.csv')),
					gitRepository: gitPresent
				},
				null,
				2
			)
		);
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}

async function provisionBranch(runId, spec, options = {}) {
	const branchDirectory = branchDir(runId, spec.id);
	const repository = path.join(branchDirectory, 'repo');
	await ensureDir(branchDirectory);
	if (options.sourceRepository) await cp(options.sourceRepository, repository, { recursive: true });
	else await cp(TEMPLATE_DIR, repository, { recursive: true });

	await ensureDir(path.join(repository, 'data'));
	for (const name of ['train.csv', 'validation.csv', 'manifest.json']) {
		await copyFile(path.join(PUBLIC_DATA_DIR, name), path.join(repository, 'data', name));
	}
	if (!options.sourceRepository) {
		await runProcess('git', ['init', '-b', 'main'], { cwd: repository });
		await runProcess('git', ['config', 'user.name', 'Sci Vibes Manager'], { cwd: repository });
		await runProcess('git', ['config', 'user.email', 'manager@sci-vibes.local'], {
			cwd: repository
		});
		await runProcess('git', ['add', '.'], { cwd: repository });
		await runProcess('git', ['commit', '-m', 'Initialize isolated RETALT1 research branch'], {
			cwd: repository
		});
	}

	const now = isoNow();
	await writeJsonAtomic(path.join(branchDirectory, 'branch.json'), {
		id: spec.id,
		parentBranchId: options.parentBranchId ?? null,
		label: spec.label,
		title: spec.label,
		lens: spec.lens,
		directive: spec.directive,
		status: 'queued',
		stage: 'proposer',
		createdAt: now,
		updatedAt: now,
		threadId: null,
		pendingVibeIds: [],
		revision: 0
	});
}

async function spawnBranchWorker(runId, branchId, stage) {
	assertSafeId(runId, 'runId');
	assertSafeId(branchId, 'branchId');
	const key = `${runId}/${branchId}`;
	if (activeChildren.has(key)) throw new Error(`Branch worker is already active: ${key}`);

	const controller = new AbortController();
	const logsDirectory = path.join(branchDir(runId, branchId), stage);
	const logPath = path.join(logsDirectory, 'worker.log');
	await ensureDir(logsDirectory);
	const child = spawn(
		process.execPath,
		[SCRIPT_PATH, 'branch-worker', '--run', runId, '--branch', branchId, '--stage', stage],
		{
			cwd: ROOT,
			env: process.env,
			stdio: ['ignore', 'pipe', 'pipe']
		}
	);
	const log = createWriteStream(logPath, { flags: 'a' });
	child.stdout.pipe(log);
	child.stderr.pipe(log);
	const record = {
		runId,
		branchId,
		stage,
		child,
		controller,
		startedAt: isoNow(),
		promise: null
	};
	record.promise = new Promise((resolve) => {
		child.once('exit', async (code, signal) => {
			log.end();
			activeChildren.delete(key);
			await appendManagerEvent({
				type: 'activity',
				runId,
				branchId,
				stage,
				code,
				signal,
				publicTitle: 'Branch worker exited',
				publicMessage:
					code === 0 ? 'The bounded Codex turn finished.' : 'The branch worker exited early.'
			});
			const latest = await readJson(path.join(branchDir(runId, branchId), 'branch.json'), null).catch(
				() => null
			);
			if (latest?.pendingImmediateResume) {
				await updateJsonAtomic(
					path.join(branchDir(runId, branchId), 'branch.json'),
					(current) => ({
						...current,
						status: 'queued',
						stage: 'proposer',
						pendingImmediateResume: false,
						updatedAt: isoNow(),
						error: null
					})
				);
				await spawnBranchWorker(runId, branchId, latest.threadId ? 'revision' : 'proposer');
			}
			await refreshRunStatus(runId).catch(() => {});
			await writeControllerRegistry().catch(() => {});
			await writeStateProjection().catch(() => {});
			resolve({ code, signal });
		});
	});
	activeChildren.set(key, record);
	void writeControllerRegistry();
	void appendManagerEvent({
		type: 'branch_started',
		runId,
		branchId,
		stage: 'proposer',
		pid: child.pid,
		status: 'running',
		publicTitle: stage === 'revision' ? 'Proposal revision started' : 'Proposer started',
		publicMessage:
			stage === 'revision'
				? 'Codex is resuming this branch with the recorded Vibe Card.'
				: 'Codex is drafting one concrete architecture under this branch lens.'
	});
	return record;
}

async function branchWorker(args) {
	const runId = requiredNamedArg(args, 'run');
	const branchId = requiredNamedArg(args, 'branch');
	const stage = args.stage ?? 'proposer';
	assertSafeId(runId, 'runId');
	assertSafeId(branchId, 'branchId');
	if (!['proposer', 'revision'].includes(stage)) throw new Error(`Unsupported worker stage: ${stage}`);

	const branchDirectory = branchDir(runId, branchId);
	const repository = path.join(branchDirectory, 'repo');
	const branchPath = path.join(branchDirectory, 'branch.json');
	const branch = await readJson(branchPath);
	const schema = await readJson(PROPOSAL_SCHEMA_PATH);
	const stageDirectory = path.join(
		branchDirectory,
		stage === 'revision' ? `revision-${Number(branch.revision ?? 0) + 1}` : 'proposer'
	);
	await ensureDir(stageDirectory);

	const abortController = new AbortController();
	let interrupted = false;
	const stop = () => {
		interrupted = true;
		abortController.abort(new Error('Branch worker received a termination signal.'));
	};
	process.once('SIGTERM', stop);
	process.once('SIGINT', stop);

	await updateJsonAtomic(branchPath, (current) => ({
		...current,
		status: 'running',
		stage: stage === 'revision' ? 'revising_proposal' : 'proposer',
		startedAt: current.startedAt ?? isoNow(),
		updatedAt: isoNow(),
		error: null
	}));
	await appendManagerEvent({
		type: 'stage_started',
		runId,
		branchId,
		stage: 'proposer',
		status: 'running',
		publicTitle: stage === 'revision' ? 'Proposal revision' : 'Architecture proposal',
		publicMessage:
			stage === 'revision'
				? 'Applying a human Vibe Card in the persisted Codex thread.'
				: 'The proposer is reading the public research contract.'
	});

	const vibes = await readPendingVibes(runId, branch);
	const prompt =
		stage === 'revision'
			? revisionPrompt(branch, vibes)
			: proposerPrompt(branch, vibes);
	const result = await runCodexSdkTurn({
		prompt,
		workDir: repository,
		eventsPath: path.join(stageDirectory, 'events.jsonl'),
		lastMessagePath: path.join(stageDirectory, 'last-message.json'),
		summaryPath: path.join(stageDirectory, 'summary.json'),
		threadStatePath: path.join(branchDirectory, 'thread.json'),
		resumeThreadId: stage === 'revision' ? branch.threadId : null,
		outputSchema: schema,
		signal: abortController.signal,
		onThreadId: async (threadId) => {
			await updateJsonAtomic(branchPath, (current) => ({
				...current,
				threadId,
				updatedAt: isoNow()
			}));
		}
	});

	const proposalMatchesBranch = result.structuredOutput?.branchId === branchId;
	if (result.status === 'passed' && result.structuredOutput && proposalMatchesBranch) {
		await persistProposal(repository, stageDirectory, result.structuredOutput, stage);
		await updateJsonAtomic(branchPath, (current) => ({
			...current,
			status: 'awaiting_human',
			stage: 'awaiting_human',
			threadId: result.threadId,
			updatedAt: isoNow(),
			finishedAt: isoNow(),
			pendingVibeIds: [],
			revision: stage === 'revision' ? Number(current.revision ?? 0) + 1 : current.revision ?? 0,
			error: null
		}));
		await appendManagerEvent({
			type: 'proposal_ready',
			runId,
			branchId,
			stage: 'awaiting_human',
			status: 'awaiting_human',
			publicTitle: 'Proposal ready',
			publicMessage:
				stage === 'revision'
					? 'The revised design is ready for human comparison.'
					: 'A structured architecture proposal is ready for human comparison.'
		});
	} else {
		const status =
			result.status === 'canceled' || interrupted
				? 'stopped'
				: result.status === 'timed_out'
					? 'failed'
					: 'failed';
		await updateJsonAtomic(branchPath, (current) => ({
			...current,
			status,
			stage: status,
			threadId: result.threadId ?? current.threadId,
			updatedAt: isoNow(),
			finishedAt: isoNow(),
			error:
				result.error ??
				(!proposalMatchesBranch && result.structuredOutput
					? `Proposal branchId did not match ${branchId}.`
					: status === 'stopped'
						? 'Stopped by user.'
						: 'Codex turn did not pass.')
		}));
		await appendManagerEvent({
			type: status === 'stopped' ? 'branch_stopped' : 'error',
			runId,
			branchId,
			status,
			stage: status,
			error: result.error ? String(result.error).slice(0, 400) : null,
			publicTitle: status === 'stopped' ? 'Branch stopped' : 'Branch failed',
			publicMessage:
				status === 'stopped'
					? 'The research direction was terminated.'
					: 'The bounded proposer turn did not complete.'
		});
	}

	process.removeListener('SIGTERM', stop);
	process.removeListener('SIGINT', stop);
	await refreshRunStatus(runId);
	await writeStateProjection();
	if (result.status !== 'passed' && result.status !== 'canceled') process.exitCode = 1;
}

function proposerPrompt(branch, vibes = []) {
	return `You are the PROPOSER for isolated branch ${branch.id} (${branch.label}).

Read AGENTS.md, README.md, PROBLEM.md, DATASET.md, EVALUATION.md, and data/manifest.json before deciding. You may inspect the public train and validation CSVs, but this phase is design-only: do not implement, train, install, fetch, or benchmark anything.

Your assigned research lens is "${branch.lens}": ${branch.directive}

${vibes.length > 0 ? `The human supplied these Vibe Cards before the thread was established:\n${JSON.stringify(vibes, null, 2)}\n` : ''}

Invent the exact architecture yourself. Do not merely repeat the lens or offer a menu. Commit to one small, falsifiable design that another agent can implement offline. Explain why each component exists, how categorical configurations and continuous flight conditions enter, how all eight targets are handled, what public validation could disprove the thesis, and where the design is likely to fail. Keep claims within processed integral aerodynamic coefficients; this is not a turbulence-field or CFD surrogate. Use concise, complete English sentences; never cut a sentence or word merely to approach a schema length limit.

The hidden split and sealed evaluator do not exist in this workspace and must not be sought or inferred. Do not modify the repository during this proposal turn. Return only the JSON object required by the supplied output schema. Use branchId "${branch.id}" exactly.`;
}

function revisionPrompt(branch, vibes) {
	return `Resume your role as PROPOSER for branch ${branch.id}. A human has supplied the following immutable Vibe Card records:

${JSON.stringify(vibes, null, 2)}

Read the existing proposal.json and the repository contract. Revise the one committed architecture in response to the human direction while preserving the hidden-evaluation boundary. A vibe is design direction, not permission to weaken evaluation, fabricate results, or access unavailable data. Do not implement or train.

Return only a complete replacement JSON object matching the supplied schema. Keep branchId "${branch.id}" exactly, retain good details that the vibe does not contradict, and make the changed trade-off obvious enough for an A-vs-B comparison. Use concise, complete English sentences and do not truncate words or clauses.`;
}

async function persistProposal(repository, stageDirectory, proposal, stage) {
	const markdown = renderProposalMarkdown(proposal);
	await writeJsonAtomic(path.join(stageDirectory, 'proposal.json'), proposal);
	await writeTextAtomic(path.join(stageDirectory, 'proposal.md'), markdown);
	await writeJsonAtomic(path.join(path.dirname(stageDirectory), 'proposal.json'), proposal);
	await writeTextAtomic(path.join(path.dirname(stageDirectory), 'proposal.md'), markdown);
	await writeJsonAtomic(path.join(repository, 'proposal.json'), proposal);
	await writeTextAtomic(path.join(repository, 'proposal.md'), markdown);
	await runProcess('git', ['add', 'proposal.json', 'proposal.md'], { cwd: repository });
	const message = stage === 'revision' ? 'Revise architecture proposal from human vibe' : 'Add architecture proposal';
	const commit = await runProcess('git', ['commit', '-m', message], {
		cwd: repository,
		allowFailure: true
	});
	if (commit.code !== 0 && !commit.output.includes('nothing to commit')) {
		throw new Error(`Could not commit proposal: ${commit.output.slice(0, 500)}`);
	}
}

function renderProposalMarkdown(proposal) {
	const title = proposal.title ?? proposal.shortName ?? proposal.name ?? 'Architecture proposal';
	const sections = [
		['Thesis', proposal.thesis ?? proposal.summary],
		['Summary', proposal.summary],
		['Training plan', proposal.trainingPlan],
		['Inductive biases', proposal.inductiveBiases],
		['Strengths', proposal.strengths],
		['Risks', proposal.risks],
		['Falsification tests', proposal.falsificationTests],
		['Human questions', proposal.humanQuestions]
	];
	let markdown = `# ${title}\n\n`;
	for (const [heading, value] of sections) {
		if (value === undefined || value === null) continue;
		markdown += `## ${heading}\n\n${markdownValue(value)}\n\n`;
	}
	if (proposal.architecture) {
		markdown += `## Architecture\n\n\`\`\`json\n${JSON.stringify(proposal.architecture, null, 2)}\n\`\`\`\n`;
	}
	return markdown;
}

function markdownValue(value) {
	if (Array.isArray(value)) return value.map((entry) => `- ${stringValue(entry)}`).join('\n');
	return stringValue(value);
}

function stringValue(value) {
	return typeof value === 'string' ? value : `\`${JSON.stringify(value)}\``;
}

async function injectVibe(command) {
	const { runId, branchId } = checkedBranchCommand(command);
	const branchPath = path.join(branchDir(runId, branchId), 'branch.json');
	const branch = await readJson(branchPath);
	if (['stopped', 'failed'].includes(branch.status)) {
		throw new Error(`Cannot inject a vibe into terminal branch ${branchId}. Fork it instead.`);
	}
	const vibeCard = command.vibeCard ?? command.vibe;
	if (!vibeCard || typeof vibeCard !== 'object') {
		throw new Error('inject_vibe requires a structured vibe object.');
	}
	const vibeId = vibeCard.id ?? randomUUID();
	const record = {
		id: vibeId,
		runId,
		branchId,
		createdAt: isoNow(),
		intent: String(vibeCard.intent ?? '').trim().slice(0, 500),
		observation: String(vibeCard.observation ?? '').trim().slice(0, 1000),
		direction: String(vibeCard.direction ?? vibeCard.text ?? '').trim().slice(0, 1000),
		avoidance: String(vibeCard.avoidance ?? '').trim().slice(0, 1000),
		successSignal: String(vibeCard.successSignal ?? '').trim().slice(0, 1000),
		confidence: vibeCard.confidence ?? null,
		applyMode: vibeCard.applyMode ?? 'next_stage'
	};
	if (!record.direction) throw new Error('Vibe direction cannot be empty.');
	await writeJsonAtomic(path.join(RUNS_DIR, runId, 'vibes', `${vibeId}.json`), record);
	await updateJsonAtomic(branchPath, (current) => ({
		...current,
		pendingVibeIds: [...new Set([...(current.pendingVibeIds ?? []), vibeId])],
		updatedAt: isoNow()
	}));
	await appendManagerEvent({
		type: 'vibe_received',
		runId,
		branchId,
		vibeId,
		stage: branch.stage,
		status: branch.status,
		publicTitle: 'Vibe Card recorded',
		publicMessage:
			record.applyMode === 'immediate'
				? 'The active turn will stop and resume with this direction.'
				: 'The direction will apply at the next manager-controlled boundary.'
	});
	if (record.applyMode === 'immediate' && activeChildren.has(`${runId}/${branchId}`)) {
		await updateJsonAtomic(branchPath, (current) => ({
			...current,
			pendingImmediateResume: true,
			updatedAt: isoNow()
		}));
		const active = activeChildren.get(`${runId}/${branchId}`);
		active.controller.abort();
		active.child.kill('SIGTERM');
	}
	await writeStateProjection();
}

async function continueBranch(command) {
	const { runId, branchId } = checkedBranchCommand(command);
	const key = `${runId}/${branchId}`;
	if (activeChildren.has(key)) throw new Error(`Branch ${branchId} is already active.`);
	const branch = await readJson(path.join(branchDir(runId, branchId), 'branch.json'));
	if (branch.status !== 'awaiting_human') {
		throw new Error(`Branch ${branchId} must be awaiting_human, received ${branch.status}.`);
	}
	if (!branch.threadId) throw new Error(`Branch ${branchId} has no persisted Codex thread to resume.`);
	if (!Array.isArray(branch.pendingVibeIds) || branch.pendingVibeIds.length === 0) {
		throw new Error('Continue requires at least one recorded Vibe Card.');
	}
	await spawnBranchWorker(runId, branchId, 'revision');
}

async function stopBranch(command) {
	const { runId, branchId } = checkedBranchCommand(command);
	const key = `${runId}/${branchId}`;
	const active = activeChildren.get(key);
	if (active) {
		active.controller.abort();
		active.child.kill('SIGTERM');
		await appendManagerEvent({
			type: 'branch_stopped',
			runId,
			branchId,
			stage: 'stopped',
			status: 'stopped',
			publicTitle: 'Stop requested',
			publicMessage: 'The active Codex turn is being canceled.'
		});
		return;
	}
	const branchPath = path.join(branchDir(runId, branchId), 'branch.json');
	const branch = await readJson(branchPath);
	if (['stopped', 'failed'].includes(branch.status)) return;
	await writeJsonAtomic(branchPath, {
		...branch,
		status: 'stopped',
		stage: 'stopped',
		updatedAt: isoNow(),
		finishedAt: isoNow(),
		error: 'Stopped by user.'
	});
	await appendManagerEvent({
		type: 'branch_stopped',
		runId,
		branchId,
		stage: 'stopped',
		status: 'stopped',
		publicTitle: 'Branch stopped',
		publicMessage: 'The research direction was terminated by the human.'
	});
	await refreshRunStatus(runId);
}

async function forkBranch(command) {
	const { runId, branchId: parentBranchId } = checkedBranchCommand(command);
	const parent = await readJson(path.join(branchDir(runId, parentBranchId), 'branch.json'));
	if (activeChildren.has(`${runId}/${parentBranchId}`)) {
		throw new Error('Fork only at a manager-controlled boundary, not during an active Codex turn.');
	}
	const suffix = randomUUID().slice(0, 5);
	const branchId = `${parentBranchId}-fork-${suffix}`;
	const directive = String(
		command.directive ?? command.vibeCard?.direction ?? 'Explore a distinct falsifiable trade-off.'
	)
		.trim()
		.slice(0, 2000);
	const spec = {
		id: branchId,
		label: `${parent.label} fork`,
		lens: `${parent.lens} / human fork`,
		directive
	};
	await provisionBranch(runId, spec, {
		parentBranchId,
		sourceRepository: path.join(branchDir(runId, parentBranchId), 'repo')
	});
	await updateJsonAtomic(path.join(RUNS_DIR, runId, 'run.json'), (run) => ({
		...run,
		status: 'running',
		stage: 'proposer',
		updatedAt: isoNow(),
		branchIds:
			run.branchIds.length >= 4
				? run.branchIds.map((id) => (id === parentBranchId ? branchId : id))
				: [...run.branchIds, branchId]
	}));
	await updateJsonAtomic(path.join(branchDir(runId, parentBranchId), 'branch.json'), (current) => ({
		...current,
		status: 'stopped',
		stage: 'stopped',
		updatedAt: isoNow(),
		finishedAt: isoNow(),
		error: 'Superseded by a human-directed fork.'
	}));
	await appendManagerEvent({
		type: 'branch_forked',
		runId,
		branchId,
		parentBranchId,
		stage: 'proposer',
		status: 'queued',
		publicTitle: 'Branch forked',
		publicMessage: 'A new whole-repository branch will explore a distinct trade-off.'
	});
	await spawnBranchWorker(runId, branchId, 'proposer');
}

async function readPendingVibes(runId, branch) {
	const records = [];
	for (const id of branch.pendingVibeIds ?? []) {
		records.push(await readJson(path.join(RUNS_DIR, runId, 'vibes', `${id}.json`)));
	}
	return records;
}

async function refreshRunStatus(runId) {
	const runPath = path.join(RUNS_DIR, runId, 'run.json');
	const run = await readJson(runPath);
	const branches = await Promise.all(
		run.branchIds.map((branchId) => readJson(path.join(branchDir(runId, branchId), 'branch.json')))
	);
	const active = branches.some((branch) => ['queued', 'running'].includes(branch.status));
	const awaiting = branches.some((branch) => branch.status === 'awaiting_human');
	const next = {
		...run,
		status: active ? 'running' : awaiting ? 'awaiting_human' : 'stopped',
		stage: active ? 'proposer' : awaiting ? 'awaiting_human' : 'stopped',
		updatedAt: isoNow()
	};
	await writeJsonAtomic(runPath, next);
	return next;
}

async function reconcileStaleBranches() {
	const previous = await readJson(CONTROLLERS_PATH, { branches: [] }).catch(() => ({ branches: [] }));
	for (const controller of previous.branches ?? []) {
		if (!controller.pid || isProcessAlive(controller.pid)) continue;
		const branchPath = path.join(branchDir(controller.runId, controller.branchId), 'branch.json');
		if (!(await pathExists(branchPath))) continue;
		const branch = await readJson(branchPath);
		if (!['running', 'queued'].includes(branch.status)) continue;
		await writeJsonAtomic(branchPath, {
			...branch,
			status: 'failed',
			stage: 'failed',
			updatedAt: isoNow(),
			finishedAt: isoNow(),
			error: 'The previous manager stopped while this branch worker was active.'
		});
		await refreshRunStatus(controller.runId);
	}
	await writeControllerRegistry();
}

async function writeControllerRegistry() {
	const snapshot = {
		managerPid: process.pid,
		updatedAt: isoNow(),
		branches: [...activeChildren.values()].map((entry) => ({
			runId: entry.runId,
			branchId: entry.branchId,
			stage: entry.stage,
			pid: entry.child.pid,
			startedAt: entry.startedAt,
			stopRequested: entry.controller.signal.aborted
		}))
	};
	controllerRegistryWrite = controllerRegistryWrite
		.catch(() => {})
		.then(() => writeJsonAtomic(CONTROLLERS_PATH, snapshot));
	await controllerRegistryWrite;
}

async function appendManagerEvent(event) {
	const timestamp = isoNow();
	const record = { id: randomUUID(), ...event, timestamp, at: timestamp };
	await appendJsonl(MANAGER_EVENTS_PATH, record);
	if (event.runId && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(event.runId)) {
		await appendJsonl(path.join(RUNS_DIR, event.runId, 'public-events.jsonl'), {
			id: record.id,
			type: event.type,
			timestamp,
			runId: event.runId,
			branchId: event.branchId ?? null,
			stage: event.stage ?? null,
			status: event.status ?? null,
			publicTitle: event.publicTitle ?? 'Research activity',
			publicMessage: event.publicMessage ?? ''
		});
	}
}

async function writeManagerHealth() {
	const current = await readJson(CURRENT_RUN_PATH, null).catch(() => null);
	const activeRunId = current?.runId ?? null;
	const activeRun =
		activeRunId && (await pathExists(path.join(RUNS_DIR, activeRunId, 'run.json')))
			? await readJson(path.join(RUNS_DIR, activeRunId, 'run.json'))
			: null;
	const running = activeChildren.size > 0 || activeRun?.status === 'running';
	await writeJsonAtomic(MANAGER_HEALTH_PATH, {
		status: running ? 'running' : 'idle',
		heartbeatAt: isoNow(),
		activeRunId,
		pid: process.pid,
		publicMessage: running
			? `${activeChildren.size} Codex branch worker${activeChildren.size === 1 ? '' : 's'} active.`
			: activeRun?.status === 'awaiting_human'
				? 'Architecture proposals are waiting for human direction.'
				: 'Ready to start a research run.'
	});
}

async function writeStateProjection() {
	const state = await buildStateProjection();
	await writeJsonAtomic(STATE_PATH, state);
	return state;
}

async function buildStateProjection() {
	const runDirectories = await listRunDirectories();
	const recentEvents = await readRecentManagerEvents(80);
	const runs = [];
	for (const runDirectory of runDirectories) {
		const runPath = path.join(runDirectory, 'run.json');
		if (!(await pathExists(runPath))) continue;
		const run = await readJson(runPath);
		const branches = [];
		for (const branchId of run.branchIds ?? []) {
			const branchDirectory = path.join(runDirectory, 'branches', branchId);
			const branch = await readJson(path.join(branchDirectory, 'branch.json'));
			let proposal = null;
			const proposalPath = path.join(branchDirectory, 'repo', 'proposal.json');
			if (await pathExists(proposalPath)) proposal = await readJson(proposalPath, null);
			branches.push(publicBranchProjection(branch, proposal));
		}
		runs.push(
			publicRunProjection(
				run,
				branches,
				recentEvents.filter((event) => !event.runId || event.runId === run.id).slice(-40)
			)
		);
	}
	runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return {
		version: 1,
		updatedAt: isoNow(),
		manager: {
			pid: process.pid,
			activeWorkers: activeChildren.size
		},
		currentRun: runs[0] ?? null,
		runs
	};
}

async function listRunDirectories() {
	const entries = await readdir(RUNS_DIR, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory() && entry.name !== 'commands')
		.map((entry) => path.join(RUNS_DIR, entry.name));
}

async function readRecentManagerEvents(limit) {
	try {
		const text = await readFile(MANAGER_EVENTS_PATH, 'utf8');
		return text
			.trim()
			.split('\n')
			.filter(Boolean)
			.slice(-limit)
			.map((line) => JSON.parse(line))
			.map(sanitizeManagerEvent);
	} catch (error) {
		if (error?.code === 'ENOENT') return [];
		throw error;
	}
}

function sanitizeManagerEvent(event) {
	const allowed = [
		'type',
		'at',
		'runId',
		'branchId',
		'parentBranchId',
		'branchCount',
		'stage',
		'status',
		'vibeId',
		'code',
		'signal',
		'error'
	];
	return Object.fromEntries(
		allowed
			.filter((key) => event[key] !== undefined)
			.map((key) => [key, key === 'error' ? String(event[key]).slice(0, 400) : event[key]])
	);
}

function checkedBranchCommand(command) {
	const runId = String(command.runId ?? '');
	const branchId = String(command.branchId ?? '');
	assertSafeId(runId, 'runId');
	assertSafeId(branchId, 'branchId');
	return { runId, branchId };
}

function branchDir(runId, branchId) {
	return path.join(RUNS_DIR, runId, 'branches', branchId);
}

function assertSafeId(value, label) {
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(value)) {
		throw new Error(`${label} is missing or unsafe.`);
	}
}

function parseNamedArgs(args) {
	const parsed = {};
	for (let index = 0; index < args.length; index += 2) {
		const flag = args[index];
		if (!flag?.startsWith('--') || args[index + 1] === undefined) {
			throw new Error(`Invalid named argument near ${flag ?? '<end>'}.`);
		}
		parsed[flag.slice(2)] = args[index + 1];
	}
	return parsed;
}

function requiredNamedArg(args, key) {
	const value = args[key];
	if (!value) throw new Error(`Missing --${key}.`);
	return value;
}

function isProcessAlive(pid) {
	try {
		process.kill(Number(pid), 0);
		return true;
	} catch {
		return false;
	}
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runProcess(command, args, { cwd, allowFailure = false } = {}) {
	return await new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env: minimalProcessEnvironment(),
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let output = '';
		child.stdout.on('data', (chunk) => {
			output += chunk;
		});
		child.stderr.on('data', (chunk) => {
			output += chunk;
		});
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			const result = { code: code ?? 1, signal, output };
			if ((code ?? 1) !== 0 && !allowFailure) {
				reject(new Error(`${command} ${args.join(' ')} failed: ${output.slice(0, 1000)}`));
			} else {
				resolve(result);
			}
		});
	});
}

function minimalProcessEnvironment() {
	const environment = {};
	for (const name of ['PATH', 'HOME', 'SHELL', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL']) {
		if (process.env[name] !== undefined) environment[name] = process.env[name];
	}
	return environment;
}

async function sha256File(filePath) {
	return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function sha256Files(filePaths) {
	const digest = createHash('sha256');
	for (const filePath of [...filePaths].sort()) {
		digest.update(path.relative(ROOT, filePath));
		digest.update('\0');
		digest.update(await readFile(filePath));
		digest.update('\0');
	}
	return digest.digest('hex');
}

main().catch(async (error) => {
	const message = compactError(error, 2000);
	console.error(message);
	await appendManagerEvent({ type: 'manager_error', error: message }).catch(() => {});
	process.exitCode = 1;
});

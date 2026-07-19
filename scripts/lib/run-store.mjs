import {
	appendFile,
	mkdir,
	open,
	readFile,
	readdir,
	rename,
	stat,
	unlink,
	writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function ensureDir(directory) {
	await mkdir(directory, { recursive: true });
	return directory;
}

export async function pathExists(target) {
	try {
		await stat(target);
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

export async function readJson(filePath, fallback) {
	try {
		return JSON.parse(await readFile(filePath, 'utf8'));
	} catch (error) {
		if (error?.code === 'ENOENT' && arguments.length > 1) return fallback;
		throw new Error(`Could not read JSON at ${filePath}: ${error instanceof Error ? error.message : error}`);
	}
}

export async function writeJsonAtomic(filePath, value) {
	await ensureDir(path.dirname(filePath));
	const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
			encoding: 'utf8',
			flag: 'wx'
		});
		await rename(temporaryPath, filePath);
	} catch (error) {
		await unlink(temporaryPath).catch(() => {});
		throw error;
	}
}

export async function writeTextAtomic(filePath, value) {
	await ensureDir(path.dirname(filePath));
	const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporaryPath, value, { encoding: 'utf8', flag: 'wx' });
		await rename(temporaryPath, filePath);
	} catch (error) {
		await unlink(temporaryPath).catch(() => {});
		throw error;
	}
}

// A single O_APPEND write keeps each JSONL record intact when several workers
// append to the same file. Records are intentionally bounded before this helper
// is called.
export async function appendJsonl(filePath, value) {
	await ensureDir(path.dirname(filePath));
	const line = `${JSON.stringify(value)}\n`;
	const handle = await open(filePath, 'a');
	try {
		await handle.write(line);
		await handle.sync();
	} finally {
		await handle.close();
	}
}

export async function updateJsonAtomic(filePath, mutate, fallback = {}) {
	const current = await readJson(filePath, fallback);
	const next = await mutate(structuredClone(current));
	await writeJsonAtomic(filePath, next);
	return next;
}

export async function listJsonFiles(directory) {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
			.map((entry) => path.join(directory, entry.name))
			.sort();
	} catch (error) {
		if (error?.code === 'ENOENT') return [];
		throw error;
	}
}

export async function enqueueCommand(runsDirectory, command) {
	const commandsDirectory = await ensureDir(path.join(runsDirectory, 'commands'));
	const createdAt = new Date().toISOString();
	const id = command.id ?? randomUUID();
	const record = { ...command, id, createdAt };
	const sortableTimestamp = createdAt.replaceAll(/[-:.TZ]/g, '');
	const filePath = path.join(commandsDirectory, `${sortableTimestamp}-${id}.json`);
	await writeJsonAtomic(filePath, record);
	return { ...record, filePath };
}

export async function claimCommand(filePath, processingDirectory) {
	await ensureDir(processingDirectory);
	const claimedPath = path.join(processingDirectory, path.basename(filePath));
	try {
		await rename(filePath, claimedPath);
		return claimedPath;
	} catch (error) {
		if (error?.code === 'ENOENT') return null;
		throw error;
	}
}

export async function moveCommand(filePath, destinationDirectory) {
	await ensureDir(destinationDirectory);
	const destination = path.join(destinationDirectory, path.basename(filePath));
	await rename(filePath, destination);
	return destination;
}

export function isoNow() {
	return new Date().toISOString();
}

export function compactError(error, maxLength = 800) {
	const message = error instanceof Error ? error.message : String(error);
	return message.replaceAll(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function publicBranchProjection(branch, proposal = null) {
	return {
		id: branch.id,
		parentBranchId: branch.parentBranchId ?? null,
		label: branch.label,
		lens: branch.lens,
		status: branch.status,
		stage: branch.stage,
		createdAt: branch.createdAt,
		updatedAt: branch.updatedAt,
		startedAt: branch.startedAt ?? null,
		finishedAt: branch.finishedAt ?? null,
		threadId: branch.threadId ?? null,
		pendingVibeCount: Array.isArray(branch.pendingVibeIds) ? branch.pendingVibeIds.length : 0,
		error: branch.error ? String(branch.error).slice(0, 500) : null,
		proposal
	};
}

export function publicRunProjection(run, branches, recentEvents = []) {
	return {
		id: run.id,
		status: run.status,
		stage: run.stage,
		problemId: run.problemId,
		dataset: run.dataset,
		createdAt: run.createdAt,
		updatedAt: run.updatedAt,
		branchCount: branches.length,
		branches,
		recentEvents
	};
}

export async function appendFileText(filePath, text) {
	await ensureDir(path.dirname(filePath));
	await appendFile(filePath, text, 'utf8');
}

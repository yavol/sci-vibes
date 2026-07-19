import { spawn } from 'node:child_process';
import process from 'node:process';

const children = new Set();
let stopping = false;

function launch(command, args) {
	const child = spawn(command, args, {
		cwd: process.cwd(),
		env: process.env,
		stdio: 'inherit'
	});
	children.add(child);
	child.once('exit', (code, signal) => {
		children.delete(child);
		if (!stopping && code !== 0) {
			console.error(`${command} exited unexpectedly (${signal ?? code}).`);
			shutdown(code || 1);
		}
	});
	return child;
}

function shutdown(exitCode = 0) {
	if (stopping) return;
	stopping = true;
	for (const child of children) {
		child.kill('SIGTERM');
	}
	const timer = setTimeout(() => {
		for (const child of children) child.kill('SIGKILL');
		process.exit(exitCode);
	}, 3_000);
	timer.unref();
	if (children.size === 0) process.exit(exitCode);
	Promise.all(
		[...children].map(
			(child) =>
				new Promise((resolve) => {
					child.once('exit', resolve);
				})
		)
	).then(() => process.exit(exitCode));
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

launch(process.execPath, ['scripts/research-manager.mjs', 'daemon']);
launch(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', ...process.argv.slice(2)]);

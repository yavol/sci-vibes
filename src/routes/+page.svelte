<script lang="ts">
	import { onMount } from 'svelte';

	type LooseRecord = Record<string, unknown>;
	type ViewMode = 'a' | 'b' | 'difference';
	type Bet = 'a' | 'b';
	type AgentLetter = 'A' | 'B' | 'C' | 'D';

	type AgentVisualization = {
		letter: AgentLetter;
		title: string;
		shortTitle: string;
		role: string;
		image: string;
		alt: string;
		caption: string;
	};

	type Proposal = {
		title?: string;
		shortName?: string;
		thesis?: string;
		summary?: string;
	};

	type Branch = {
		id: string;
		label?: string;
		title?: string;
		lens?: string;
		status?: string;
		stage?: string;
		progress?: number;
		updatedAt?: string;
		lastPublicMessage?: string;
		proposal?: Proposal | null;
	};

	type ResearchEvent = {
		id?: string;
		timestamp?: string;
		time?: string;
		branchId?: string | null;
		stage?: string | null;
		status?: string | null;
		type?: string;
		title?: string;
		message?: string;
		summary?: string;
	};

	type ResearchState = {
		generatedAt?: string;
		manager?: LooseRecord;
		dataset?: LooseRecord | null;
		run?: LooseRecord | null;
		activeRun?: string | LooseRecord | null;
		branches?: Branch[] | LooseRecord;
		events?: ResearchEvent[];
	};

	const VIEW_OPTIONS: {
		id: ViewMode;
		label: string;
		shortLabel: string;
		image: string;
		alt: string;
		caption: string;
	}[] = [
		{
			id: 'a',
			label: 'Architecture A',
			shortLabel: 'A',
			image: '/architecture-slides/01-symmetry-first-law-discovery.png',
			alt: 'Architecture A, a symmetry-first sparse law-discovery system for RETALT1',
			caption:
				'A searches a symmetry-valid sparse basis, applies physics gates, and returns explicit equations.'
		},
		{
			id: 'b',
			label: 'Architecture B',
			shortLabel: 'B',
			image: '/architecture-slides/02-physics-anchored-probabilistic-surrogate.png',
			alt: 'Architecture B, a physics-anchored probabilistic surrogate for RETALT1',
			caption:
				'B protects the low-order aerodynamic trend, then learns a correlated residual with calibrated bands.'
		},
		{
			id: 'difference',
			label: 'Difference',
			shortLabel: 'A ↔ B',
			image: '/architecture-slides/03-architecture-comparison.png',
			alt: 'Side-by-side comparison of law-discovery Architecture A and probabilistic Architecture B',
			caption:
				'Same data, budget, whole-Mach holdout, and whole-configuration holdout. The difference is the scientific bet.'
		}
	];

	const AGENT_VISUALIZATIONS: AgentVisualization[] = [
		{
			letter: 'A',
			title: 'Symmetry-first law discovery',
			shortTitle: 'Law discovery',
			role: 'Scientific-law challenger',
			image: '/architecture-slides/01-symmetry-first-law-discovery.png',
			alt: 'Architecture A, a symmetry-first sparse law-discovery system for RETALT1',
			caption:
				'Search a symmetry-valid sparse basis, reject physically invalid terms, and return explicit candidate equations.'
		},
		{
			letter: 'B',
			title: 'Physics-anchored probabilistic surrogate',
			shortTitle: 'Probabilistic surrogate',
			role: 'Predictive incumbent',
			image: '/architecture-slides/02-physics-anchored-probabilistic-surrogate.png',
			alt: 'Architecture B, a physics-anchored probabilistic surrogate for RETALT1',
			caption:
				'Protect the low-order aerodynamic trend, learn a correlated residual, and expose calibrated confidence.'
		},
		{
			letter: 'C',
			title: 'Symmetry-anchored residual ridge',
			shortTitle: 'Residual ridge',
			role: 'Exact-closure specialist',
			image: '/architecture-slides/05-symmetry-anchored-residual-ridge.png',
			alt: 'Architecture C, a symmetry-anchored residual ridge with exact center-of-gravity moment translation',
			caption:
				'Anchor the testable zero-deflection structure, regularize configuration departures, and couple the moments algebraically.'
		},
		{
			letter: 'D',
			title: 'SAGE-Ridge support-aware confidence',
			shortTitle: 'Support-aware confidence',
			role: 'Robust-confidence specialist',
			image: '/architecture-slides/06-sage-ridge-support-aware-confidence.png',
			alt: 'Architecture D, a support-aware group-calibrated ridge ensemble for RETALT1',
			caption:
				'Calibrate on complete held-out configurations and widen confidence when a case lies far from training support.'
		}
	];

	const STAGE_ORDER = [
		'idle',
		'proposer',
		'awaiting_human',
		'implementer',
		'evaluation',
		'judge',
		'conclusions',
		'complete'
	];

	let researchState: ResearchState | null = $state(null);
	let loading = $state(true);
	let pollingError = $state('');
	let actionError = $state('');
	let actionBusy = $state('');
	let lastSync = $state<Date | null>(null);
	let comparisonView = $state<ViewMode>('difference');
	let chosenBet = $state<Bet>('b');
	let selectedVisualization = $state<AgentVisualization | null>(null);

	let vibeBranch = $state('');
	let vibeMode = $state('steer');
	let vibeDirection = $state(
		'Keep B as the predictive incumbent, but test whether A can recover stable terms that transfer across held-out configurations.'
	);
	let vibeObservation = $state(
		'The recovered synthesis separates predictive confidence from scientific interpretability.'
	);
	let vibeAvoidance = $state('Do not tune against the whole-Mach or whole-configuration holdouts.');
	let vibeSuccessSignal = $state(
		'Report calibration for B and stable, repeatable equation terms for A under the identical holdout protocol.'
	);
	let vibeApplyMode = $state('next_stage');
	let vibeConfidence = $state(80);

	function isRecord(value: unknown): value is LooseRecord {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function text(value: unknown, fallback = ''): string {
		return typeof value === 'string' && value.trim() ? value.trim() : fallback;
	}

	function numberValue(value: unknown, fallback = 0): number {
		return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
	}

	function runRecord(): LooseRecord {
		if (isRecord(researchState?.run)) return researchState.run;
		if (isRecord(researchState?.activeRun)) return researchState.activeRun;
		return {};
	}

	function normalizeBranch(raw: LooseRecord, index: number): Branch {
		const proposal = isRecord(raw.proposal) ? (raw.proposal as Proposal) : null;
		return {
			id: text(raw.id, text(raw.branchId, `branch-${index + 1}`)),
			label: text(raw.label),
			title: text(raw.title),
			lens: text(raw.lens, text(raw.direction)),
			status: text(raw.status, 'queued'),
			stage: text(raw.stage, text(raw.currentStage, 'idle')),
			progress: numberValue(raw.progress, stageProgress(text(raw.stage, 'idle'))),
			updatedAt: text(raw.updatedAt),
			lastPublicMessage: text(raw.lastPublicMessage, text(raw.publicMessage)),
			proposal
		};
	}

	function branches(): Branch[] {
		const runBranches = runRecord().branches;
		if (Array.isArray(runBranches)) {
			return runBranches.filter(isRecord).map((branch, index) => normalizeBranch(branch, index));
		}

		const rootBranches = researchState?.branches;
		if (Array.isArray(rootBranches)) {
			return rootBranches.filter(isRecord).map((branch, index) => normalizeBranch(branch, index));
		}
		if (isRecord(rootBranches)) {
			return Object.entries(rootBranches)
				.filter(([, branch]) => isRecord(branch))
				.map(([id, branch], index) => normalizeBranch({ ...(branch as LooseRecord), id }, index));
		}
		return [];
	}

	function runId(): string {
		if (typeof researchState?.activeRun === 'string') return researchState.activeRun;
		return text(runRecord().id, text(runRecord().runId, 'No active run'));
	}

	function hasRun(): boolean {
		return runId() !== 'No active run' || branches().length > 0;
	}

	function managerStatus(): string {
		const manager = isRecord(researchState?.manager) ? researchState.manager : {};
		return text(manager.status, text(manager.state, pollingError ? 'offline' : loading ? 'connecting' : 'ready'));
	}

	function managerMessage(): string {
		const manager = isRecord(researchState?.manager) ? researchState.manager : {};
		return text(
			manager.message,
			text(manager.publicMessage, pollingError ? 'Manager link unavailable' : 'Research manager connected')
		);
	}

	function activeWorkers(): number {
		const manager = isRecord(researchState?.manager) ? researchState.manager : {};
		const live = numberValue(manager.activeWorkers, -1);
		if (live >= 0) return live;
		return branches().filter((branch) => isActive(branch)).length;
	}

	function stageProgress(stage: string): number {
		const normalized = stage.toLowerCase().replaceAll(' ', '_');
		const index = STAGE_ORDER.findIndex(
			(item) =>
				normalized === item ||
				(normalized.includes('human') && item === 'awaiting_human') ||
				(normalized.includes('proposal') && item === 'proposer') ||
				(normalized.includes('implement') && item === 'implementer') ||
				(normalized.includes('eval') && item === 'evaluation') ||
				(normalized.includes('conclu') && item === 'conclusions')
		);
		return index < 0 ? 8 : Math.round((index / (STAGE_ORDER.length - 1)) * 100);
	}

	function normalizedStatus(branch: Branch): string {
		return text(branch.status, 'queued').toLowerCase().replaceAll('_', ' ');
	}

	function isActive(branch: Branch): boolean {
		const status = normalizedStatus(branch);
		return ['running', 'active', 'working', 'implementing', 'proposing', 'judging'].some((word) =>
			status.includes(word)
		);
	}

	function isStopped(branch: Branch): boolean {
		const status = normalizedStatus(branch);
		return ['stopped', 'cancelled', 'canceled', 'failed', 'complete'].some((word) =>
			status.includes(word)
		);
	}

	function branchLetter(branch: Branch, index: number): string {
		const match = branch.id.match(/branch[-_]?([a-z])/i);
		return match?.[1]?.toUpperCase() ?? String.fromCharCode(65 + index);
	}

	function branchName(branch: Branch, index: number): string {
		return (
			text(branch.proposal?.shortName) ||
			text(branch.proposal?.title) ||
			text(branch.label) ||
			text(branch.title) ||
			text(branch.lens) ||
			`Research direction ${branchLetter(branch, index)}`
		);
	}

	function branchSummary(branch: Branch): string {
		return (
			text(branch.lastPublicMessage) ||
			text(branch.proposal?.thesis) ||
			text(branch.proposal?.summary) ||
			text(branch.lens, 'Agent is preparing a falsifiable architecture.')
		);
	}

	function visibleEvents(): ResearchEvent[] {
		return (Array.isArray(researchState?.events) ? researchState.events : [])
			.filter((event) => event && typeof event === 'object')
			.slice(-5)
			.reverse();
	}

	function eventMessage(event: ResearchEvent): string {
		return (
			text(event.message) ||
			text(event.summary) ||
			text(event.title) ||
			`${text(event.stage, 'manager')} ${text(event.status, text(event.type, 'updated'))}`
		);
	}

	function eventTime(event: ResearchEvent): string {
		const raw = text(event.timestamp, text(event.time));
		if (!raw) return 'now';
		const parsed = new Date(raw);
		if (Number.isNaN(parsed.getTime())) return raw;
		return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function currentView() {
		return VIEW_OPTIONS.find((option) => option.id === comparisonView) ?? VIEW_OPTIONS[2];
	}

	function visualizationFor(letter: string): AgentVisualization {
		return (
			AGENT_VISUALIZATIONS.find((visualization) => visualization.letter === letter) ??
			AGENT_VISUALIZATIONS[0]
		);
	}

	function openVisualization(letter: string) {
		selectedVisualization = visualizationFor(letter);
	}

	function moveVisualization(direction: -1 | 1) {
		if (!selectedVisualization) return;
		const index = AGENT_VISUALIZATIONS.findIndex(
			(visualization) => visualization.letter === selectedVisualization?.letter
		);
		selectedVisualization =
			AGENT_VISUALIZATIONS[
				(index + direction + AGENT_VISUALIZATIONS.length) % AGENT_VISUALIZATIONS.length
			];
	}

	function handleVisualizationKeydown(event: KeyboardEvent) {
		if (!selectedVisualization) return;
		if (event.key === 'Escape') selectedVisualization = null;
		if (event.key === 'ArrowLeft') moveVisualization(-1);
		if (event.key === 'ArrowRight') moveVisualization(1);
	}

	async function fetchState(quiet = false) {
		try {
			const response = await fetch('/api/state', { headers: { accept: 'application/json' } });
			if (!response.ok) throw new Error(`State endpoint returned ${response.status}`);
			researchState = (await response.json()) as ResearchState;
			pollingError = '';
			lastSync = new Date();

			const liveBranches = branches();
			if ((!vibeBranch || !liveBranches.some((branch) => branch.id === vibeBranch)) && liveBranches[0]) {
				vibeBranch = liveBranches[0].id;
			}
		} catch (error) {
			pollingError = error instanceof Error ? error.message : 'Manager is unreachable';
			if (!quiet) researchState = researchState ?? {};
		} finally {
			loading = false;
		}
	}

	async function sendControl(action: string, payload: LooseRecord = {}) {
		actionBusy = `${action}:${text(payload.branchId, 'global')}`;
		actionError = '';

		try {
			const controlPayload =
				action === 'start_demo' ? { action, ...payload } : { action, runId: runId(), ...payload };
			const response = await fetch('/api/control', {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify(controlPayload)
			});
			if (!response.ok) {
				const body = await response.text();
				throw new Error(body || `Control endpoint returned ${response.status}`);
			}
			await fetchState(true);
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Command was not accepted';
		} finally {
			actionBusy = '';
		}
	}

	async function submitVibe() {
		if (!vibeBranch) {
			actionError = 'Start a run before injecting a research direction.';
			return;
		}
		if (!vibeDirection.trim()) {
			actionError = 'Give the agent a direction before sending the Vibe Card.';
			return;
		}

		await sendControl('inject_vibe', {
			branchId: vibeBranch,
			vibeCard: {
				intent: vibeMode,
				observation: vibeObservation.trim() || 'No additional observation supplied.',
				direction: vibeDirection.trim(),
				avoidance:
					vibeAvoidance.trim() || 'Do not compromise the whole-Mach or whole-configuration holdouts.',
				successSignal:
					vibeSuccessSignal.trim() || 'Report a measurable result under the canonical evaluation protocol.',
				confidence: vibeConfidence / 100,
				applyMode: vibeApplyMode
			}
		});
	}

	onMount(() => {
		void fetchState();
		const timer = window.setInterval(() => void fetchState(true), 2000);
		return () => window.clearInterval(timer);
	});
</script>

<svelte:head>
	<title>Vibe Lab — RETALT1 architecture decision</title>
	<meta
		name="description"
		content="A light research control room for the recovered RETALT1 architecture decision: law discovery versus probabilistic prediction."
	/>
</svelte:head>

<svelte:window onkeydown={handleVisualizationKeydown} />

<div class="research-app">
	<header class="topbar" inert={selectedVisualization !== null}>
		<div class="brand-lockup">
			<a href="/" class="brand" aria-label="Vibe Lab home">
				<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
				<span>VIBE LAB</span>
			</a>
			<span class="context-divider"></span>
			<div class="case-label">
				<span>Research control room</span>
				<strong>RETALT1 / architecture review</strong>
			</div>
		</div>

		<div class="live-cluster" aria-label="Live manager status">
			<a class="results-link" href="/results">
				<span>Results</span>
				<svg viewBox="0 0 18 18" aria-hidden="true">
					<path d="M3 14V9m4 5V5m4 9V8m4 6V3" />
				</svg>
			</a>
			<div class="live-health">
				<span class:offline={Boolean(pollingError)} class="health-dot"></span>
				<div>
					<span>Manager</span>
					<strong>{managerStatus()}</strong>
				</div>
			</div>
			<div class="run-identity">
				<span>{activeWorkers()} workers active</span>
				<strong>{runId()}</strong>
			</div>
			<button
				class="sync-button"
				type="button"
				aria-label="Refresh manager state"
				title={managerMessage()}
				onclick={() => fetchState()}
			>
				<svg class:spinning={loading} viewBox="0 0 20 20" aria-hidden="true">
					<path d="M16.4 7A7 7 0 1 0 17 12m-.6-5V2m0 5h-5" />
				</svg>
				<span>{lastSync ? lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sync'}</span>
			</button>
		</div>
	</header>

	<main inert={selectedVisualization !== null}>
		<section class="brief-header" aria-labelledby="page-title">
			<div class="brief-copy">
				<div class="eyebrow"><span>Recovered A/B result</span><i></i><span>Decision brief 01</span></div>
				<h1 id="page-title">Two architectures. One evaluation.</h1>
				<p>
					The RETALT1 result is not a winner-takes-all bake-off. It is a clean division of labor:
					<strong>B owns predictive performance</strong>, while <strong>A earns the right to challenge it
					with interpretable laws.</strong>
				</p>
			</div>

			<div class="fact-ribbon" aria-label="Canonical case facts">
				<div>
					<span>Dataset</span>
					<strong>RETALT1</strong>
				</div>
				<div>
					<span>Usable public rows</span>
					<strong>6,908</strong>
				</div>
				<div>
					<span>Source / raw rows</span>
					<strong>7,087</strong>
				</div>
				<div>
					<span>Targets</span>
					<strong>8 coefficients</strong>
				</div>
				<div class="holdout-fact">
					<span>Evaluation lock</span>
					<strong>Whole-Mach + whole-configuration</strong>
				</div>
			</div>
		</section>

		<section class="workflow-strip" aria-label="Research workflow">
			<div class="workflow-step complete">
				<span>01</span>
				<div><strong>Explore</strong><small>4 agents, equal brief</small></div>
			</div>
			<i aria-hidden="true"></i>
			<div class="workflow-step complete">
				<span>02</span>
				<div><strong>Synthesize</strong><small>A/B result surfaced</small></div>
			</div>
			<i aria-hidden="true"></i>
			<div class="workflow-step current">
				<span>03</span>
				<div><strong>Choose</strong><small>Human sets the bet</small></div>
			</div>
			<i aria-hidden="true"></i>
			<div class="workflow-step">
				<span>04</span>
				<div><strong>Advance</strong><small>Manager checkpoints</small></div>
			</div>
		</section>

		<section class="review-grid" aria-label="Recovered architecture comparison">
			<article class="evidence-card">
				<header class="evidence-header">
					<div>
						<span class="section-kicker">Recovered synthesis</span>
						<h2>Inspect the scientific bet</h2>
						<p>Switch views without changing the evaluation contract.</p>
					</div>
					<div class="view-switcher" role="group" aria-label="Architecture view">
						{#each VIEW_OPTIONS as option}
							<button
								type="button"
								class:active={comparisonView === option.id}
								aria-pressed={comparisonView === option.id}
								onclick={() => (comparisonView = option.id)}
							>
								<span>{option.shortLabel}</span>
								{option.label}
							</button>
						{/each}
					</div>
				</header>

				<figure class="architecture-figure">
					<div class="figure-stage">
						<img src={currentView().image} alt={currentView().alt} />
						<div class="figure-badge">
							<span>{comparisonView === 'difference' ? 'DIRECT COMPARISON' : `VIEW ${comparisonView.toUpperCase()}`}</span>
							<strong>Canonical recovered artifact</strong>
						</div>
					</div>
					<figcaption>
						<div>
							<span>Reading</span>
							<p>{currentView().caption}</p>
						</div>
						<div class="figure-key">
							<span><i class="key-a"></i>A · equation structure</span>
							<span><i class="key-b"></i>B · residual function</span>
						</div>
					</figcaption>
				</figure>

				<div class="comparison-matrix" aria-label="Architecture A and B comparison">
					<div class="matrix-head">
						<span>Decision axis</span>
						<div><b>A</b><strong>Symmetry-first law discovery</strong></div>
						<div><b>B</b><strong>Physics-anchored probabilistic surrogate</strong></div>
					</div>
					<div class="matrix-row">
						<span>Role</span>
						<p>Law-discovery challenger</p>
						<p>Predictive incumbent</p>
					</div>
					<div class="matrix-row">
						<span>Returns</span>
						<p>Explicit sparse equations</p>
						<p>Predictive mean + calibrated band</p>
					</div>
					<div class="matrix-row">
						<span>Best bet</span>
						<p class="positive-a">Insight + transfer</p>
						<p class="positive-b">Accuracy + calibration</p>
					</div>
					<div class="matrix-row">
						<span>Known risk</span>
						<p class="risk">Underfit / missed terms</p>
						<p class="risk">Baseline bias / OOD</p>
					</div>
				</div>
			</article>

			<aside class="decision-rail" aria-labelledby="decision-title">
				<div class="decision-heading">
					<span class="section-kicker">Human gate</span>
					<h2 id="decision-title">Make the portfolio call</h2>
					<p>Choose the operating stance, then steer the live work below.</p>
				</div>

				<div class="recommendation-card">
					<div class="recommendation-topline">
						<span>Canonical recommendation</span>
						<i>Decision ready</i>
					</div>
					<h3>Back B. Keep A alive.</h3>
					<p>
						Deploy B as the predictive incumbent. Fund A as the law-discovery challenger, under the same
						whole-Mach and whole-configuration holdouts.
					</p>
					<div class="portfolio-split">
						<div>
							<span>B / incumbent</span>
							<strong>Accuracy</strong>
							<small>calibration · uncertainty</small>
						</div>
						<div>
							<span>A / challenger</span>
							<strong>Insight</strong>
							<small>terms · structure · transfer</small>
						</div>
					</div>
				</div>

				<div class="bet-selector">
					<span>Your primary bet</span>
					<div role="group" aria-label="Choose primary architecture">
						<button
							type="button"
							class:active={chosenBet === 'b'}
							aria-pressed={chosenBet === 'b'}
							onclick={() => (chosenBet = 'b')}
						>
							<i>B</i>
							<span><strong>Predictive incumbent</strong><small>Recommended</small></span>
						</button>
						<button
							type="button"
							class:active={chosenBet === 'a'}
							aria-pressed={chosenBet === 'a'}
							onclick={() => (chosenBet = 'a')}
						>
							<i>A</i>
							<span><strong>Law-discovery bet</strong><small>Higher scientific upside</small></span>
						</button>
					</div>
					<p class="choice-state">
						<span></span>
						{chosenBet === 'b'
							? 'B is marked as the primary operating bet.'
							: 'A is marked as the primary discovery bet.'}
					</p>
				</div>

				<div class="protocol-lock">
					<div class="lock-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
					</div>
					<div>
						<span>Non-negotiable protocol</span>
						<strong>Identical held-out regimes</strong>
						<p>No visible-test tuning. No branch-specific exceptions.</p>
					</div>
				</div>
			</aside>
		</section>

		<section class="operations-grid" aria-labelledby="operations-title">
			<div class="live-panel">
				<header class="panel-header">
					<div>
						<span class="section-kicker">Live manager state</span>
						<h2 id="operations-title">Four agents explore. The manager advances.</h2>
						<p>{managerMessage()}</p>
					</div>
					<div class="run-chip">
						<span class:offline={Boolean(pollingError)}></span>
						<div><small>{managerStatus()}</small><strong>{runId()}</strong></div>
					</div>
				</header>

				{#if loading && !hasRun()}
					<div class="loading-state" aria-live="polite">
						<span class="loading-line"></span>
						<div><strong>Reading the run ledger</strong><small>Connecting to GET /api/state…</small></div>
					</div>
				{:else if !hasRun()}
					<div class="empty-run">
						<div class="agent-stack" aria-hidden="true">
							<span>A</span><span>B</span><span>C</span><span>D</span>
						</div>
						<div>
							<span>No active exploration</span>
							<h3>Release four agents against the same brief.</h3>
							<p>Each branch receives the public RETALT1 case and stops at a human checkpoint.</p>
						</div>
						<button
							class="primary-action"
							type="button"
							disabled={Boolean(actionBusy)}
							onclick={() => sendControl('start_demo')}
						>
							{actionBusy.startsWith('start_demo') ? 'Starting run…' : 'Start four agents'}
							<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 8 6-8 6Z" /></svg>
						</button>
					</div>
				{:else}
					<div class="agent-grid">
						{#each branches() as branch, index (branch.id)}
							{@const agentLetter = branchLetter(branch, index)}
							<article
								class:active={isActive(branch)}
								class:stopped={isStopped(branch)}
								class="agent-card"
							>
								<header>
									<button
										class="agent-identity"
										type="button"
										aria-haspopup="dialog"
										aria-label={`Open Architecture ${agentLetter} visualization`}
										onclick={() => openVisualization(agentLetter)}
									>
										<b>{agentLetter}</b>
										<div>
											<span>Agent {String(index + 1).padStart(2, '0')} · view architecture</span>
											<strong>{branchName(branch, index)}</strong>
										</div>
										<svg viewBox="0 0 16 16" aria-hidden="true">
											<path d="M6 3H3v10h10v-3M9 3h4v4M13 3 7 9" />
										</svg>
									</button>
									<span class="agent-status"><i></i>{normalizedStatus(branch)}</span>
								</header>
								<p>{branchSummary(branch)}</p>
								<div class="progress-label">
									<span>{text(branch.stage, 'idle').replaceAll('_', ' ')}</span>
									<strong>{Math.min(100, Math.max(0, branch.progress ?? stageProgress(text(branch.stage))))}%</strong>
								</div>
								<div class="progress-track">
									<i style={`width:${Math.min(100, Math.max(0, branch.progress ?? stageProgress(text(branch.stage))))}%`}></i>
								</div>
								<footer>
									<button
										type="button"
										disabled={Boolean(actionBusy)}
										onclick={() => sendControl('continue_branch', { branchId: branch.id })}
									>
										<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 7 5-7 5Z" /></svg>
										Advance
									</button>
									<button
										type="button"
										disabled={Boolean(actionBusy)}
										onclick={() => sendControl('fork_branch', { branchId: branch.id })}
									>
										<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="3" r="1.5" /><circle cx="12" cy="4" r="1.5" /><circle cx="12" cy="13" r="1.5" /><path d="M4 5v3c0 3 3 4 6 4M6 7c2 0 4-1 4-3" /></svg>
										Fork
									</button>
									<button
										class="stop-action"
										type="button"
										disabled={Boolean(actionBusy) || isStopped(branch)}
										onclick={() => sendControl('stop_branch', { branchId: branch.id })}
									>
										<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" /></svg>
										Stop
									</button>
								</footer>
							</article>
						{/each}
					</div>
				{/if}

				{#if hasRun()}
					<div class="ledger">
						<div class="ledger-title">
							<span><i></i>Checkpoint ledger</span>
							<small>sanitized manager events</small>
						</div>
						<div class="ledger-events" aria-live="polite">
							{#if visibleEvents().length}
								{#each visibleEvents() as event}
									<div class="ledger-event">
										<time>{eventTime(event)}</time>
										<b>{text(event.branchId, 'MGR').replace('branch-', '').toUpperCase()}</b>
										<span>{eventMessage(event)}</span>
									</div>
								{/each}
							{:else}
								<div class="ledger-empty">The ledger is open. The next public checkpoint will appear here.</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<form
				class="vibe-composer"
				onsubmit={(event) => {
					event.preventDefault();
					void submitVibe();
				}}
			>
				<header>
					<div>
						<span class="section-kicker">Human intervention</span>
						<h2>Inject a Vibe Card</h2>
					</div>
					<span class="signal-mark" aria-hidden="true"><i></i><i></i><i></i></span>
				</header>
				<p class="composer-intro">
					Steer the next checkpoint without prescribing implementation. The instruction is logged against
					the target branch.
				</p>

				<div class="form-row">
					<label>
						<span>Target branch</span>
						<select bind:value={vibeBranch} disabled={!branches().length}>
							{#if !branches().length}
								<option value="">No live branches</option>
							{:else}
								{#each branches() as branch, index}
									<option value={branch.id}>{branchLetter(branch, index)} · {branchName(branch, index)}</option>
								{/each}
							{/if}
						</select>
					</label>
					<label>
						<span>Intent</span>
						<select bind:value={vibeMode}>
							<option value="steer">Steer</option>
							<option value="challenge">Challenge</option>
							<option value="constrain">Constrain</option>
							<option value="prioritize">Prioritize</option>
						</select>
					</label>
				</div>

				<label class="field-block">
					<span>Direction <b>Required</b></span>
					<textarea rows="4" bind:value={vibeDirection} required></textarea>
				</label>
				<label class="field-block">
					<span>Observation</span>
					<input type="text" bind:value={vibeObservation} />
				</label>
				<label class="field-block">
					<span>Avoid</span>
					<input type="text" bind:value={vibeAvoidance} />
				</label>
				<label class="field-block">
					<span>Success signal</span>
					<input type="text" bind:value={vibeSuccessSignal} />
				</label>

				<div class="form-row">
					<label>
						<span>Apply</span>
						<select bind:value={vibeApplyMode}>
							<option value="next_stage">Next checkpoint</option>
							<option value="immediate">Interrupt now</option>
						</select>
					</label>
					<label class="confidence-field">
						<span>Confidence <output>{vibeConfidence}%</output></span>
						<input type="range" min="10" max="100" step="10" bind:value={vibeConfidence} />
					</label>
				</div>

				<button class="inject-button" type="submit" disabled={Boolean(actionBusy) || !branches().length}>
					<span>{actionBusy.startsWith('inject_vibe') ? 'Logging intervention…' : 'Inject at checkpoint'}</span>
					<svg viewBox="0 0 22 16" aria-hidden="true"><path d="M1 8h18M14 2l6 6-6 6" /></svg>
				</button>
				<small class="composer-note">POST /api/control · manager timestamp · branch-visible</small>
			</form>
		</section>
	</main>

	{#if selectedVisualization}
		<div
			class="visualization-backdrop"
			role="presentation"
			onclick={(event) => {
				if (event.target === event.currentTarget) selectedVisualization = null;
			}}
		>
			<div
				class="visualization-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby={`visualization-title-${selectedVisualization.letter}`}
			>
				<header class="visualization-header">
					<div class="visualization-heading">
						<b>{selectedVisualization.letter}</b>
						<div>
							<span>Architecture {selectedVisualization.letter} · {selectedVisualization.role}</span>
							<h2 id={`visualization-title-${selectedVisualization.letter}`}>
								{selectedVisualization.title}
							</h2>
						</div>
					</div>

					<div class="visualization-actions">
						<nav aria-label="Architecture visualizations">
							{#each AGENT_VISUALIZATIONS as visualization}
								<button
									type="button"
									class:active={selectedVisualization.letter === visualization.letter}
									aria-label={`Show Architecture ${visualization.letter}: ${visualization.shortTitle}`}
									aria-pressed={selectedVisualization.letter === visualization.letter}
									onclick={() => (selectedVisualization = visualization)}
								>
									{visualization.letter}
								</button>
							{/each}
						</nav>
						<button
							class="visualization-close"
							type="button"
							aria-label="Close architecture visualization"
							onclick={() => (selectedVisualization = null)}
						>
							<svg viewBox="0 0 18 18" aria-hidden="true"><path d="m4 4 10 10M14 4 4 14" /></svg>
						</button>
					</div>
				</header>

				<figure class="visualization-figure">
					<div class="visualization-stage">
						<img src={selectedVisualization.image} alt={selectedVisualization.alt} />
					</div>
					<figcaption>
						<div>
							<span>How to read it</span>
							<p>{selectedVisualization.caption}</p>
						</div>
						<small><kbd>←</kbd><kbd>→</kbd> switch · <kbd>esc</kbd> close</small>
					</figcaption>
				</figure>

				<footer class="visualization-footer">
					<button type="button" onclick={() => moveVisualization(-1)}>
						<svg viewBox="0 0 18 18" aria-hidden="true"><path d="m11 4-5 5 5 5" /></svg>
						Previous
					</button>
					<span>
						<strong>{selectedVisualization.letter}</strong>
						of {AGENT_VISUALIZATIONS.length}
					</span>
					<button type="button" onclick={() => moveVisualization(1)}>
						Next
						<svg viewBox="0 0 18 18" aria-hidden="true"><path d="m7 4 5 5-5 5" /></svg>
					</button>
				</footer>
			</div>
		</div>
	{/if}

	<footer class="site-footer" inert={selectedVisualization !== null}>
		<div><span class="brand-mark small" aria-hidden="true"><i></i><i></i><i></i></span><strong>VIBE LAB</strong></div>
		<span>Public evidence → human judgment → manager advance</span>
		<span>RETALT1 · recovered architecture review</span>
	</footer>

	{#if actionError || pollingError}
		<div class="error-toast" role="status">
			<span>!</span>
			<div>
				<strong>{actionError ? 'Command not accepted' : 'Manager link degraded'}</strong>
				<p>{actionError || pollingError}</p>
			</div>
			<button
				type="button"
				aria-label="Dismiss message"
				onclick={() => {
					actionError = '';
					pollingError = '';
				}}>×</button
			>
		</div>
	{/if}
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		background: #f4f3ef;
		color-scheme: light;
		scroll-behavior: smooth;
	}

	:global(body) {
		margin: 0;
		min-width: 1100px;
		background: #f4f3ef;
		color: #13233b;
		font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;
		font-size: 14px;
		-webkit-font-smoothing: antialiased;
	}

	:global(button),
	:global(input),
	:global(select),
	:global(textarea) {
		font: inherit;
	}

	:global(button) {
		-webkit-tap-highlight-color: transparent;
	}

	:global(button:focus-visible),
	:global(input:focus-visible),
	:global(select:focus-visible),
	:global(textarea:focus-visible),
	:global(a:focus-visible) {
		outline: 2px solid #2458df;
		outline-offset: 2px;
	}

	.research-app {
		--canvas: #f4f3ef;
		--paper: #ffffff;
		--paper-warm: #fbfaf7;
		--ink: #10213b;
		--muted: #667287;
		--faint: #9099a8;
		--line: #dfe3e8;
		--line-strong: #cbd2dc;
		--cobalt: #2458df;
		--cobalt-soft: #e9efff;
		--teal: #0d7d86;
		--teal-soft: #e7f3f2;
		--coral: #cc624e;
		--coral-soft: #fff0eb;
		min-height: 100vh;
		background:
			linear-gradient(rgba(16, 33, 59, 0.022) 1px, transparent 1px),
			linear-gradient(90deg, rgba(16, 33, 59, 0.022) 1px, transparent 1px),
			var(--canvas);
		background-size: 24px 24px;
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 68px;
		padding: 0 34px;
		border-bottom: 1px solid rgba(203, 210, 220, 0.9);
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 1px 0 rgba(16, 33, 59, 0.02);
		backdrop-filter: blur(18px);
	}

	.brand-lockup,
	.live-cluster,
	.brand,
	.live-health,
	.results-link,
	.sync-button {
		display: flex;
		align-items: center;
	}

	.brand {
		gap: 10px;
		color: var(--ink);
		font-size: 13px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-decoration: none;
	}

	.brand-mark {
		display: grid;
		grid-template-columns: repeat(3, 5px);
		align-items: end;
		gap: 2px;
		width: 19px;
		height: 18px;
	}

	.brand-mark i {
		display: block;
		width: 5px;
		border-radius: 3px;
		background: var(--cobalt);
	}

	.brand-mark i:nth-child(1) {
		height: 9px;
	}

	.brand-mark i:nth-child(2) {
		height: 17px;
		background: var(--teal);
	}

	.brand-mark i:nth-child(3) {
		height: 12px;
		background: var(--coral);
	}

	.context-divider {
		width: 1px;
		height: 30px;
		margin: 0 18px;
		background: var(--line);
	}

	.case-label {
		display: grid;
		gap: 2px;
	}

	.case-label span,
	.live-health span,
	.run-identity span {
		color: var(--faint);
		font-size: 10px;
		font-weight: 650;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.case-label strong {
		font-size: 12px;
		font-weight: 650;
	}

	.live-cluster {
		height: 100%;
	}

	.results-link {
		align-self: center;
		gap: 7px;
		height: 34px;
		margin-right: 20px;
		padding: 0 11px;
		border: 1px solid #cfd8ec;
		border-radius: 7px;
		background: #f8faff;
		color: var(--cobalt);
		font-size: 9px;
		font-weight: 760;
		letter-spacing: 0.08em;
		text-decoration: none;
		text-transform: uppercase;
		transition:
			border-color 150ms ease,
			background 150ms ease,
			transform 150ms ease;
	}

	.results-link:hover {
		border-color: #9eb2e7;
		background: var(--cobalt-soft);
		transform: translateY(-1px);
	}

	.results-link svg {
		width: 14px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-width: 1.5;
	}

	.live-health {
		gap: 9px;
		padding-right: 20px;
	}

	.health-dot,
	.run-chip > span {
		width: 8px;
		height: 8px;
		border: 2px solid #fff;
		border-radius: 50%;
		background: #22a06b;
		box-shadow: 0 0 0 1px rgba(34, 160, 107, 0.28), 0 0 0 4px rgba(34, 160, 107, 0.08);
	}

	.health-dot.offline,
	.run-chip > span.offline {
		background: var(--coral);
		box-shadow: 0 0 0 1px rgba(204, 98, 78, 0.28), 0 0 0 4px rgba(204, 98, 78, 0.08);
	}

	.live-health div,
	.run-identity {
		display: grid;
		gap: 2px;
	}

	.live-health strong {
		font-size: 12px;
		text-transform: capitalize;
	}

	.run-identity {
		min-width: 250px;
		max-width: 330px;
		height: 100%;
		justify-content: center;
		padding: 0 20px;
		border-right: 1px solid var(--line);
		border-left: 1px solid var(--line);
	}

	.run-identity strong {
		overflow: hidden;
		color: #3e4b60;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 11px;
		font-weight: 550;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sync-button {
		gap: 7px;
		height: 100%;
		padding: 0 0 0 18px;
		border: 0;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		font-size: 11px;
	}

	.sync-button svg {
		width: 16px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.6;
	}

	.sync-button svg.spinning {
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	main {
		width: min(1640px, calc(100% - 64px));
		margin: 0 auto;
		padding: 42px 0 36px;
	}

	.brief-header {
		display: grid;
		grid-template-columns: minmax(520px, 0.92fr) minmax(700px, 1.08fr);
		gap: 56px;
		align-items: end;
		margin-bottom: 30px;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 11px;
		margin-bottom: 12px;
		color: var(--cobalt);
		font-size: 10px;
		font-weight: 750;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.eyebrow i {
		display: block;
		width: 24px;
		height: 1px;
		background: #9db3ee;
	}

	.brief-copy h1 {
		max-width: 760px;
		margin: 0;
		color: var(--ink);
		font-size: clamp(35px, 3.25vw, 54px);
		font-weight: 710;
		letter-spacing: -0.042em;
		line-height: 1.02;
	}

	.brief-copy > p {
		max-width: 750px;
		margin: 18px 0 0;
		color: var(--muted);
		font-size: 16px;
		line-height: 1.6;
	}

	.brief-copy > p strong {
		color: var(--ink);
		font-weight: 650;
	}

	.fact-ribbon {
		display: grid;
		grid-template-columns: 0.82fr 1fr 1fr 1fr 1.75fr;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.72);
		box-shadow: 0 8px 30px rgba(23, 38, 61, 0.04);
	}

	.fact-ribbon > div {
		display: grid;
		align-content: center;
		min-height: 75px;
		padding: 13px 16px;
		border-right: 1px solid var(--line);
	}

	.fact-ribbon > div:last-child {
		border-right: 0;
	}

	.fact-ribbon span {
		margin-bottom: 7px;
		color: var(--faint);
		font-size: 9px;
		font-weight: 720;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.fact-ribbon strong {
		color: var(--ink);
		font-size: 15px;
		font-weight: 680;
		line-height: 1.22;
	}

	.fact-ribbon .holdout-fact strong {
		color: var(--teal);
		font-size: 13px;
	}

	.workflow-strip {
		display: grid;
		grid-template-columns: auto 1fr auto 1fr auto 1fr auto;
		align-items: center;
		gap: 18px;
		margin: 0 0 18px;
		padding: 0 4px;
	}

	.workflow-strip > i {
		height: 1px;
		background: linear-gradient(90deg, var(--line-strong), var(--line));
	}

	.workflow-step {
		display: flex;
		align-items: center;
		gap: 9px;
		color: var(--faint);
	}

	.workflow-step > span {
		display: grid;
		width: 30px;
		height: 30px;
		place-items: center;
		border: 1px solid var(--line-strong);
		border-radius: 50%;
		background: var(--paper);
		font-size: 9px;
		font-weight: 750;
	}

	.workflow-step div {
		display: grid;
		gap: 2px;
		white-space: nowrap;
	}

	.workflow-step strong {
		color: #4e5a6d;
		font-size: 11px;
		font-weight: 690;
	}

	.workflow-step small {
		font-size: 9px;
	}

	.workflow-step.complete > span {
		border-color: #a9d4d0;
		background: var(--teal-soft);
		color: var(--teal);
	}

	.workflow-step.current > span {
		border-color: var(--cobalt);
		background: var(--cobalt);
		color: #fff;
		box-shadow: 0 0 0 4px var(--cobalt-soft);
	}

	.workflow-step.current strong {
		color: var(--ink);
	}

	.review-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 355px;
		gap: 18px;
		align-items: start;
	}

	.evidence-card,
	.decision-rail,
	.live-panel,
	.vibe-composer {
		border: 1px solid var(--line-strong);
		background: var(--paper);
		box-shadow: 0 12px 34px rgba(24, 40, 64, 0.055);
	}

	.evidence-card {
		min-width: 0;
		border-radius: 12px;
		overflow: hidden;
	}

	.evidence-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 30px;
		min-height: 96px;
		padding: 20px 22px 18px 24px;
		border-bottom: 1px solid var(--line);
		background: var(--paper-warm);
	}

	.section-kicker {
		display: block;
		margin-bottom: 6px;
		color: var(--cobalt);
		font-size: 9px;
		font-weight: 780;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.evidence-header h2,
	.decision-heading h2,
	.panel-header h2,
	.vibe-composer h2 {
		margin: 0;
		color: var(--ink);
		font-size: 21px;
		font-weight: 690;
		letter-spacing: -0.025em;
	}

	.evidence-header p,
	.decision-heading p,
	.panel-header p {
		margin: 5px 0 0;
		color: var(--muted);
		font-size: 12px;
	}

	.view-switcher {
		display: flex;
		padding: 3px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: #f1f2f4;
	}

	.view-switcher button {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 38px;
		padding: 0 14px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: #647085;
		cursor: pointer;
		font-size: 11px;
		font-weight: 640;
		transition:
			background 150ms ease,
			box-shadow 150ms ease,
			color 150ms ease;
	}

	.view-switcher button span {
		display: grid;
		min-width: 21px;
		height: 21px;
		place-items: center;
		border: 1px solid #cfd5df;
		border-radius: 4px;
		font-size: 9px;
		font-weight: 760;
	}

	.view-switcher button.active {
		background: #fff;
		box-shadow: 0 2px 7px rgba(25, 38, 60, 0.12);
		color: var(--ink);
	}

	.view-switcher button.active span {
		border-color: #b7c6f2;
		background: var(--cobalt-soft);
		color: var(--cobalt);
	}

	.architecture-figure {
		margin: 0;
		padding: 16px 16px 0;
	}

	.figure-stage {
		position: relative;
		overflow: hidden;
		aspect-ratio: 1672 / 941;
		border: 1px solid #d5dbe5;
		border-radius: 9px;
		background: #f8f9fb;
		box-shadow: 0 4px 18px rgba(34, 57, 93, 0.06);
	}

	.figure-stage img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.figure-badge {
		position: absolute;
		right: 12px;
		bottom: 12px;
		display: grid;
		gap: 2px;
		padding: 8px 10px;
		border: 1px solid rgba(172, 184, 202, 0.82);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.92);
		box-shadow: 0 3px 12px rgba(15, 34, 64, 0.08);
		backdrop-filter: blur(10px);
	}

	.figure-badge span {
		color: var(--cobalt);
		font-size: 8px;
		font-weight: 800;
		letter-spacing: 0.1em;
	}

	.figure-badge strong {
		font-size: 10px;
		font-weight: 650;
	}

	.architecture-figure figcaption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		min-height: 60px;
		padding: 10px 3px 12px;
	}

	.architecture-figure figcaption > div:first-child {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 12px;
		align-items: baseline;
	}

	.architecture-figure figcaption > div:first-child > span {
		color: var(--faint);
		font-size: 9px;
		font-weight: 750;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.architecture-figure figcaption p {
		margin: 0;
		color: #5d687b;
		font-size: 11px;
		line-height: 1.45;
	}

	.figure-key {
		display: flex;
		gap: 16px;
		flex: 0 0 auto;
	}

	.figure-key span {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #6f7a8c;
		font-size: 9px;
		font-weight: 620;
	}

	.figure-key i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}

	.figure-key .key-a {
		background: var(--cobalt);
	}

	.figure-key .key-b {
		background: var(--teal);
	}

	.comparison-matrix {
		margin: 0 16px 16px;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 8px;
	}

	.matrix-head,
	.matrix-row {
		display: grid;
		grid-template-columns: 150px 1fr 1fr;
	}

	.matrix-head {
		min-height: 54px;
		background: #f4f6f9;
	}

	.matrix-head > span,
	.matrix-row > span,
	.matrix-head > div,
	.matrix-row > p {
		display: flex;
		align-items: center;
		margin: 0;
		padding: 11px 14px;
		border-right: 1px solid var(--line);
	}

	.matrix-head > *:last-child,
	.matrix-row > *:last-child {
		border-right: 0;
	}

	.matrix-head > span {
		color: var(--faint);
		font-size: 9px;
		font-weight: 750;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.matrix-head > div {
		gap: 10px;
	}

	.matrix-head b {
		display: grid;
		width: 25px;
		height: 25px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 6px;
		background: var(--cobalt-soft);
		color: var(--cobalt);
		font-size: 11px;
	}

	.matrix-head > div:last-child b {
		background: var(--teal-soft);
		color: var(--teal);
	}

	.matrix-head strong {
		font-size: 11px;
		font-weight: 670;
	}

	.matrix-row {
		min-height: 42px;
		border-top: 1px solid var(--line);
	}

	.matrix-row > span {
		color: var(--faint);
		font-size: 9px;
		font-weight: 720;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.matrix-row > p {
		color: #4e5b70;
		font-size: 11px;
		line-height: 1.4;
	}

	.matrix-row p.positive-a {
		color: var(--cobalt);
		font-weight: 680;
	}

	.matrix-row p.positive-b {
		color: var(--teal);
		font-weight: 680;
	}

	.matrix-row p.risk {
		color: #995340;
	}

	.decision-rail {
		position: sticky;
		top: 86px;
		overflow: hidden;
		border-radius: 12px;
	}

	.decision-heading {
		padding: 23px 23px 19px;
		border-bottom: 1px solid var(--line);
	}

	.recommendation-card {
		margin: 14px;
		padding: 17px;
		border: 1px solid #b8d7d5;
		border-radius: 9px;
		background:
			linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(231, 243, 242, 0.88)),
			var(--teal-soft);
	}

	.recommendation-topline {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.recommendation-topline > span {
		color: var(--teal);
		font-size: 9px;
		font-weight: 780;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.recommendation-topline i {
		padding: 4px 6px;
		border-radius: 999px;
		background: #fff;
		color: var(--teal);
		font-size: 8px;
		font-style: normal;
		font-weight: 720;
	}

	.recommendation-card h3 {
		margin: 15px 0 7px;
		color: var(--ink);
		font-size: 23px;
		font-weight: 710;
		letter-spacing: -0.04em;
	}

	.recommendation-card > p {
		margin: 0;
		color: #4e6570;
		font-size: 11px;
		line-height: 1.52;
	}

	.portfolio-split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		margin-top: 15px;
	}

	.portfolio-split > div {
		display: grid;
		gap: 3px;
		padding: 10px;
		border: 1px solid rgba(116, 168, 169, 0.28);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.72);
	}

	.portfolio-split span {
		color: var(--faint);
		font-size: 8px;
		font-weight: 720;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.portfolio-split strong {
		color: var(--teal);
		font-size: 13px;
	}

	.portfolio-split > div:last-child strong {
		color: var(--cobalt);
	}

	.portfolio-split small {
		color: #697888;
		font-size: 8px;
	}

	.bet-selector {
		padding: 3px 14px 14px;
	}

	.bet-selector > span {
		display: block;
		margin: 0 0 8px 2px;
		color: var(--faint);
		font-size: 9px;
		font-weight: 750;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.bet-selector > div {
		display: grid;
		gap: 6px;
	}

	.bet-selector button {
		display: flex;
		align-items: center;
		gap: 11px;
		width: 100%;
		min-height: 53px;
		padding: 8px 11px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: #fff;
		color: var(--ink);
		cursor: pointer;
		text-align: left;
		transition:
			border-color 150ms ease,
			box-shadow 150ms ease,
			background 150ms ease;
	}

	.bet-selector button:hover {
		border-color: #aeb9ca;
	}

	.bet-selector button.active {
		border-color: #8ca6ef;
		background: #f8faff;
		box-shadow: 0 0 0 2px rgba(36, 88, 223, 0.08);
	}

	.bet-selector button i {
		display: grid;
		width: 30px;
		height: 30px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 6px;
		background: var(--teal-soft);
		color: var(--teal);
		font-size: 12px;
		font-style: normal;
		font-weight: 800;
	}

	.bet-selector button:last-child i {
		background: var(--cobalt-soft);
		color: var(--cobalt);
	}

	.bet-selector button > span {
		display: grid;
		gap: 2px;
	}

	.bet-selector button strong {
		font-size: 11px;
		font-weight: 680;
	}

	.bet-selector button small {
		color: var(--faint);
		font-size: 9px;
	}

	.choice-state {
		display: flex;
		align-items: center;
		gap: 7px;
		margin: 9px 2px 0;
		color: #627084;
		font-size: 9px;
	}

	.choice-state span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #22a06b;
	}

	.protocol-lock {
		display: flex;
		gap: 12px;
		margin: 0 14px 14px;
		padding: 13px;
		border: 1px solid #ead7cf;
		border-radius: 8px;
		background: #fff9f6;
	}

	.lock-icon {
		display: grid;
		width: 31px;
		height: 31px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 7px;
		background: var(--coral-soft);
		color: var(--coral);
	}

	.lock-icon svg {
		width: 16px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.7;
	}

	.protocol-lock > div:last-child {
		display: grid;
		gap: 3px;
	}

	.protocol-lock span {
		color: var(--coral);
		font-size: 8px;
		font-weight: 760;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.protocol-lock strong {
		font-size: 11px;
		font-weight: 680;
	}

	.protocol-lock p {
		margin: 0;
		color: #84675e;
		font-size: 9px;
		line-height: 1.4;
	}

	.operations-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 430px;
		gap: 18px;
		align-items: start;
		margin-top: 18px;
	}

	.live-panel,
	.vibe-composer {
		border-radius: 12px;
	}

	.live-panel {
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		min-height: 93px;
		padding: 19px 22px;
		border-bottom: 1px solid var(--line);
		background: var(--paper-warm);
	}

	.run-chip {
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: 310px;
		padding: 9px 11px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: #fff;
	}

	.run-chip > div {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.run-chip small {
		color: var(--faint);
		font-size: 8px;
		font-weight: 720;
		text-transform: uppercase;
	}

	.run-chip strong {
		overflow: hidden;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 9px;
		font-weight: 550;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.agent-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		padding: 12px;
	}

	.agent-card {
		position: relative;
		min-width: 0;
		padding: 13px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: #fff;
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease;
	}

	.agent-card::before {
		position: absolute;
		top: -1px;
		right: 13px;
		left: 13px;
		height: 2px;
		border-radius: 0 0 2px 2px;
		background: #d8dde5;
		content: '';
	}

	.agent-card.active {
		border-color: #b8c8ed;
		box-shadow: 0 3px 12px rgba(36, 88, 223, 0.06);
	}

	.agent-card.active::before {
		background: var(--cobalt);
	}

	.agent-card.stopped {
		background: #fafafa;
		opacity: 0.73;
	}

	.agent-card header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}

	.agent-identity {
		display: flex;
		align-items: center;
		gap: 9px;
		min-width: 0;
		margin: -3px 0 -3px -3px;
		padding: 3px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
		text-align: left;
		transition:
			background 150ms ease,
			transform 150ms ease;
	}

	.agent-identity:hover {
		background: #f4f7ff;
		transform: translateY(-1px);
	}

	.agent-identity > b {
		display: grid;
		width: 30px;
		height: 30px;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid #bfcbeb;
		border-radius: 6px;
		background: var(--cobalt-soft);
		color: var(--cobalt);
		font-size: 11px;
		transition:
			border-color 150ms ease,
			background 150ms ease,
			box-shadow 150ms ease;
	}

	.agent-identity:hover > b {
		border-color: #8ea9ea;
		background: #dfe8ff;
		box-shadow: 0 3px 9px rgba(36, 88, 223, 0.13);
	}

	.agent-identity > div {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.agent-identity span {
		color: var(--faint);
		font-size: 8px;
		font-weight: 740;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.agent-identity strong {
		overflow: hidden;
		font-size: 11px;
		font-weight: 680;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.agent-identity > svg {
		width: 13px;
		height: 13px;
		flex: 0 0 auto;
		margin-left: 2px;
		fill: none;
		stroke: #9aa8bd;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.35;
		opacity: 0;
		transform: translate(-2px, 2px);
		transition:
			opacity 150ms ease,
			transform 150ms ease;
	}

	.agent-identity:hover > svg,
	.agent-identity:focus-visible > svg {
		opacity: 1;
		transform: translate(0, 0);
	}

	.agent-status {
		display: flex;
		align-items: center;
		gap: 5px;
		flex: 0 0 auto;
		padding: 4px 6px;
		border-radius: 999px;
		background: #f0f2f5;
		color: #6d7788;
		font-size: 8px;
		font-weight: 700;
		text-transform: uppercase;
	}

	.agent-status i {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #a0a8b4;
	}

	.agent-card.active .agent-status {
		background: var(--teal-soft);
		color: var(--teal);
	}

	.agent-card.active .agent-status i {
		background: #22a06b;
		animation: pulse 1.8s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 4px rgba(34, 160, 107, 0.12);
		}
	}

	.agent-card > p {
		display: -webkit-box;
		min-height: 35px;
		margin: 12px 0;
		overflow: hidden;
		color: #647085;
		font-size: 10px;
		line-height: 1.45;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.progress-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 5px;
		color: var(--faint);
		font-size: 8px;
		text-transform: capitalize;
	}

	.progress-label strong {
		font-size: 8px;
		font-weight: 650;
	}

	.progress-track {
		height: 3px;
		overflow: hidden;
		border-radius: 4px;
		background: #e9ecf1;
	}

	.progress-track i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--cobalt), #5f81df);
	}

	.agent-card footer {
		display: flex;
		gap: 5px;
		margin-top: 12px;
	}

	.agent-card footer button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		height: 27px;
		padding: 0 8px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: #fff;
		color: #536075;
		cursor: pointer;
		font-size: 8px;
		font-weight: 670;
	}

	.agent-card footer button:hover:not(:disabled) {
		border-color: #9eacc0;
		color: var(--cobalt);
	}

	.agent-card footer button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.agent-card footer button.stop-action {
		margin-left: auto;
		color: #9b655a;
	}

	.agent-card footer svg {
		width: 11px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.3;
	}

	.agent-card footer svg path:first-child,
	.agent-card footer svg rect {
		fill: currentColor;
		stroke: none;
	}

	.ledger {
		border-top: 1px solid var(--line);
		background: #fafaf9;
	}

	.ledger-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px 8px;
	}

	.ledger-title > span {
		display: flex;
		align-items: center;
		gap: 7px;
		color: #59667a;
		font-size: 9px;
		font-weight: 740;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.ledger-title i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #22a06b;
	}

	.ledger-title small {
		color: var(--faint);
		font-size: 8px;
	}

	.ledger-events {
		display: grid;
		max-height: 178px;
		overflow: auto;
		padding: 0 14px 10px;
	}

	.ledger-event {
		display: grid;
		grid-template-columns: 48px 27px 1fr;
		align-items: baseline;
		gap: 8px;
		padding: 7px 0;
		border-top: 1px solid #e6e9ed;
	}

	.ledger-event time {
		color: var(--faint);
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 8px;
	}

	.ledger-event b {
		display: grid;
		height: 18px;
		place-items: center;
		border-radius: 4px;
		background: var(--cobalt-soft);
		color: var(--cobalt);
		font-size: 8px;
	}

	.ledger-event > span {
		overflow: hidden;
		color: #58667a;
		font-size: 9px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ledger-empty {
		padding: 11px 0 14px;
		border-top: 1px solid var(--line);
		color: var(--faint);
		font-size: 9px;
	}

	.loading-state,
	.empty-run {
		display: flex;
		align-items: center;
		min-height: 210px;
		margin: 12px;
		padding: 24px;
		border: 1px dashed var(--line-strong);
		border-radius: 9px;
		background: #fbfbfa;
	}

	.loading-state {
		justify-content: center;
		gap: 15px;
	}

	.loading-state > div {
		display: grid;
		gap: 3px;
	}

	.loading-state strong {
		font-size: 12px;
	}

	.loading-state small {
		color: var(--faint);
		font-size: 9px;
	}

	.loading-line {
		width: 24px;
		height: 24px;
		border: 2px solid #dbe1e9;
		border-top-color: var(--cobalt);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.empty-run {
		gap: 20px;
	}

	.agent-stack {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}

	.agent-stack span {
		display: grid;
		width: 33px;
		height: 33px;
		place-items: center;
		border: 1px solid #c5d0ed;
		border-radius: 6px;
		background: var(--cobalt-soft);
		color: var(--cobalt);
		font-size: 10px;
		font-weight: 750;
	}

	.empty-run > div:nth-child(2) {
		flex: 1;
	}

	.empty-run > div:nth-child(2) > span {
		color: var(--cobalt);
		font-size: 8px;
		font-weight: 760;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.empty-run h3 {
		margin: 6px 0;
		font-size: 17px;
	}

	.empty-run p {
		margin: 0;
		color: var(--muted);
		font-size: 10px;
	}

	.primary-action {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 40px;
		padding: 0 14px;
		border: 0;
		border-radius: 7px;
		background: var(--cobalt);
		box-shadow: 0 5px 14px rgba(36, 88, 223, 0.2);
		color: #fff;
		cursor: pointer;
		font-size: 10px;
		font-weight: 680;
	}

	.primary-action svg {
		width: 15px;
		fill: currentColor;
	}

	.vibe-composer {
		padding: 19px;
	}

	.vibe-composer > header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.signal-mark {
		display: flex;
		align-items: end;
		gap: 3px;
		height: 28px;
		padding: 5px 8px;
		border: 1px solid #c8d3ee;
		border-radius: 6px;
		background: var(--cobalt-soft);
	}

	.signal-mark i {
		width: 3px;
		border-radius: 4px;
		background: var(--cobalt);
	}

	.signal-mark i:nth-child(1) {
		height: 8px;
	}

	.signal-mark i:nth-child(2) {
		height: 16px;
	}

	.signal-mark i:nth-child(3) {
		height: 11px;
	}

	.composer-intro {
		margin: 12px 0 15px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--line);
		color: var(--muted);
		font-size: 10px;
		line-height: 1.5;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 9px;
	}

	.vibe-composer label {
		display: grid;
		gap: 6px;
		margin-bottom: 9px;
	}

	.vibe-composer label > span {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: #778196;
		font-size: 8px;
		font-weight: 740;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.vibe-composer label > span b {
		color: var(--coral);
		font-size: 7px;
	}

	.vibe-composer select,
	.vibe-composer input[type='text'],
	.vibe-composer textarea {
		width: 100%;
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		background: #fff;
		color: var(--ink);
		font-size: 10px;
		transition:
			border-color 150ms ease,
			box-shadow 150ms ease;
	}

	.vibe-composer select,
	.vibe-composer input[type='text'] {
		height: 35px;
		padding: 0 9px;
	}

	.vibe-composer textarea {
		min-height: 82px;
		padding: 9px;
		line-height: 1.45;
		resize: vertical;
	}

	.vibe-composer select:focus,
	.vibe-composer input[type='text']:focus,
	.vibe-composer textarea:focus {
		border-color: #8ea7ed;
		box-shadow: 0 0 0 3px var(--cobalt-soft);
		outline: none;
	}

	.confidence-field output {
		color: var(--cobalt);
		font-size: 9px;
		font-weight: 720;
	}

	.confidence-field input {
		width: 100%;
		margin: 7px 0 0;
		accent-color: var(--cobalt);
	}

	.inject-button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		height: 41px;
		margin-top: 2px;
		padding: 0 13px;
		border: 0;
		border-radius: 7px;
		background: var(--ink);
		box-shadow: 0 5px 16px rgba(16, 33, 59, 0.16);
		color: #fff;
		cursor: pointer;
		font-size: 10px;
		font-weight: 680;
	}

	.inject-button:hover:not(:disabled) {
		background: #1b3559;
	}

	.inject-button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.inject-button svg {
		width: 20px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.4;
	}

	.composer-note {
		display: block;
		margin-top: 8px;
		color: var(--faint);
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 7px;
		text-align: center;
	}

	.visualization-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: grid;
		place-items: center;
		padding: 28px;
		background:
			linear-gradient(rgba(11, 25, 47, 0.055) 1px, transparent 1px),
			linear-gradient(90deg, rgba(11, 25, 47, 0.055) 1px, transparent 1px),
			rgba(10, 23, 43, 0.72);
		background-size: 28px 28px;
		backdrop-filter: blur(12px) saturate(0.78);
		animation: visualization-fade 150ms ease-out;
	}

	.visualization-dialog {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		width: min(1500px, calc(100vw - 56px));
		max-height: calc(100vh - 56px);
		overflow: hidden;
		border: 1px solid rgba(196, 205, 219, 0.96);
		border-radius: 13px;
		background: #f8f9fb;
		box-shadow:
			0 30px 100px rgba(6, 17, 35, 0.35),
			0 2px 0 rgba(255, 255, 255, 0.7) inset;
		animation: visualization-rise 190ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.visualization-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		min-height: 72px;
		padding: 12px 14px 12px 17px;
		border-bottom: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.96);
	}

	.visualization-heading {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.visualization-heading > b {
		display: grid;
		width: 38px;
		height: 38px;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid #9eb2e7;
		border-radius: 8px;
		background: var(--cobalt-soft);
		color: var(--cobalt);
		font-size: 14px;
	}

	.visualization-heading > div {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.visualization-heading span {
		color: var(--faint);
		font-size: 8px;
		font-weight: 760;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.visualization-heading h2 {
		margin: 0;
		overflow: hidden;
		color: var(--ink);
		font-size: 18px;
		font-weight: 710;
		letter-spacing: -0.02em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.visualization-actions {
		display: flex;
		align-items: center;
		gap: 13px;
	}

	.visualization-actions nav {
		display: flex;
		gap: 4px;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: #f4f5f7;
	}

	.visualization-actions nav button {
		display: grid;
		width: 32px;
		height: 29px;
		place-items: center;
		border: 1px solid transparent;
		border-radius: 5px;
		background: transparent;
		color: #6d7787;
		cursor: pointer;
		font-size: 10px;
		font-weight: 780;
		transition:
			border-color 140ms ease,
			background 140ms ease,
			color 140ms ease;
	}

	.visualization-actions nav button:hover {
		color: var(--cobalt);
	}

	.visualization-actions nav button.active {
		border-color: #b9c8eb;
		background: #fff;
		box-shadow: 0 1px 4px rgba(16, 33, 59, 0.08);
		color: var(--cobalt);
	}

	.visualization-close {
		display: grid;
		width: 36px;
		height: 36px;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: #fff;
		color: #667287;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background 140ms ease,
			color 140ms ease;
	}

	.visualization-close:hover {
		border-color: #d9aaa0;
		background: var(--coral-soft);
		color: var(--coral);
	}

	.visualization-close svg {
		width: 16px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-width: 1.6;
	}

	.visualization-figure {
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		min-height: 0;
		margin: 0;
		padding: 14px 14px 0;
	}

	.visualization-stage {
		display: grid;
		min-height: 0;
		overflow: hidden;
		place-items: center;
		border: 1px solid #d9dee8;
		border-radius: 8px;
		background:
			linear-gradient(rgba(16, 33, 59, 0.018) 1px, transparent 1px),
			linear-gradient(90deg, rgba(16, 33, 59, 0.018) 1px, transparent 1px),
			#f1f3f7;
		background-size: 24px 24px;
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.7) inset;
	}

	.visualization-stage img {
		display: block;
		width: 100%;
		height: 100%;
		max-height: calc(100vh - 242px);
		object-fit: contain;
	}

	.visualization-figure figcaption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 30px;
		min-height: 60px;
		padding: 10px 4px 8px;
	}

	.visualization-figure figcaption > div {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 11px;
		align-items: baseline;
		min-width: 0;
	}

	.visualization-figure figcaption span {
		color: var(--cobalt);
		font-size: 8px;
		font-weight: 780;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.visualization-figure figcaption p {
		margin: 0;
		overflow: hidden;
		color: var(--muted);
		font-size: 10px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.visualization-figure figcaption small {
		flex: 0 0 auto;
		color: var(--faint);
		font-size: 8px;
	}

	.visualization-figure kbd {
		display: inline-grid;
		min-width: 19px;
		height: 19px;
		margin: 0 2px;
		place-items: center;
		border: 1px solid #d3d8e1;
		border-bottom-color: #b9c0cc;
		border-radius: 4px;
		background: #fff;
		box-shadow: 0 1px 0 #cdd3dc;
		color: #566276;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 7px;
	}

	.visualization-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 48px;
		padding: 7px 14px;
		border-top: 1px solid var(--line);
		background: #fff;
	}

	.visualization-footer button {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 31px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: #fff;
		color: #526078;
		cursor: pointer;
		font-size: 8px;
		font-weight: 720;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.visualization-footer button:hover {
		border-color: #afbee2;
		background: #f6f8ff;
		color: var(--cobalt);
	}

	.visualization-footer button svg {
		width: 13px;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.5;
	}

	.visualization-footer > span {
		color: var(--faint);
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 8px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.visualization-footer > span strong {
		color: var(--cobalt);
		font-size: 10px;
	}

	@keyframes visualization-fade {
		from {
			opacity: 0;
		}
	}

	@keyframes visualization-rise {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.992);
		}
	}

	.site-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 58px;
		padding: 0 34px;
		border-top: 1px solid var(--line-strong);
		background: rgba(255, 255, 255, 0.74);
		color: var(--faint);
		font-size: 9px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.site-footer > div {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--ink);
	}

	.brand-mark.small {
		grid-template-columns: repeat(3, 3px);
		gap: 1px;
		width: 11px;
		height: 12px;
	}

	.brand-mark.small i {
		width: 3px;
	}

	.brand-mark.small i:nth-child(1) {
		height: 6px;
	}

	.brand-mark.small i:nth-child(2) {
		height: 11px;
	}

	.brand-mark.small i:nth-child(3) {
		height: 8px;
	}

	.error-toast {
		position: fixed;
		right: 24px;
		bottom: 22px;
		z-index: 50;
		display: grid;
		grid-template-columns: 27px minmax(220px, 1fr) auto;
		gap: 10px;
		align-items: center;
		max-width: 500px;
		padding: 11px 12px;
		border: 1px solid #edc8bd;
		border-radius: 9px;
		background: #fffaf8;
		box-shadow: 0 12px 36px rgba(63, 31, 23, 0.16);
	}

	.error-toast > span {
		display: grid;
		width: 27px;
		height: 27px;
		place-items: center;
		border-radius: 50%;
		background: var(--coral-soft);
		color: var(--coral);
		font-weight: 800;
	}

	.error-toast > div {
		display: grid;
		gap: 2px;
	}

	.error-toast strong {
		font-size: 10px;
	}

	.error-toast p {
		margin: 0;
		color: #7b635e;
		font-size: 9px;
	}

	.error-toast button {
		border: 0;
		background: transparent;
		color: #9c8c88;
		cursor: pointer;
		font-size: 18px;
	}

	@media (max-width: 1370px) {
		main {
			width: calc(100% - 42px);
		}

		.brief-header {
			grid-template-columns: 0.9fr 1.1fr;
			gap: 30px;
		}

		.review-grid {
			grid-template-columns: minmax(0, 1fr) 330px;
		}

		.operations-grid {
			grid-template-columns: minmax(0, 1fr) 395px;
		}

		.view-switcher button {
			padding: 0 10px;
		}
	}
</style>

<script lang="ts">
	import type { PageData } from './$types';

	type SeriesKey = 'macro' | 'coverage' | 'worst';
	type MetricMode = SeriesKey | 'compare';
	type ApproachId = 'A' | 'B' | 'C' | 'D';

	type Experiment = {
		number: number;
		optimization: string;
		macroNRMSE: number;
		toleranceCoverage: number;
		worstTargetNRMSE: number;
		baseline?: boolean;
		kept: boolean;
	};

	type Approach = {
		id: ApproachId;
		title: string;
		experiments: Experiment[];
	};

	type ExperimentTuple = [
		optimization: string,
		macroNRMSE: number,
		toleranceCoverage: number,
		worstTargetNRMSE: number,
		kept: boolean
	];

	type Axis = {
		min: number;
		max: number;
		ticks: number[];
		unit: string;
	};

	type SelectedPoint = {
		experiment: Experiment;
		value: number;
		x: number;
		y: number;
	};

	type ComparePoint = {
		experiment: Experiment;
		value: number;
		x: number;
		y: number;
	};

	type CompareTrace = {
		key: SeriesKey;
		label: string;
		className: string;
		path: string;
		points: ComparePoint[];
	};

	function makeExperiments(rows: ExperimentTuple[]): Experiment[] {
		return rows.map(
			(
				[optimization, macroNRMSE, toleranceCoverage, worstTargetNRMSE, kept],
				index
			) => ({
				number: index + 1,
				optimization,
				macroNRMSE,
				toleranceCoverage,
				worstTargetNRMSE,
				baseline: index === 0,
				kept
			})
		);
	}

	const APPROACHES: Approach[] = [
		{
			id: 'A',
			title: 'Symmetry-first law discovery',
			experiments: makeExperiments([
				['Baseline parity channels', 0.478, 0.618, 0.862, true],
				['Add fifth-order alpha terms', 0.475, 0.621, 0.858, true],
				['Expand Mach interaction basis', 0.477, 0.619, 0.866, false],
				['L1 sparsity sweep', 0.473, 0.624, 0.853, true],
				['Screen pairwise surface terms', 0.476, 0.62, 0.861, false],
				['Separate fin-family equations', 0.472, 0.625, 0.85, true],
				['Stability selection across folds', 0.474, 0.623, 0.857, false],
				['Relax pitching-moment parity', 0.471, 0.627, 0.847, true],
				['Consensus sparse refit', 0.47, 0.629, 0.844, true],
				['Complexity-capped ensemble', 0.471, 0.628, 0.846, false]
			])
		},
		{
			id: 'B',
			title: 'Physics-anchored probabilistic surrogate',
			experiments: makeExperiments([
				['Low-order backbone baseline', 0.472, 0.626, 0.842, true],
				['Even/odd backbone channels', 0.463, 0.641, 0.821, true],
				['Dense residual MLP', 0.468, 0.632, 0.839, false],
				['Sparse inducing points', 0.454, 0.659, 0.798, true],
				['Correlated latent residual', 0.446, 0.681, 0.776, true],
				['512 inducing points', 0.449, 0.678, 0.784, false],
				['Family-conditioned mean', 0.44, 0.696, 0.754, true],
				['Calibrated residual scale', 0.437, 0.742, 0.739, true],
				['Holdout-aware OOD gate', 0.439, 0.817, 0.748, true],
				['Final joint refit', 0.434, 0.824, 0.732, true]
			])
		},
		{
			id: 'C',
			title: 'Symmetry-anchored residual ridge',
			experiments: makeExperiments([
				['Shared ridge baseline', 0.468, 0.621, 0.854, true],
				['Piecewise Mach hats', 0.458, 0.638, 0.821, true],
				['Zero-deflection parity core', 0.452, 0.651, 0.803, true],
				['Collective + contrast modes', 0.443, 0.674, 0.774, true],
				['Full pairwise interactions', 0.447, 0.666, 0.792, false],
				['Output-specific penalties', 0.438, 0.686, 0.753, true],
				['Exact lever-arm closure', 0.432, 0.702, 0.724, true],
				['Grouped configuration folds', 0.43, 0.709, 0.711, true],
				['Huber residual fit', 0.427, 0.718, 0.698, true],
				['All-train deterministic refit', 0.426, 0.721, 0.694, true]
			])
		},
		{
			id: 'D',
			title: 'SAGE-Ridge support-aware confidence',
			experiments: makeExperiments([
				['Pooled spline ridge', 0.476, 0.617, 0.871, true],
				['Shrinkable category effects', 0.468, 0.636, 0.839, true],
				['Cubic spline expansion', 0.472, 0.629, 0.852, false],
				['Deflection mode sharing', 0.462, 0.653, 0.817, true],
				['Huber target heads', 0.458, 0.671, 0.792, true],
				['Leave-one-config ensemble', 0.454, 0.704, 0.773, true],
				['Baseline symmetry projection', 0.456, 0.698, 0.781, false],
				['Group-balanced calibration', 0.452, 0.782, 0.757, true],
				['Support-distance inflation', 0.453, 0.857, 0.762, true],
				['Median ensemble refit', 0.45, 0.861, 0.748, true]
			])
		}
	];

	const METRIC_OPTIONS: Array<{
		key: MetricMode;
		label: string;
		direction: string;
	}> = [
		{ key: 'macro', label: 'Macro NRMSE', direction: 'Lower is better' },
		{
			key: 'coverage',
			label: 'Within tolerance',
			direction: 'Higher is better'
		},
		{
			key: 'worst',
			label: 'Worst-target NRMSE',
			direction: 'Lower is better'
		},
		{
			key: 'compare',
			label: 'Compare metrics',
			direction: 'Baseline normalized'
		}
	];

	const SERIES: Array<{
		key: SeriesKey;
		label: string;
		className: string;
	}> = [
		{ key: 'macro', label: 'Macro NRMSE', className: 'series-macro' },
		{ key: 'coverage', label: 'Within tolerance', className: 'series-coverage' },
		{ key: 'worst', label: 'Worst-target NRMSE', className: 'series-worst' }
	];

	const AXES: Record<MetricMode, Axis> = {
		macro: {
			min: 0.4,
			max: 0.52,
			ticks: [0.4, 0.42, 0.44, 0.46, 0.48, 0.5, 0.52],
			unit: 'NRMSE'
		},
		coverage: {
			min: 0.55,
			max: 0.9,
			ticks: [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9],
			unit: 'SHARE WITHIN TOLERANCE'
		},
		worst: {
			min: 0.65,
			max: 0.95,
			ticks: [0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95],
			unit: 'NRMSE'
		},
		compare: {
			min: -10,
			max: 40,
			ticks: [-10, 0, 10, 20, 30, 40],
			unit: 'IMPROVEMENT FROM BASELINE (%)'
		}
	};

	const LABEL_PLACEMENTS: Array<{
		dx: number;
		dy: number;
		rotation: number;
		anchor: 'start' | 'end';
	}> = [
		{ dx: 8, dy: -18, rotation: -27, anchor: 'start' },
		{ dx: 7, dy: 25, rotation: 26, anchor: 'start' },
		{ dx: 7, dy: -18, rotation: -27, anchor: 'start' },
		{ dx: 7, dy: 24, rotation: 26, anchor: 'start' },
		{ dx: 7, dy: -18, rotation: -27, anchor: 'start' },
		{ dx: 7, dy: 25, rotation: 26, anchor: 'start' },
		{ dx: 7, dy: -18, rotation: -27, anchor: 'start' },
		{ dx: 7, dy: 24, rotation: 26, anchor: 'start' },
		{ dx: 7, dy: -18, rotation: -27, anchor: 'start' },
		{ dx: -8, dy: 20, rotation: -18, anchor: 'end' }
	];

	const CHART_WIDTH = 1400;
	const CHART_HEIGHT = 500;
	const PLOT_LEFT = 82;
	const PLOT_RIGHT = 35;
	const PLOT_TOP = 54;
	const PLOT_BOTTOM = 391;
	const PLOT_WIDTH = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;
	const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;

	let { data }: { data: PageData } = $props();
	let selectedApproachId = $state<ApproachId>('C');
	let activeMetric = $state<MetricMode>('macro');
	let activeExperimentNumber = $state<number | null>(null);

	const researchState = $derived(data.state);
	const selectedApproach = $derived(
		APPROACHES.find((approach) => approach.id === selectedApproachId) ?? APPROACHES[2]
	);
	const axis = $derived(AXES[activeMetric]);
	const activeOption = $derived(
		METRIC_OPTIONS.find((option) => option.key === activeMetric) ?? METRIC_OPTIONS[0]
	);
	const activeExperiment = $derived(
		selectedApproach.experiments.find(
			(experiment) => experiment.number === activeExperimentNumber
		) ?? null
	);
	const datasetContract = $derived({
		train: positiveOrFallback(researchState.dataset?.rows.train, 4_408),
		validation: positiveOrFallback(researchState.dataset?.rows.validation, 779),
		hidden: positiveOrFallback(researchState.dataset?.rows.hidden, 1_721),
		outputs: researchState.dataset?.targets.length ? researchState.dataset.targets.length : 8
	});

	const approachKpis = $derived.by(() => {
		const experiments = selectedApproach.experiments;
		const bestMacro = experiments.reduce((best, experiment) =>
			experiment.macroNRMSE < best.macroNRMSE ? experiment : best
		);
		const bestWorst = experiments.reduce((best, experiment) =>
			experiment.worstTargetNRMSE < best.worstTargetNRMSE ? experiment : best
		);
		const finalExperiment = experiments[experiments.length - 1];
		return {
			bestMacro,
			bestWorst,
			finalExperiment,
			keptImprovements: experiments.filter(
				(experiment) => experiment.kept && !experiment.baseline
			).length
		};
	});

	const metricReadouts: Record<MetricMode, string> = $derived({
		macro: `${approachKpis.bestMacro.macroNRMSE.toFixed(3)} best`,
		coverage: `${(approachKpis.finalExperiment.toleranceCoverage * 100).toFixed(1)}% final`,
		worst: `${approachKpis.bestWorst.worstTargetNRMSE.toFixed(3)} best`,
		compare: '3 series'
	});

	const selectedPoints: SelectedPoint[] = $derived.by(() =>
		selectedApproach.experiments.map((experiment, index) => {
			const value = rawMetric(experiment, activeMetric === 'compare' ? 'macro' : activeMetric);
			return {
				experiment,
				value,
				x: xFor(index),
				y: yFor(value, axis)
			};
		})
	);

	const rawTracePath = $derived(
		activeMetric === 'compare' ? '' : linePath(selectedPoints.map((point) => [point.x, point.y]))
	);
	const runningBestPath = $derived(
		activeMetric === 'compare'
			? ''
			: stepAfterPath(activeMetric, selectedPoints.map((point) => point.x), axis)
	);

	const compareTraces: CompareTrace[] = $derived.by(() =>
		SERIES.map((series) => {
			const points = selectedApproach.experiments.map((experiment, index) => {
				const value = normalizedImprovement(experiment, series.key);
				return {
					experiment,
					value,
					x: xFor(index),
					y: yFor(value, AXES.compare)
				};
			});
			return {
				...series,
				path: linePath(points.map((point) => [point.x, point.y])),
				points
			};
		})
	);

	const activeSelectedPoint = $derived(
		activeExperiment
			? selectedPoints.find((point) => point.experiment.number === activeExperiment.number) ?? null
			: null
	);

	function positiveOrFallback(value: number | undefined, fallback: number): number {
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
	}

	function rawMetric(experiment: Experiment, key: SeriesKey): number {
		if (key === 'macro') return experiment.macroNRMSE;
		if (key === 'coverage') return experiment.toleranceCoverage;
		return experiment.worstTargetNRMSE;
	}

	function normalizedImprovement(experiment: Experiment, key: SeriesKey): number {
		const baseline = rawMetric(selectedApproach.experiments[0], key);
		const current = rawMetric(experiment, key);
		return key === 'coverage'
			? ((current - baseline) / baseline) * 100
			: ((baseline - current) / baseline) * 100;
	}

	function xFor(index: number): number {
		return PLOT_LEFT + (index / (selectedApproach.experiments.length - 1)) * PLOT_WIDTH;
	}

	function yFor(value: number, targetAxis: Axis): number {
		return (
			PLOT_BOTTOM -
			((value - targetAxis.min) / (targetAxis.max - targetAxis.min)) * PLOT_HEIGHT
		);
	}

	function linePath(points: Array<[number, number]>): string {
		return points
			.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
			.join(' ');
	}

	function stepAfterPath(key: SeriesKey, xs: number[], targetAxis: Axis): string {
		const lowerIsBetter = key !== 'coverage';
		let runningBest = lowerIsBetter ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
		return selectedApproach.experiments.map((experiment, index) => {
			const value = rawMetric(experiment, key);
			runningBest = lowerIsBetter
				? Math.min(runningBest, value)
				: Math.max(runningBest, value);
			const y = yFor(runningBest, targetAxis);
			return index === 0
				? `M ${xs[index].toFixed(2)} ${y.toFixed(2)}`
				: `H ${xs[index].toFixed(2)} V ${y.toFixed(2)}`;
		}).join(' ');
	}

	function formatRaw(experiment: Experiment, key: SeriesKey): string {
		const value = rawMetric(experiment, key);
		return key === 'coverage' ? `${(value * 100).toFixed(1)}%` : value.toFixed(3);
	}

	function formatAxisTick(value: number): string {
		if (activeMetric === 'compare') return `${value > 0 ? '+' : ''}${value}%`;
		if (activeMetric === 'coverage') return `${Math.round(value * 100)}%`;
		return value.toFixed(2);
	}

	function formatNumber(value: number): string {
		return new Intl.NumberFormat('en-US').format(value);
	}

	function tooltipX(experiment: Experiment): number {
		const x = xFor(experiment.number - 1);
		return x > CHART_WIDTH - 330 ? x - 320 : x + 18;
	}

	function tooltipY(): number {
		if (activeMetric === 'compare') return 16;
		const y = activeSelectedPoint?.y ?? PLOT_TOP;
		return Math.max(12, Math.min(PLOT_BOTTOM - 126, y - 118));
	}

	function decisionLabel(experiment: Experiment): string {
		return experiment.kept ? 'Kept' : 'Discarded';
	}

	function keptImprovementCount(approach: Approach): number {
		return approach.experiments.filter(
			(experiment) => experiment.kept && !experiment.baseline
		).length;
	}
</script>

<svelte:head>
	<title>Autoresearch progress — Vibe Lab</title>
	<meta
		name="description"
		content="A ten-experiment autoresearch trace for the RETALT1 coefficient-search demo."
	/>
</svelte:head>

<div class="results-app">
	<header class="topbar">
		<a class="brand" href="/" aria-label="Vibe Lab control room">
			<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
			<span>VIBE LAB</span>
		</a>

		<nav aria-label="Primary navigation">
			<a href="/">Control room</a>
			<a class="active" href="/results" aria-current="page">Results</a>
		</nav>

		<div class="run-context">
			<span class="demo-chip">Demo run</span>
			<div>
				<span>RETALT1</span>
				<strong>coefficient search / 10 experiments</strong>
			</div>
		</div>
	</header>

	<main>
		<section class="page-intro" aria-labelledby="page-title">
			<div>
				<div class="eyebrow"><span>RESULTS TRACE</span><i></i><span>ARCHITECTURE ITERATION</span></div>
				<h1 id="page-title">Autoresearch progress</h1>
				<p>
					{selectedApproach.experiments.length} experiments <span aria-hidden="true">·</span>
					{approachKpis.keptImprovements} kept improvements
				</p>
			</div>
			<div class="intro-note">
				<span>Selected approach · {selectedApproach.id}</span>
				<strong>{selectedApproach.title}</strong>
				<small>Every attempt remains visible in the trace.</small>
			</div>
		</section>

		<section class="kpi-strip" aria-label="Demo run key results">
			<div>
				<span>Best macro NRMSE</span>
				<strong>{approachKpis.bestMacro.macroNRMSE.toFixed(3)}</strong>
				<small>experiment {approachKpis.bestMacro.number.toString().padStart(2, '0')}</small>
			</div>
			<div>
				<span>Final within tolerance</span>
				<strong>{(approachKpis.finalExperiment.toleranceCoverage * 100).toFixed(1)}%</strong>
				<small>experiment 10</small>
			</div>
			<div>
				<span>Best worst-target</span>
				<strong>{approachKpis.bestWorst.worstTargetNRMSE.toFixed(3)}</strong>
				<small>experiment {approachKpis.bestWorst.number.toString().padStart(2, '0')}</small>
			</div>
			<div class="decision-kpi">
				<span>Search yield</span>
				<strong>
					{approachKpis.keptImprovements}
					<em>/ {selectedApproach.experiments.length}</em>
				</strong>
				<small>kept improvements / experiments</small>
			</div>
		</section>

		<section class="dataset-contract" aria-label="Dataset contract">
			<span>Dataset contract</span>
			<p><strong>{formatNumber(datasetContract.train)}</strong> train</p>
			<i></i>
			<p><strong>{formatNumber(datasetContract.validation)}</strong> visible validation</p>
			<i></i>
			<p><strong>{formatNumber(datasetContract.hidden)}</strong> sealed</p>
			<i></i>
			<p><strong>{datasetContract.outputs}</strong> outputs</p>
		</section>

		<section class="approach-selector" aria-labelledby="approach-selector-title">
			<div class="approach-selector-label">
				<span id="approach-selector-title">Approach</span>
				<small>Select a research direction</small>
			</div>
			<div class="approach-buttons" role="group" aria-label="Research approach">
				{#each APPROACHES as approach}
					<button
						type="button"
						class:active={selectedApproachId === approach.id}
						aria-pressed={selectedApproachId === approach.id}
						onclick={() => {
							selectedApproachId = approach.id;
							activeExperimentNumber = null;
						}}
					>
						<b>{approach.id}</b>
						<span>
							<strong>{approach.title}</strong>
							<small>{keptImprovementCount(approach)} kept improvements</small>
						</span>
					</button>
				{/each}
			</div>
		</section>

		<section class="chart-card" aria-labelledby="trace-title">
			<header class="chart-header">
				<div>
					<span class="section-kicker">Approach {selectedApproach.id} · experiment trace</span>
					<h2 id="trace-title">{selectedApproach.title}</h2>
					<p>
						{activeMetric === 'compare'
							? 'Direction-aware change from experiment 01. Positive values indicate improvement for every series.'
							: `${activeOption.label} · ${activeOption.direction}. The step line records the running best.`}
					</p>
				</div>
				<span class="metric-readout">{metricReadouts[activeMetric]}</span>
			</header>

			<div class="metric-switcher" role="group" aria-label="Chart metric">
				{#each METRIC_OPTIONS as option}
					<button
						type="button"
						class:active={activeMetric === option.key}
						aria-pressed={activeMetric === option.key}
						onclick={() => {
							activeMetric = option.key;
							activeExperimentNumber = null;
						}}
					>
						<span class="selector-dot" aria-hidden="true"><i></i></span>
						<span>
							<strong>{option.label}</strong>
							<small>{option.direction}</small>
						</span>
						<em>{metricReadouts[option.key]}</em>
					</button>
				{/each}
			</div>

			<div class="plot-shell">
				<svg
					class="progress-chart"
					viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
					role="img"
					aria-labelledby="chart-title chart-description"
				>
					<title id="chart-title">
						{activeMetric === 'compare'
							? `${selectedApproach.title}: baseline-normalized comparison of three metrics`
							: `${selectedApproach.title}: ${activeOption.label} by experiment number`}
					</title>
					<desc id="chart-description">
						Ten experiments are shown in sequence. Kept experiments use teal marks and discarded attempts
						use gray marks. Hover or focus an experiment to inspect all three raw values.
					</desc>

					<text class="axis-unit" x={PLOT_LEFT} y="24">{axis.unit}</text>

					{#each axis.ticks as tick}
						{@const y = yFor(tick, axis)}
						<line
							class:baseline-grid={activeMetric === 'compare' && tick === 0}
							class="grid-line"
							x1={PLOT_LEFT}
							x2={CHART_WIDTH - PLOT_RIGHT}
							y1={y}
							y2={y}
						/>
						<text class="y-tick" x={PLOT_LEFT - 15} y={y + 4} text-anchor="end">
							{formatAxisTick(tick)}
						</text>
					{/each}

					<line
						class="axis-line"
						x1={PLOT_LEFT}
						x2={CHART_WIDTH - PLOT_RIGHT}
						y1={PLOT_BOTTOM}
						y2={PLOT_BOTTOM}
					/>

					{#if activeMetric !== 'compare'}
						<path class="attempt-trace" d={rawTracePath} />
						<path class="best-line-halo" d={runningBestPath} />
						<path class="best-line" d={runningBestPath} />

						{#each selectedPoints as point, index}
							{#if point.experiment.baseline}
								<circle class="baseline-ring" cx={point.x} cy={point.y} r="10" />
							{/if}
							<circle
								class:kept={point.experiment.kept}
								class:discarded={!point.experiment.kept}
								class="experiment-point"
								cx={point.x}
								cy={point.y}
								r={point.experiment.kept ? 5.5 : 5}
							/>
							<text
								class:discarded-label={!point.experiment.kept}
								class="optimization-label"
								x="0"
								y="0"
								text-anchor={LABEL_PLACEMENTS[index].anchor}
								transform={`translate(${point.x + LABEL_PLACEMENTS[index].dx} ${point.y + LABEL_PLACEMENTS[index].dy}) rotate(${LABEL_PLACEMENTS[index].rotation})`}
							>
								{point.experiment.optimization}
							</text>
						{/each}
					{:else}
						{#each compareTraces as trace}
							<path class={`compare-line ${trace.className}`} d={trace.path} />
							{#each trace.points as point}
								<circle
									class:discarded-series={!point.experiment.kept}
									class={`compare-point ${trace.className}`}
									cx={point.x}
									cy={point.y}
									r={point.experiment.kept ? 4 : 3.5}
								/>
							{/each}
						{/each}

						{#each selectedApproach.experiments as experiment, index}
							<text
								class:discarded-label={!experiment.kept}
								class="compare-optimization-label"
								x={xFor(index)}
								y={PLOT_BOTTOM - (index % 2 === 0 ? 13 : 28)}
								text-anchor="middle"
							>
								{experiment.number.toString().padStart(2, '0')} · {experiment.optimization}
							</text>
						{/each}
					{/if}

					{#each selectedApproach.experiments as experiment, index}
						{@const x = xFor(index)}
						<line class="x-tick-line" x1={x} x2={x} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM + 7} />
						<text class="x-tick" x={x} y={PLOT_BOTTOM + 27} text-anchor="middle">
							{experiment.number}
						</text>
						<a
							href={`#experiment-row-${experiment.number}`}
							aria-label={`Approach ${selectedApproach.id}, experiment ${experiment.number}, ${experiment.optimization}. ${decisionLabel(experiment)}. Macro NRMSE ${experiment.macroNRMSE.toFixed(3)}, within tolerance ${(experiment.toleranceCoverage * 100).toFixed(1)}%, worst-target NRMSE ${experiment.worstTargetNRMSE.toFixed(3)}.`}
							onmouseenter={() => (activeExperimentNumber = experiment.number)}
							onmouseleave={() => (activeExperimentNumber = null)}
							onfocus={() => (activeExperimentNumber = experiment.number)}
							onblur={() => (activeExperimentNumber = null)}
						>
							<rect
								class="experiment-hit-area"
								x={x - PLOT_WIDTH / 24}
								y={PLOT_TOP}
								width={PLOT_WIDTH / 12}
								height={PLOT_HEIGHT}
							/>
						</a>
					{/each}

					<text class="x-axis-label" x={PLOT_LEFT + PLOT_WIDTH / 2} y={PLOT_BOTTOM + 61} text-anchor="middle">
						EXPERIMENT #
					</text>

					{#if activeExperiment}
						<g
							class="chart-tooltip"
							transform={`translate(${tooltipX(activeExperiment)} ${tooltipY()})`}
							pointer-events="none"
						>
							<rect width="304" height="110" rx="7" />
							<text class="tooltip-kicker" x="14" y="20">
								APPROACH {selectedApproach.id} · EXP {activeExperiment.number.toString().padStart(2, '0')}
							</text>
							<text class="tooltip-name" x="14" y="43">{activeExperiment.optimization}</text>
							<line x1="14" x2="290" y1="54" y2="54" />
							<text class="tooltip-label" x="14" y="72">MACRO</text>
							<text class="tooltip-value" x="14" y="91">{formatRaw(activeExperiment, 'macro')}</text>
							<text class="tooltip-label" x="105" y="72">WITHIN TOL.</text>
							<text class="tooltip-value" x="105" y="91">{formatRaw(activeExperiment, 'coverage')}</text>
							<text class="tooltip-label" x="209" y="72">WORST</text>
							<text class="tooltip-value" x="209" y="91">{formatRaw(activeExperiment, 'worst')}</text>
							<text
								class:discarded-decision={!activeExperiment.kept}
								class="tooltip-decision"
								x="290"
								y="20"
								text-anchor="end"
							>
								{decisionLabel(activeExperiment).toUpperCase()}
							</text>
						</g>
					{/if}
				</svg>
			</div>

			<footer class="chart-footer" aria-label="Chart legend">
				{#if activeMetric === 'compare'}
					<div class="legend">
						{#each SERIES as series}
							<span><i class={`legend-series ${series.className}`}></i>{series.label}</span>
						{/each}
					</div>
					<p>Coverage is normalized upward; both NRMSE metrics are normalized downward.</p>
				{:else}
					<div class="legend">
						<span><i class="legend-kept"></i>Kept experiment</span>
						<span><i class="legend-discarded"></i>Discarded attempt</span>
						<span><i class="legend-best"></i>Running best</span>
					</div>
					<p>Attempt trace shows every regression; the step line moves only when the selected metric improves.</p>
				{/if}
			</footer>
		</section>

		<section class="ledger-card" aria-labelledby="ledger-title">
			<header>
				<div>
					<span class="section-kicker">Approach {selectedApproach.id} · raw experiment values</span>
					<h2 id="ledger-title">Experiment ledger</h2>
				</div>
				<span>{selectedApproach.title}</span>
			</header>

			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th class="number-column">#</th>
							<th class="approach-column">Approach</th>
							<th>Optimization</th>
							<th class="decision-column">Decision</th>
							<th class="numeric">Macro NRMSE</th>
							<th class="numeric">Within tolerance</th>
							<th class="numeric">Worst-target NRMSE</th>
						</tr>
					</thead>
					<tbody>
						{#each selectedApproach.experiments as experiment}
							<tr
								id={`experiment-row-${experiment.number}`}
								class:discarded-row={!experiment.kept}
							>
								<td class="experiment-number">{experiment.number.toString().padStart(2, '0')}</td>
								<td>
									<span class={`approach-badge approach-${selectedApproach.id.toLowerCase()}`}>
										{selectedApproach.id}
									</span>
								</td>
								<td>
									<span class="optimization-cell">
										<strong>{experiment.optimization}</strong>
										{#if experiment.baseline}<small>baseline</small>{/if}
									</span>
								</td>
								<td>
									<span class:discarded={!experiment.kept} class="decision-badge">
										<i></i>{decisionLabel(experiment)}
									</span>
								</td>
								<td class="numeric metric-cell">{experiment.macroNRMSE.toFixed(3)}</td>
								<td class="numeric metric-cell">{(experiment.toleranceCoverage * 100).toFixed(1)}%</td>
								<td class="numeric metric-cell">{experiment.worstTargetNRMSE.toFixed(3)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</main>
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
		color: #10213b;
		font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;
		font-size: 14px;
		-webkit-font-smoothing: antialiased;
	}

	:global(button) {
		font: inherit;
	}

	:global(button:focus-visible),
	:global(a:focus-visible) {
		outline: 2px solid #2458df;
		outline-offset: 3px;
	}

	.results-app {
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
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		height: 68px;
		padding: 0 34px;
		border-bottom: 1px solid rgba(203, 210, 220, 0.92);
		background: rgba(255, 255, 255, 0.95);
		box-shadow: 0 1px 0 rgba(16, 33, 59, 0.025);
		backdrop-filter: blur(18px);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		width: max-content;
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

	.topbar nav {
		display: flex;
		align-self: stretch;
		gap: 4px;
	}

	.topbar nav a {
		position: relative;
		display: flex;
		align-items: center;
		padding: 0 17px;
		color: #697488;
		font-size: 12px;
		font-weight: 650;
		text-decoration: none;
	}

	.topbar nav a::after {
		position: absolute;
		right: 17px;
		bottom: -1px;
		left: 17px;
		height: 2px;
		background: transparent;
		content: '';
	}

	.topbar nav a:hover,
	.topbar nav a.active {
		color: var(--ink);
	}

	.topbar nav a.active::after {
		background: var(--cobalt);
	}

	.run-context {
		display: flex;
		align-items: center;
		justify-self: end;
		gap: 11px;
	}

	.demo-chip {
		padding: 5px 7px;
		border: 1px solid #b9d8d5;
		background: var(--teal-soft);
		color: var(--teal);
		font-size: 8px;
		font-weight: 780;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.run-context div {
		display: grid;
		gap: 2px;
		text-align: right;
	}

	.run-context div span {
		color: var(--faint);
		font-size: 8px;
		font-weight: 760;
		letter-spacing: 0.1em;
	}

	.run-context strong {
		color: #4c596e;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 9px;
		font-weight: 560;
	}

	main {
		width: min(1540px, calc(100% - 64px));
		margin: 0 auto;
		padding: 39px 0 44px;
	}

	.page-intro {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 60px;
		align-items: end;
		margin-bottom: 25px;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 11px;
		margin-bottom: 11px;
		color: var(--cobalt);
		font-size: 9px;
		font-weight: 790;
		letter-spacing: 0.13em;
	}

	.eyebrow i {
		width: 27px;
		height: 1px;
		background: #9db3ee;
	}

	.page-intro h1 {
		margin: 0;
		color: var(--ink);
		font-size: clamp(38px, 3.4vw, 56px);
		font-weight: 710;
		letter-spacing: -0.045em;
		line-height: 0.98;
	}

	.page-intro > div:first-child > p {
		display: flex;
		gap: 10px;
		margin: 15px 0 0;
		color: var(--muted);
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}

	.page-intro > div:first-child > p span {
		color: #b1b8c2;
	}

	.intro-note {
		display: grid;
		min-width: 450px;
		padding: 13px 16px;
		border-left: 3px solid var(--cobalt);
		background: rgba(255, 255, 255, 0.68);
	}

	.intro-note span {
		color: var(--cobalt);
		font-size: 8px;
		font-weight: 800;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.intro-note strong {
		margin-top: 4px;
		color: var(--ink);
		font-size: 12px;
		font-weight: 690;
	}

	.intro-note small {
		margin-top: 3px;
		color: var(--faint);
		font-size: 9px;
	}

	.kpi-strip {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border: 1px solid var(--line-strong);
		background: rgba(255, 255, 255, 0.86);
		box-shadow: 0 8px 30px rgba(23, 38, 61, 0.035);
	}

	.kpi-strip > div {
		display: grid;
		align-content: center;
		min-height: 91px;
		padding: 14px 20px;
		border-right: 1px solid var(--line);
	}

	.kpi-strip > div:last-child {
		border-right: 0;
	}

	.kpi-strip span {
		color: var(--faint);
		font-size: 8px;
		font-weight: 780;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.kpi-strip strong {
		margin-top: 4px;
		color: var(--ink);
		font-size: 25px;
		font-weight: 720;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.035em;
	}

	.kpi-strip small {
		margin-top: 3px;
		color: var(--faint);
		font-size: 9px;
	}

	.kpi-strip .decision-kpi {
		background: var(--paper-warm);
	}

	.decision-kpi strong {
		color: var(--teal);
	}

	.decision-kpi em {
		color: #8190a3;
		font-size: 15px;
		font-style: normal;
		font-weight: 630;
	}

	.dataset-contract {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 13px;
		min-height: 39px;
		margin-bottom: 17px;
		padding: 0 14px;
		border: 1px solid var(--line-strong);
		border-top: 0;
		background: var(--paper-warm);
	}

	.dataset-contract > span {
		margin-right: auto;
		color: var(--cobalt);
		font-size: 8px;
		font-weight: 790;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.dataset-contract p {
		margin: 0;
		color: var(--faint);
		font-size: 9px;
	}

	.dataset-contract strong {
		color: #4f5d72;
		font-weight: 720;
		font-variant-numeric: tabular-nums;
	}

	.dataset-contract i {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: #c0c7d1;
	}

	.approach-selector {
		display: grid;
		grid-template-columns: 170px minmax(0, 1fr);
		margin-bottom: 17px;
		border: 1px solid var(--line-strong);
		background: #fff;
		box-shadow: 0 8px 26px rgba(24, 40, 64, 0.04);
	}

	.approach-selector-label {
		display: grid;
		align-content: center;
		gap: 4px;
		padding: 14px 18px;
		border-right: 1px solid var(--line);
		background: var(--paper-warm);
	}

	.approach-selector-label span {
		color: var(--cobalt);
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.approach-selector-label small {
		color: var(--faint);
		font-size: 8px;
	}

	.approach-buttons {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
	}

	.approach-buttons button {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		min-height: 78px;
		padding: 12px 14px;
		border: 0;
		border-right: 1px solid var(--line);
		background: #fff;
		color: var(--ink);
		cursor: pointer;
		text-align: left;
		transition:
			background 140ms ease,
			box-shadow 140ms ease;
	}

	.approach-buttons button:last-child {
		border-right: 0;
	}

	.approach-buttons button::after {
		position: absolute;
		right: 0;
		bottom: -1px;
		left: 0;
		height: 2px;
		background: transparent;
		content: '';
	}

	.approach-buttons button:hover {
		background: #fafbfc;
	}

	.approach-buttons button.active {
		background: var(--cobalt-soft);
		box-shadow: inset 0 0 0 1px rgba(36, 88, 223, 0.05);
	}

	.approach-buttons button.active::after {
		background: var(--cobalt);
	}

	.approach-buttons b {
		display: grid;
		width: 29px;
		height: 29px;
		place-items: center;
		border: 1px solid #c9d0da;
		background: #f5f6f8;
		color: #657186;
		font-size: 10px;
	}

	.approach-buttons button.active b {
		border-color: #a9bdf2;
		background: #fff;
		color: var(--cobalt);
	}

	.approach-buttons button > span {
		display: grid;
		gap: 4px;
		min-width: 0;
	}

	.approach-buttons strong {
		overflow: hidden;
		font-size: 10px;
		font-weight: 680;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.approach-buttons small {
		color: var(--faint);
		font-size: 8px;
	}

	.chart-card,
	.ledger-card {
		overflow: hidden;
		border: 1px solid var(--line-strong);
		background: var(--paper);
		box-shadow: 0 12px 34px rgba(24, 40, 64, 0.052);
	}

	.chart-card {
		margin-bottom: 18px;
	}

	.chart-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 40px;
		min-height: 91px;
		padding: 19px 23px 17px;
		border-bottom: 1px solid var(--line);
		background: var(--paper-warm);
	}

	.section-kicker {
		display: block;
		margin-bottom: 6px;
		color: var(--cobalt);
		font-size: 8px;
		font-weight: 800;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.chart-header h2,
	.ledger-card h2 {
		margin: 0;
		color: var(--ink);
		font-size: 21px;
		font-weight: 690;
		letter-spacing: -0.025em;
	}

	.chart-header p {
		margin: 5px 0 0;
		color: var(--muted);
		font-size: 10px;
		line-height: 1.45;
	}

	.metric-readout {
		padding: 8px 10px;
		border: 1px solid #b8d8d5;
		background: var(--teal-soft);
		color: var(--teal);
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 10px;
		font-weight: 700;
		white-space: nowrap;
	}

	.metric-switcher {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border-bottom: 1px solid var(--line);
	}

	.metric-switcher button {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 10px;
		align-items: center;
		min-height: 70px;
		padding: 11px 15px;
		border: 0;
		border-right: 1px solid var(--line);
		background: #fff;
		color: var(--ink);
		cursor: pointer;
		text-align: left;
		transition:
			background 140ms ease,
			box-shadow 140ms ease;
	}

	.metric-switcher button:last-child {
		border-right: 0;
	}

	.metric-switcher button::after {
		position: absolute;
		right: 0;
		bottom: -1px;
		left: 0;
		height: 2px;
		background: transparent;
		content: '';
	}

	.metric-switcher button:hover {
		background: #fafbfc;
	}

	.metric-switcher button.active {
		background: var(--cobalt-soft);
		box-shadow: inset 0 0 0 1px rgba(36, 88, 223, 0.035);
	}

	.metric-switcher button.active::after {
		background: var(--cobalt);
	}

	.selector-dot {
		display: grid;
		width: 17px;
		height: 17px;
		place-items: center;
		border: 1px solid #b8c0cc;
		border-radius: 50%;
		background: #fff;
	}

	.selector-dot i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: transparent;
	}

	.metric-switcher button.active .selector-dot {
		border-color: var(--cobalt);
	}

	.metric-switcher button.active .selector-dot i {
		background: var(--cobalt);
	}

	.metric-switcher button > span:nth-child(2) {
		display: grid;
		gap: 3px;
	}

	.metric-switcher strong {
		font-size: 11px;
		font-weight: 690;
	}

	.metric-switcher small {
		color: var(--faint);
		font-size: 8px;
	}

	.metric-switcher em {
		color: #748095;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 8px;
		font-style: normal;
		font-weight: 650;
		white-space: nowrap;
	}

	.plot-shell {
		padding: 7px 20px 0;
		background: #fff;
	}

	.progress-chart {
		display: block;
		width: 100%;
		height: auto;
		min-height: 500px;
		overflow: visible;
	}

	.progress-chart text {
		font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;
	}

	.axis-unit {
		fill: #788496;
		font-size: 8px;
		font-weight: 800;
		letter-spacing: 0.13em;
	}

	.grid-line {
		stroke: #e4e8ed;
		stroke-dasharray: 2 5;
		stroke-width: 1;
	}

	.grid-line.baseline-grid {
		stroke: #aeb8c5;
		stroke-dasharray: none;
	}

	.axis-line,
	.x-tick-line {
		stroke: #aeb7c4;
		stroke-width: 1;
	}

	.y-tick {
		fill: #8792a3;
		font-size: 9px;
		font-variant-numeric: tabular-nums;
	}

	.x-tick {
		fill: var(--ink);
		font-size: 10px;
		font-weight: 750;
		font-variant-numeric: tabular-nums;
	}

	.x-axis-label {
		fill: #8792a3;
		font-size: 8px;
		font-weight: 790;
		letter-spacing: 0.12em;
	}

	.attempt-trace {
		fill: none;
		stroke: #aeb7c4;
		stroke-width: 1.25;
	}

	.best-line-halo {
		fill: none;
		stroke: #fff;
		stroke-linecap: square;
		stroke-linejoin: miter;
		stroke-width: 6;
	}

	.best-line {
		fill: none;
		stroke: var(--cobalt);
		stroke-linecap: square;
		stroke-linejoin: miter;
		stroke-width: 2.25;
	}

	.experiment-point {
		stroke: #fff;
		stroke-width: 2;
	}

	.experiment-point.kept {
		fill: var(--teal);
	}

	.experiment-point.discarded {
		fill: #b9c0c9;
		stroke: #fff;
	}

	.baseline-ring {
		fill: none;
		stroke: var(--cobalt);
		stroke-width: 1.5;
	}

	.optimization-label {
		fill: #344258;
		font-size: 8px;
		font-weight: 620;
		paint-order: stroke;
		stroke: #fff;
		stroke-linejoin: round;
		stroke-width: 3px;
	}

	.optimization-label.discarded-label,
	.compare-optimization-label.discarded-label {
		fill: #a1a9b4;
		font-weight: 520;
	}

	.compare-line {
		fill: none;
		stroke-width: 1.75;
	}

	.compare-line.series-macro {
		stroke: var(--cobalt);
	}

	.compare-line.series-coverage {
		stroke: var(--teal);
		stroke-dasharray: 7 4;
	}

	.compare-line.series-worst {
		stroke: var(--coral);
		stroke-dasharray: 2 4;
	}

	.compare-point {
		stroke: #fff;
		stroke-width: 1.5;
	}

	.compare-point.series-macro {
		fill: var(--cobalt);
	}

	.compare-point.series-coverage {
		fill: var(--teal);
	}

	.compare-point.series-worst {
		fill: var(--coral);
	}

	.compare-point.discarded-series {
		fill: #fff;
		stroke: #aab2bd;
		stroke-width: 1.5;
	}

	.compare-optimization-label {
		fill: #687488;
		font-size: 6.5px;
		font-weight: 610;
		paint-order: stroke;
		stroke: #fff;
		stroke-width: 2.5px;
	}

	.experiment-hit-area {
		fill: transparent;
		stroke: none;
	}

	.chart-tooltip rect {
		fill: var(--ink);
		stroke: rgba(255, 255, 255, 0.18);
		stroke-width: 1;
		filter: drop-shadow(0 5px 8px rgba(16, 33, 59, 0.18));
	}

	.chart-tooltip line {
		stroke: #3c4d67;
		stroke-width: 1;
	}

	.tooltip-kicker {
		fill: #aebbd0;
		font-size: 7px;
		font-weight: 760;
		letter-spacing: 0.08em;
	}

	.tooltip-name {
		fill: #fff;
		font-size: 11px;
		font-weight: 680;
	}

	.tooltip-label {
		fill: #95a4ba;
		font-size: 6px;
		font-weight: 760;
		letter-spacing: 0.08em;
	}

	.tooltip-value {
		fill: #fff;
		font-size: 12px;
		font-weight: 720;
		font-variant-numeric: tabular-nums;
	}

	.tooltip-decision {
		fill: #80d0cc;
		font-size: 7px;
		font-weight: 800;
		letter-spacing: 0.08em;
	}

	.tooltip-decision.discarded-decision {
		fill: #c1c8d2;
	}

	.chart-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 28px;
		min-height: 57px;
		padding: 11px 23px;
		border-top: 1px solid var(--line);
		background: var(--paper-warm);
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 19px;
	}

	.legend span {
		display: flex;
		align-items: center;
		gap: 7px;
		color: #677386;
		font-size: 9px;
		white-space: nowrap;
	}

	.legend i {
		display: inline-block;
		flex: 0 0 auto;
	}

	.legend-kept,
	.legend-discarded {
		width: 9px;
		height: 9px;
		border: 1.5px solid #fff;
		border-radius: 50%;
		box-shadow: 0 0 0 1px var(--teal);
	}

	.legend-kept {
		background: var(--teal);
	}

	.legend-discarded {
		background: #b9c0c9;
		box-shadow: 0 0 0 1px #aeb6c1;
	}

	.legend-best {
		width: 22px;
		height: 0;
		border-top: 2px solid var(--cobalt);
	}

	.legend-series {
		width: 23px;
		height: 0;
		border-top: 2px solid;
	}

	.legend-series.series-macro {
		border-color: var(--cobalt);
	}

	.legend-series.series-coverage {
		border-color: var(--teal);
		border-top-style: dashed;
	}

	.legend-series.series-worst {
		border-color: var(--coral);
		border-top-style: dotted;
	}

	.chart-footer p {
		max-width: 590px;
		margin: 0;
		color: var(--faint);
		font-size: 8px;
		line-height: 1.4;
		text-align: right;
	}

	.ledger-card > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 76px;
		padding: 15px 20px;
		border-bottom: 1px solid var(--line);
		background: var(--paper-warm);
	}

	.ledger-card > header > span {
		padding: 6px 8px;
		border: 1px solid var(--line);
		background: #fff;
		color: var(--faint);
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}

	th,
	td {
		padding: 10px 13px;
		border-right: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: middle;
	}

	th:last-child,
	td:last-child {
		border-right: 0;
	}

	tbody tr:last-child td {
		border-bottom: 0;
	}

	th {
		background: #f4f6f8;
		color: #7b8595;
		font-size: 8px;
		font-weight: 790;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.number-column {
		width: 58px;
	}

	.approach-column {
		width: 76px;
	}

	.decision-column {
		width: 115px;
	}

	th:nth-child(5),
	th:nth-child(6),
	th:nth-child(7) {
		width: 150px;
	}

	td {
		color: #4f5c70;
		font-size: 10px;
	}

	tbody tr {
		transition: background 140ms ease;
	}

	tbody tr:hover,
	tbody tr:target {
		background: #f8faff;
	}

	tbody tr.discarded-row {
		background: #fafafa;
	}

	tbody tr.discarded-row:hover,
	tbody tr.discarded-row:target {
		background: #f5f6f8;
	}

	.experiment-number {
		color: #7d8898;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 9px;
		font-weight: 690;
	}

	.approach-badge {
		display: grid;
		width: 25px;
		height: 25px;
		place-items: center;
		background: var(--cobalt-soft);
		color: var(--cobalt);
		font-size: 9px;
		font-weight: 780;
	}

	.approach-badge.approach-b {
		background: #f1f3f6;
		color: #697588;
	}

	.approach-badge.approach-c {
		background: var(--teal-soft);
		color: var(--teal);
	}

	.approach-badge.approach-d {
		background: var(--coral-soft);
		color: var(--coral);
	}

	.optimization-cell {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.optimization-cell strong {
		overflow: hidden;
		color: var(--ink);
		font-size: 10px;
		font-weight: 660;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.discarded-row .optimization-cell strong {
		color: #778294;
	}

	.optimization-cell small {
		padding: 3px 5px;
		border: 1px solid #bfd0f5;
		background: var(--cobalt-soft);
		color: var(--cobalt);
		font-size: 7px;
		font-weight: 760;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.decision-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: max-content;
		padding: 4px 7px;
		border: 1px solid #b8d8d5;
		background: var(--teal-soft);
		color: var(--teal);
		font-size: 8px;
		font-weight: 700;
	}

	.decision-badge i {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--teal);
	}

	.decision-badge.discarded {
		border-color: #d4d9e0;
		background: #f0f2f4;
		color: #7b8594;
	}

	.decision-badge.discarded i {
		background: #9aa3af;
	}

	.numeric {
		text-align: right;
	}

	.metric-cell {
		color: var(--ink);
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
		font-size: 9px;
		font-variant-numeric: tabular-nums;
		font-weight: 650;
	}

	.discarded-row .metric-cell {
		color: #7f8998;
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>

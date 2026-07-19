export type ManagerStatus = 'offline' | 'idle' | 'running' | 'degraded';

export type ResearchStage =
	| 'idle'
	| 'proposer'
	| 'awaiting_human'
	| 'implementer'
	| 'evaluation'
	| 'judge'
	| 'conclusions'
	| 'complete'
	| 'stopped'
	| 'failed';

export type BranchStatus =
	| 'queued'
	| 'running'
	| 'awaiting_human'
	| 'stopped'
	| 'failed'
	| 'complete';

export interface DatasetPublicManifest {
	datasetId: string;
	name: string;
	version: string;
	source: string;
	doi: string;
	license: string;
	rows: {
		all: number;
		train: number;
		validation: number;
		hidden: number;
	};
	curves: {
		all: number;
		train: number;
		validation: number;
		hidden: number;
	};
	features: string[];
	targets: string[];
	tolerances: string[];
	split: {
		train: string;
		validation: string;
		hidden: string;
	};
	scientificScope: string;
}

export interface ManagerHealth {
	status: ManagerStatus;
	heartbeatAt: string | null;
	activeRunId: string | null;
	pid: number | null;
	message: string;
}

export interface ArchitectureNode {
	id: string;
	label: string;
	detail: string;
}

export interface ArchitectureEdge {
	from: string;
	to: string;
	label: string;
}

export interface ProposalProjection {
	title: string;
	shortName: string;
	thesis: string;
	summary: string;
	architecture: {
		nodes: ArchitectureNode[];
		edges: ArchitectureEdge[];
	};
	trainingPlan: string[];
	inductiveBiases: string[];
	visibleMetrics: string[];
	strengths: string[];
	risks: string[];
	falsificationTests: string[];
	expectedComplexity: string;
	expectedRuntime: string;
	humanQuestions: string[];
	comparisonHook: string;
}

export interface BranchProjection {
	id: string;
	title: string;
	lens: string;
	status: BranchStatus;
	stage: ResearchStage;
	createdAt: string | null;
	updatedAt: string | null;
	threadId: string | null;
	proposal: ProposalProjection | null;
	lastPublicMessage: string;
}

export interface MetricProjection {
	key: string;
	label: string;
	value: number | string | null;
	unit: string;
	better: 'lower' | 'higher' | 'neutral';
}

export interface RunProjection {
	id: string;
	title: string;
	status: BranchStatus;
	stage: ResearchStage;
	createdAt: string | null;
	updatedAt: string | null;
	problem: string;
	branchCount: number;
	branches: BranchProjection[];
	metrics: MetricProjection[];
}

export interface SanitizedEvent {
	id: string;
	timestamp: string | null;
	type:
		| 'run_created'
		| 'run_completed'
		| 'branch_started'
		| 'branch_stopped'
		| 'branch_resumed'
		| 'branch_forked'
		| 'stage_started'
		| 'stage_completed'
		| 'proposal_ready'
		| 'vibe_received'
		| 'evaluation_complete'
		| 'manager_status'
		| 'error'
		| 'activity';
	runId: string | null;
	branchId: string | null;
	stage: ResearchStage | null;
	status: BranchStatus | null;
	title: string;
	message: string;
}

export interface PublicResearchState {
	generatedAt: string;
	manager: ManagerHealth;
	dataset: DatasetPublicManifest | null;
	run: RunProjection | null;
	events: SanitizedEvent[];
}

export type ControlAction =
	| 'start_demo'
	| 'stop_branch'
	| 'continue_branch'
	| 'fork_branch'
	| 'inject_vibe';

export type VibeApplyMode = 'next_stage' | 'immediate';

export interface VibeCard {
	intent: string;
	observation: string;
	direction: string;
	avoidance: string;
	successSignal: string;
	confidence: number;
	applyMode: VibeApplyMode;
}

export interface ControlCommand {
	id: string;
	action: ControlAction;
	createdAt: string;
	runId?: string;
	branchId?: string;
	vibeCard?: VibeCard;
}

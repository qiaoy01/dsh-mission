import type { Agent } from '@deepseek-ai/dsh-agent';
import type { MissionService, MissionView, TaskView } from './service.ts';
import type { Dependency, TaskSpec } from './types.ts';
export type { MissionView, TaskView } from './service.ts';
/** The outcome of running one claimed task against the environment. */
export interface TaskOutcome {
    exitCode: number;
    output?: unknown;
}
/** Independent verdict: aligns a task declaration with environment feedback. */
export interface Verdict {
    passed: boolean;
    verifierType: string;
    evidence?: unknown;
}
/** Runs one claimed task against the environment. */
export type TaskExecutor = (agent: Agent, task: TaskView) => Promise<TaskOutcome>;
/** Independently aligns a task declaration with environment feedback. */
export type TaskVerifier = (task: TaskView, outcome: TaskOutcome) => Verdict;
/**
 * Model/strategy-driven choice of the next task among the claimable
 * candidates (READY tasks plus expired-lease reclamations). Returning
 * `undefined` falls back to the deterministic pick.
 */
export type TaskDecider = (view: MissionView, candidates: TaskView[]) => Promise<TaskView | undefined> | TaskView | undefined;
/** A full next-revision plan: an entirely new task/dependency snapshot. */
export interface PlanProposal {
    tasks: TaskSpec[];
    dependencies: Dependency[];
}
/** Produces the next plan revision when the mission is stuck (FAILED). */
export type TaskReplanner = (view: MissionView) => Promise<PlanProposal> | PlanProposal;
/** Optional human/policy gate before a replan is committed. */
export type ReplanApproval = (agent: Agent, view: MissionView, proposal: PlanProposal) => Promise<boolean> | boolean;
export interface DriveOptions {
    executor: TaskExecutor;
    verifier: TaskVerifier;
    /** Hard cap on dispatched tasks per drive call. */
    maxSteps?: number;
    leaseTtlMs?: number;
    owner?: string;
    /** Strategy for choosing the next task among claimable candidates. */
    decider?: TaskDecider;
    /** Replan producer used when the mission reaches FAILED (stuck). */
    replanner?: TaskReplanner;
    /** Gate run before a replan commits; absent = auto-approve. */
    approval?: ReplanApproval;
    /** Hard cap on replans per drive call (a replan can fail again). */
    maxReplans?: number;
}
/** Whether a task is claimable now: READY, or its prior lease expired without a report. */
export declare function isClaimable(t: TaskView, now: number): boolean;
/** Pick the highest-priority claimable task (deterministic; model-driven selection is injected). */
export declare function pickClaimableTask(view: MissionView, now?: number): TaskView | undefined;
/** Pick the highest-priority READY task (no reclamation). Kept for compatibility. */
export declare function pickReadyTask(view: MissionView): TaskView | undefined;
/** Deterministic verifier: a task passes exactly when its process exits 0. */
export declare function deterministicVerifier(): TaskVerifier;
/**
 * Drive the mission until terminal or no forward progress. Each step: choose a
 * claimable task (decider or deterministic) → claim (reclaiming an expired
 * lease if needed) → execute → report (declaration) → verify (independent) →
 * commit. When the mission is FAILED (stuck), ask the replanner for the next
 * revision — the fold preserves already-DONE tasks whose spec is unchanged —
 * then keep driving. Returns the current mission view.
 */
export declare function driveMission(agent: Agent, mission: MissionService, options: DriveOptions): Promise<MissionView | undefined>;

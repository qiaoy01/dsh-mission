import type { Context } from '@deepseek-ai/cordis';
import type { MissionView, PlanProposal, ReplanApproval, TaskDecider } from './driver.ts';
export interface LlmStrategyOptions {
    /** Override the default model route (else `agentDefaultModel.currentSelection()`). */
    provider?: string;
    model?: string;
    signal?: AbortSignal;
}
/**
 * Model-driven task decider: picks the single most valuable next task among
 * the claimable candidates. Every failure (no model route, stream error, bad
 * JSON, unknown taskId) degrades to `undefined`, so the driver falls back to
 * the deterministic pick and keeps making progress — the model advises, the
 * loop commits.
 */
export declare function llmDecider(ctx: Context, options?: LlmStrategyOptions): TaskDecider;
/**
 * Model-driven replanner: produces the next plan revision for a FAILED
 * (stuck) mission. The prompt hard-codes the domain rules — completed tasks
 * are kept with EXACTLY their taskId and spec, failed work is reworked under
 * a new taskId, unfinished work is reset — and the service's own validation
 * enforces them (revision +1, DONE-spec immutability, acyclicity), so a
 * malformed model proposal is rejected at commit, not silently applied.
 * Errors propagate: without a replan the mission is stuck, so a failed
 * replan must surface to the caller.
 */
export declare function llmReplanner(ctx: Context, options?: LlmStrategyOptions): (view: MissionView) => Promise<PlanProposal>;
/**
 * Human/policy approval gate over a replan. Asks the composed approval
 * service; only an `allowed-once` grant approves. If no approval service is
 * mounted, or the ask cannot complete (no open turn, no answerer), the gate
 * AUTO-APPROVES: the mission is already stuck, the replan is deterministically
 * validated and versioned, and progress must not silently die on an
 * unanswered question. Compositions that require a hard gate should wrap this
 * with their own policy instead.
 */
export declare function userApprovalGate(ctx: Context, toolName?: string): ReplanApproval;

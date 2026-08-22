import type { Context } from '@deepseek-ai/cordis';
export declare const name = "mission-driver";
/** Hard deps: agent registry (liveness), mission service, subagent dispatch. */
export declare const inject: string[];
export interface MissionDriverConfig {
    /** Task selection: 'deterministic' (default) or 'llm' (model advises, loop commits). */
    decider?: 'deterministic' | 'llm';
    /** Enable model-driven replan when the mission is stuck (default false). */
    replan?: boolean;
    /** Model route overrides for llm strategies (else agentDefaultModel). */
    provider?: string;
    model?: string;
    /** Subagent provider name (default 'spawn'). */
    subagentProvider?: string;
    leaseTtlMs?: number;
    maxSteps?: number;
    maxReplans?: number;
    /** Periodic tick for expired-lease reclamation (ms; default 15_000). */
    tickMs?: number;
}
/** Install the mission driver host over every live agent. */
export declare function apply(ctx: Context, config?: MissionDriverConfig): void;

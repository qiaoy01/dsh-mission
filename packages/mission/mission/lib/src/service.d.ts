import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ClaimRequest, CreateMissionRequest, PlanRequest, ReportRequest, VerifyRequest } from './domain.ts';
import type { Dependency, Lease, MissionStatus, TaskStatus, TaskStored } from './types.ts';
/** Plain-JSON task view (model-facing; no Map). */
export interface TaskView {
    id: string;
    name: string;
    workerType: string;
    priority: number;
    stored: TaskStored;
    status: TaskStatus;
    lease: Lease | null;
    report: {
        exitCode: number;
        output?: unknown;
    } | null;
    verification: {
        verifierType: string;
        passed: boolean;
    } | null;
}
/** Plain-JSON mission view (model-facing; no Map). */
export interface MissionView {
    id: string;
    objective: string;
    status: MissionStatus;
    revision: number;
    cancelled: boolean;
    tasks: TaskView[];
    dependencies: Dependency[];
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        mission: MissionService;
    }
}
/** Mission service (`ctx.mission`) backed exclusively by the owning session log. */
export declare class MissionService extends Service {
    static inject: string[];
    constructor(ctx: Context);
    /** Read the current mission for one exact live agent. */
    status(agent: Agent): MissionView | undefined;
    /** Create and return a new mission. */
    create(agent: Agent, request: CreateMissionRequest): MissionView;
    /** Commit a full plan snapshot (CAS: revision must be current + 1). */
    plan(agent: Agent, request: PlanRequest): MissionView;
    /** Claim a READY task with a lease. */
    claim(agent: Agent, request: ClaimRequest): MissionView;
    /** Record a task's declaration against the environment (does not set DONE). */
    report(agent: Agent, request: ReportRequest): MissionView;
    /** Independently align a task's declaration with the environment → DONE/FAILED. */
    verify(agent: Agent, request: VerifyRequest): MissionView;
    /** Explicitly cancel the current mission. */
    cancel(agent: Agent): MissionView;
    /** Enforce exact live-agent identity rather than trusting a matching id. */
    private assertLive;
    /** Fold the committed mission events of one session into a world. */
    private foldWorld;
    /** The single current mission state, or undefined before creation. */
    private currentMission;
    private requireMission;
    /** Validate one candidate event against the current fold, then append it. */
    private commit;
}
export default MissionService;

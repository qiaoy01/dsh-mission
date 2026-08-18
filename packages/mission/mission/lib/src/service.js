// MissionService — event-sourced mission state with compare-and-set plan
// commits. Mirrors dsh-goal's GoalService: single current mission, revision
// monotonicity as the version guard, synchronous session append.
// @module @deepseek-ai/dsh-mission
import { randomUUID } from 'node:crypto';
import { Service } from '@deepseek-ai/cordis';
import { agentEvents } from '@deepseek-ai/dsh-agent';
import { missionEventOf, MissionError, registerMissionEventTypes } from "./domain.js";
import { foldMission } from "./fold.js";
import { validateEvent } from "./validate.js";
function toTaskView(t) {
    return {
        id: t.id,
        name: t.name,
        workerType: t.workerType,
        priority: t.priority,
        stored: t.stored,
        status: t.status,
        lease: t.lease,
        report: t.report,
        verification: t.verification,
    };
}
function toView(m) {
    return {
        id: m.id,
        objective: m.objective,
        status: m.status,
        revision: m.revision,
        cancelled: m.cancelled,
        tasks: [...m.tasks.values()].map(toTaskView),
        dependencies: m.dependencies,
    };
}
function resolveObjective(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new MissionError('mission objective must be a non-empty string', 'MISSION_INVALID_OBJECTIVE');
    }
    return value.trim();
}
/** Mission service (`ctx.mission`) backed exclusively by the owning session log. */
export class MissionService extends Service {
    static inject = ['agents'];
    constructor(ctx) {
        super(ctx, 'mission');
        // Make the harness persistence reader accept mission/* events (out-of-repo
        // vocabulary is not in its compiled known-types set). Must run before any
        // session replay, so it lives on the earliest mission entry point.
        registerMissionEventTypes();
    }
    /** Read the current mission for one exact live agent. */
    status(agent) {
        const m = this.currentMission(agent);
        return m === undefined ? undefined : toView(m);
    }
    /** Create and return a new mission. */
    create(agent, request) {
        const objective = resolveObjective(request.objective);
        this.assertLive(agent);
        // Only an ACTIVE (non-terminal) mission blocks a new one; a COMPLETED /
        // FAILED / CANCELLED mission lets the session open the next mission.
        const active = [...this.foldWorld(agent).values()].some((m) => m.status !== 'COMPLETED' && m.status !== 'FAILED' && m.status !== 'CANCELLED');
        if (active) {
            throw new MissionError('an active mission already exists in this session', 'MISSION_ALREADY_EXISTS');
        }
        const missionId = `mission-${randomUUID()}`;
        this.commit(agent, { type: 'mission/created', missionId, objective });
        return toView(this.requireMission(agent));
    }
    /** Commit a full plan snapshot (CAS: revision must be current + 1). */
    plan(agent, request) {
        const current = this.requireMission(agent);
        this.commit(agent, {
            type: 'mission/plan-committed',
            missionId: current.id,
            revision: request.revision,
            tasks: request.tasks,
            dependencies: request.dependencies,
        });
        return toView(this.requireMission(agent));
    }
    /** Claim a READY task with a lease. */
    claim(agent, request) {
        const current = this.requireMission(agent);
        this.commit(agent, { type: 'mission/task-claimed', missionId: current.id, taskId: request.taskId, lease: request.lease });
        return toView(this.requireMission(agent));
    }
    /** Record a task's declaration against the environment (does not set DONE). */
    report(agent, request) {
        const current = this.requireMission(agent);
        this.commit(agent, {
            type: 'mission/task-reported',
            missionId: current.id,
            taskId: request.taskId,
            token: request.token,
            exitCode: request.exitCode,
            ...(request.output === undefined ? {} : { output: request.output }),
        });
        return toView(this.requireMission(agent));
    }
    /** Independently align a task's declaration with the environment → DONE/FAILED. */
    verify(agent, request) {
        const current = this.requireMission(agent);
        this.commit(agent, {
            type: 'mission/task-verified',
            missionId: current.id,
            taskId: request.taskId,
            verifierType: request.verifierType,
            passed: request.passed,
            ...(request.evidence === undefined ? {} : { evidence: request.evidence }),
        });
        return toView(this.requireMission(agent));
    }
    /** Explicitly cancel the current mission. */
    cancel(agent) {
        const current = this.requireMission(agent);
        this.commit(agent, { type: 'mission/cancelled', missionId: current.id });
        return toView(this.requireMission(agent));
    }
    /** Enforce exact live-agent identity rather than trusting a matching id. */
    assertLive(agent) {
        if (this.ctx.agents.get(agent.id) !== agent) {
            throw new MissionError(`agent "${agent.id}" is not live in this registry`, 'MISSION_AGENT_NOT_LIVE');
        }
    }
    /** Fold the committed mission events of one session into a world. */
    foldWorld(agent) {
        const events = [];
        for (const event of agent.session.events) {
            const me = missionEventOf(event);
            if (me !== null)
                events.push(me);
        }
        return foldMission(events);
    }
    /** The latest mission state (successive missions per session), or undefined before creation. */
    currentMission(agent) {
        this.assertLive(agent);
        return [...this.foldWorld(agent).values()].at(-1);
    }
    requireMission(agent) {
        const m = this.currentMission(agent);
        if (m === undefined)
            throw new MissionError('no current mission', 'MISSION_NOT_FOUND');
        return m;
    }
    /** Validate one candidate event against the current fold, then append it. */
    commit(agent, event) {
        this.assertLive(agent);
        const violations = validateEvent(this.foldWorld(agent), event, Date.now());
        if (violations.length > 0) {
            throw new MissionError(violations.join('; '), 'MISSION_INVALID_TRANSITION');
        }
        switch (event.type) {
            case 'mission/created':
                agent.session.append('mission/created', { missionId: event.missionId, objective: event.objective });
                break;
            case 'mission/plan-committed':
                agent.session.append('mission/plan-committed', { missionId: event.missionId, revision: event.revision, tasks: event.tasks, dependencies: event.dependencies });
                break;
            case 'mission/task-claimed':
                agent.session.append('mission/task-claimed', { missionId: event.missionId, taskId: event.taskId, lease: event.lease });
                break;
            case 'mission/task-reported':
                agent.session.append('mission/task-reported', { missionId: event.missionId, taskId: event.taskId, token: event.token, exitCode: event.exitCode, ...(event.output === undefined ? {} : { output: event.output }) });
                break;
            case 'mission/task-verified':
                agent.session.append('mission/task-verified', { missionId: event.missionId, taskId: event.taskId, verifierType: event.verifierType, passed: event.passed, ...(event.evidence === undefined ? {} : { evidence: event.evidence }) });
                break;
            case 'mission/cancelled':
                agent.session.append('mission/cancelled', { missionId: event.missionId });
                break;
        }
        // Scoped live notification: the driver host and any UI projection react
        // to committed mission mutations. The matching `mission/*` session event
        // has already committed when listeners run.
        agentEvents(this.ctx, agent).emit('mission/changed', { missionId: event.missionId });
    }
}
export default MissionService;

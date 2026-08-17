// driver — the autonomous mission control loop: read → decide → claim →
// execute → report → verify → commit, with lazy lease reclamation and
// model-driven replan on failure. The executor (subagent dispatch in
// production), verifier (independent alignment), decider (which task next)
// and replanner (new revision on a stuck mission) are all injected, so the
// loop is unit-testable without the agent loop or the model.
// @module @deepseek-ai/dsh-mission
import { randomUUID } from 'node:crypto';
/** Whether a task is claimable now: READY, or its prior lease expired without a report. */
export function isClaimable(t, now) {
    if (t.status === 'READY')
        return true;
    return t.stored === 'CLAIMED' && t.lease !== null && t.lease.expiresAt <= now && t.report === null;
}
/** Pick the highest-priority claimable task (deterministic; model-driven selection is injected). */
export function pickClaimableTask(view, now = Date.now()) {
    const candidates = view.tasks.filter((t) => isClaimable(t, now));
    if (candidates.length === 0)
        return undefined;
    candidates.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    return candidates[0];
}
/** Pick the highest-priority READY task (no reclamation). Kept for compatibility. */
export function pickReadyTask(view) {
    const ready = view.tasks.filter((t) => t.status === 'READY');
    if (ready.length === 0)
        return undefined;
    ready.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    return ready[0];
}
/** Deterministic verifier: a task passes exactly when its process exits 0. */
export function deterministicVerifier() {
    return (_task, outcome) => ({
        passed: outcome.exitCode === 0,
        verifierType: 'deterministic',
        evidence: { exitCode: outcome.exitCode },
    });
}
/**
 * Drive the mission until terminal or no forward progress. Each step: choose a
 * claimable task (decider or deterministic) → claim (reclaiming an expired
 * lease if needed) → execute → report (declaration) → verify (independent) →
 * commit. When the mission is FAILED (stuck), ask the replanner for the next
 * revision — the fold preserves already-DONE tasks whose spec is unchanged —
 * then keep driving. Returns the current mission view.
 */
export async function driveMission(agent, mission, options) {
    const { executor, verifier, maxSteps = 100, leaseTtlMs = 60_000, owner = 'mission-driver', decider, replanner, approval, maxReplans = 1 } = options;
    let steps = 0;
    let replans = 0;
    for (;;) {
        const view = mission.status(agent);
        if (view === undefined || view.status === 'CREATED' || view.status === 'COMPLETED' || view.status === 'CANCELLED') {
            return view;
        }
        if (view.status === 'FAILED') {
            if (replans >= maxReplans || replanner === undefined)
                return view;
            const proposal = await replanner(view);
            if (approval !== undefined && !(await approval(agent, view, proposal)))
                return view;
            mission.plan(agent, {
                revision: view.revision + 1,
                tasks: proposal.tasks,
                dependencies: proposal.dependencies,
            });
            replans++;
            continue;
        }
        if (steps >= maxSteps)
            return view;
        const now = Date.now();
        const candidates = view.tasks.filter((t) => isClaimable(t, now));
        let task;
        if (decider !== undefined)
            task = await decider(view, candidates);
        if (task === undefined)
            task = pickClaimableTask(view, now);
        if (task === undefined)
            return view;
        const token = `lease-${randomUUID()}`;
        mission.claim(agent, {
            taskId: task.id,
            lease: { owner, token, expiresAt: now + leaseTtlMs, attempt: (task.lease?.attempt ?? 0) + 1 },
        });
        const outcome = await executor(agent, task);
        mission.report(agent, {
            taskId: task.id,
            token,
            exitCode: outcome.exitCode,
            ...(outcome.output === undefined ? {} : { output: outcome.output }),
        });
        const verdict = verifier(task, outcome);
        mission.verify(agent, {
            taskId: task.id,
            verifierType: verdict.verifierType,
            passed: verdict.passed,
            ...(verdict.evidence === undefined ? {} : { evidence: verdict.evidence }),
        });
        steps++;
    }
}

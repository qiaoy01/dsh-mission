// fold — pure event → state reduction for the mission DAG.
// Zero runtime deps; erasable syntax only.
function newMission(id) {
    return { id, objective: '', status: 'CREATED', revision: 0, cancelled: false, tasks: new Map(), dependencies: [] };
}
function newTask(spec) {
    return {
        id: spec.taskId,
        name: spec.name,
        workerType: spec.workerType,
        priority: spec.priority,
        stored: 'PENDING',
        status: 'PENDING',
        lease: null,
        report: null,
        verification: null,
    };
}
/** Whether a task still matches its re-committed spec (name/workerType/priority). */
export function matchesSpec(t, spec) {
    return t.name === spec.name && t.workerType === spec.workerType && t.priority === spec.priority;
}
function getOrCreate(world, id) {
    let m = world.get(id);
    if (!m) {
        m = newMission(id);
        world.set(id, m);
    }
    return m;
}
/**
 * Derived effective status for one task, from its stored status and the
 * STORED statuses of its dependencies (order-independent, no recursion).
 */
export function effectiveTaskStatus(stored, deps, storedOf) {
    if (stored !== 'PENDING')
        return stored;
    for (const dep of deps) {
        const s = storedOf(dep);
        if (s === 'FAILED')
            return 'BLOCKED';
        if (s !== 'DONE')
            return 'PENDING';
    }
    return 'READY';
}
/**
 * Derived mission status. COMPLETED when every task is DONE; FAILED when a
 * FAILED task leaves no forward-progress task (READY/CLAIMED/PENDING) —
 * i.e. the plan is stuck until a replan supersedes it. CANCELLED is explicit.
 */
export function missionStatus(m) {
    if (m.cancelled)
        return 'CANCELLED';
    if (m.revision === 0)
        return 'CREATED';
    const tasks = [...m.tasks.values()];
    if (tasks.every((t) => t.status === 'DONE'))
        return 'COMPLETED';
    const forward = tasks.some((t) => t.status === 'READY' || t.status === 'CLAIMED' || t.status === 'PENDING');
    const failed = tasks.some((t) => t.status === 'FAILED');
    if (failed && !forward)
        return 'FAILED';
    return 'RUNNING';
}
/** Recompute effective task statuses, then the mission status, for one mission. */
function derive(m) {
    const storedOf = (id) => m.tasks.get(id)?.stored;
    const depsOf = (id) => m.dependencies.filter((d) => d.taskId === id).map((d) => d.dependsOn);
    for (const t of m.tasks.values()) {
        t.status = effectiveTaskStatus(t.stored, depsOf(t.id), storedOf);
    }
    m.status = missionStatus(m);
}
/**
 * Fold a mission event stream into a world of mission states. Total over any
 * event list (a candidate referencing an unknown mission is created lazily);
 * validation is the invariant companion's job, not the fold's.
 */
export function foldMission(events) {
    const world = new Map();
    for (const ev of events) {
        const m = getOrCreate(world, ev.missionId);
        switch (ev.type) {
            case 'mission/created':
                m.objective = ev.objective;
                break;
            case 'mission/plan-committed': {
                const prev = m.tasks;
                m.revision = ev.revision;
                m.dependencies = ev.dependencies;
                m.tasks = new Map();
                for (const spec of ev.tasks) {
                    const old = prev.get(spec.taskId);
                    // Preserve a completed task across a replan when its spec is unchanged;
                    // everything else is reset to PENDING (a replan re-decides unfinished work).
                    if (old && old.stored === 'DONE' && matchesSpec(old, spec)) {
                        m.tasks.set(spec.taskId, old);
                    }
                    else {
                        m.tasks.set(spec.taskId, newTask(spec));
                    }
                }
                break;
            }
            case 'mission/task-claimed': {
                const t = m.tasks.get(ev.taskId);
                if (t) {
                    t.lease = ev.lease;
                    t.stored = 'CLAIMED';
                }
                break;
            }
            case 'mission/task-reported': {
                const t = m.tasks.get(ev.taskId);
                if (t)
                    t.report = { exitCode: ev.exitCode, output: ev.output };
                break;
            }
            case 'mission/task-verified': {
                const t = m.tasks.get(ev.taskId);
                if (t) {
                    t.verification = { verifierType: ev.verifierType, passed: ev.passed };
                    t.stored = ev.passed ? 'DONE' : 'FAILED';
                }
                break;
            }
            case 'mission/cancelled':
                m.cancelled = true;
                break;
        }
    }
    for (const m of world.values())
        derive(m);
    return world;
}

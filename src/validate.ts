// validate — deterministic validation applied to a candidate event BEFORE it
// enters the durable log. Mirrors dsh-goal / dsh-schedule's invariant pattern.
// Pure functions; the service runs these pre-append, and the invariant
// companion re-runs them against the committed log.

import type { MissionEvent, MissionWorld } from './types.ts'
import { matchesSpec } from './fold.ts'

/** Whether the dependency edge set is acyclic and references only known tasks. */
export function isAcyclic(tasks: string[], deps: { taskId: string; dependsOn: string }[]): boolean {
  const ids = new Set(tasks)
  const adj = new Map<string, string[]>()
  for (const t of tasks) adj.set(t, [])
  for (const d of deps) {
    if (!ids.has(d.taskId) || !ids.has(d.dependsOn)) return false // dangling ref
    adj.get(d.taskId)!.push(d.dependsOn)
  }
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  const visit = (n: string): boolean => {
    color.set(n, GRAY)
    for (const m of adj.get(n) ?? []) {
      const c = color.get(m) ?? WHITE
      if (c === GRAY) return false
      if (c === WHITE && !visit(m)) return false
    }
    color.set(n, BLACK)
    return true
  }
  for (const t of tasks) {
    if ((color.get(t) ?? WHITE) === WHITE && !visit(t)) return false
  }
  return true
}

/**
 * Validate one candidate event against the current world state (the fold of
 * all prior events). Returns a list of violations; empty means the event is
 * admissible. `now` is epoch ms, used for lease-expiry checks.
 */
export function validateEvent(world: MissionWorld, event: MissionEvent, now: number): string[] {
  const v: string[] = []
  const m = world.get(event.missionId)

  switch (event.type) {
    case 'mission/created': {
      // A session may open a NEW mission once the previous one is terminal
      // (COMPLETED / FAILED / CANCELLED) — long-lived projects run successive
      // missions over months. Only an ACTIVE (non-terminal) mission blocks a
      // fresh create; completed history is preserved in the same session log.
      const active = [...world.values()].some((existing) =>
        existing.status !== 'COMPLETED' && existing.status !== 'FAILED' && existing.status !== 'CANCELLED')
      if (active) v.push('an active mission already exists in this session')
      else if (event.objective.trim() === '') v.push('objective must be non-empty')
      break
    }

    case 'mission/plan-committed': {
      if (!m) {
        v.push('unknown mission')
        break
      }
      // A COMPLETED mission is done; a CANCELLED one was explicitly stopped.
      // FAILED stays open for replan-on-failure; RUNNING allows model replans.
      if (m.status === 'COMPLETED' || m.status === 'CANCELLED') {
        v.push(`mission is ${m.status}: no further plans`)
      }
      if (event.revision !== m.revision + 1) {
        v.push(`revision must increment by 1 (current ${m.revision}, got ${event.revision})`)
      }
      const taskIds = event.tasks.map((t) => t.taskId)
      if (new Set(taskIds).size !== taskIds.length) v.push('duplicate task ids')
      if (!isAcyclic(taskIds, event.dependencies)) v.push('dependency graph is not acyclic or has dangling references')
      for (const spec of event.tasks) {
        const old = m.tasks.get(spec.taskId)
        if (old && old.stored === 'DONE' && !matchesSpec(old, spec)) {
          v.push(`completed task ${spec.taskId} cannot change spec across a replan (use a new taskId)`)
        }
      }
      break
    }

    case 'mission/task-claimed': {
      if (!m) {
        v.push('unknown mission')
        break
      }
      if (m.status === 'CANCELLED') v.push('mission is cancelled: no further task transitions')
      const t = m.tasks.get(event.taskId)
      if (!t) {
        v.push('unknown task')
        break
      }
      if (event.lease.expiresAt <= now) v.push('lease must not already be expired')
      if (t.stored === 'CLAIMED') {
        // Reclaim path: the previous worker died without reporting. Only a
        // lease that expired AND never produced a report may be reclaimed;
        // a live lease still owns the task, and a reported task proceeds to
        // verification instead (the verifier does not need the token).
        if (!t.lease || t.lease.expiresAt > now) {
          v.push(`task is already claimed by a live lease (expires ${t.lease?.expiresAt ?? 'never'})`)
        } else if (t.report !== null) {
          v.push('task already reported: reclamation is not allowed after a report')
        }
      } else if (t.status !== 'READY') {
        v.push(`task must be READY to claim (is ${t.status})`)
      }
      break
    }

    case 'mission/task-reported': {
      if (!m) {
        v.push('unknown mission')
        break
      }
      if (m.status === 'CANCELLED') v.push('mission is cancelled: no further task transitions')
      const t = m.tasks.get(event.taskId)
      if (!t) {
        v.push('unknown task')
        break
      }
      if (!t.lease || t.lease.token !== event.token) v.push('lease token mismatch: only current holder may report')
      break
    }

    case 'mission/task-verified': {
      if (!m) {
        v.push('unknown mission')
        break
      }
      if (m.status === 'CANCELLED') v.push('mission is cancelled: no further task transitions')
      const t = m.tasks.get(event.taskId)
      if (!t) {
        v.push('unknown task')
        break
      }
      if (!t.report) v.push('verification requires a prior task report (worker cannot self-certify)')
      if (t.stored === 'DONE' || t.stored === 'FAILED') {
        v.push(`task already terminal (${t.stored}): completed history is immutable`)
      }
      break
    }

    case 'mission/cancelled': {
      if (!m) {
        v.push('unknown mission')
        break
      }
      if (m.status === 'COMPLETED' || m.status === 'FAILED' || m.status === 'CANCELLED') {
        v.push(`mission already terminal (${m.status})`)
      }
      break
    }
  }
  return v
}

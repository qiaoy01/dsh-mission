// llm — model-driven strategy for the mission driver: which task to claim
// next (decider), what the next plan revision looks like when the mission is
// stuck (replanner), and an optional human approval gate over a replan.
// Structured output is a one-shot stream call with a single `respond` tool
// whose JSON-Schema arguments are the structured result — the same shape the
// harness uses for tool-based structured output.
// @module @deepseek-ai/dsh-mission

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { MissionError } from './domain.ts'
import type { MissionView, PlanProposal, ReplanApproval, TaskDecider } from './driver.ts'
import type { Dependency, TaskSpec } from './types.ts'

/** One-shot structured call: ask the model to emit one JSON value via a tool call. */
async function structuredCall(
  ctx: Context,
  opts: {
    purpose: string
    prompt: string
    schema: ObjectJsonSchema
    provider?: string
    model?: string
    signal?: AbortSignal
  },
): Promise<unknown> {
  const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
  const provider = opts.provider ?? selection?.provider
  const model = opts.model ?? selection?.model
  if (provider === undefined || model === undefined) {
    throw new MissionError(
      `no model route for ${opts.purpose}: pass provider/model or mount agent-default-model`,
      'MISSION_LLM_ROUTE_MISSING',
    )
  }
  const messages = [createUserMessage({
    content: [{ type: 'text', text: opts.prompt }],
    source: { kind: 'user' },
  })]
  const tools: ToolSchema[] = [{
    name: 'respond',
    description: `Return the requested ${opts.purpose} as structured data.`,
    parameters: opts.schema as unknown as Record<string, unknown>,
  }]
  const chunks: StreamChunk[] = []
  for await (const chunk of ctx.llm.stream({
    provider, model, messages, tools, temperature: 0,
    ...(opts.signal === undefined ? {} : { signal: opts.signal }),
  })) {
    chunks.push(chunk)
  }
  for (const chunk of chunks) {
    if (chunk.type !== 'block-end') continue
    const block = chunk.block
    if (block.type === 'tool-call' && block.name === 'respond') {
      try {
        return JSON.parse(block.arguments) as unknown
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export interface LlmStrategyOptions {
  /** Override the default model route (else `agentDefaultModel.currentSelection()`). */
  provider?: string
  model?: string
  signal?: AbortSignal
}

const DECIDE_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['taskId'],
  properties: {
    taskId: { type: 'string' },
  },
}

/**
 * Model-driven task decider: picks the single most valuable next task among
 * the claimable candidates. Every failure (no model route, stream error, bad
 * JSON, unknown taskId) degrades to `undefined`, so the driver falls back to
 * the deterministic pick and keeps making progress — the model advises, the
 * loop commits.
 */
export function llmDecider(ctx: Context, options: LlmStrategyOptions = {}): TaskDecider {
  return async (view, candidates) => {
    if (candidates.length === 0) return undefined
    try {
      const list = candidates.map((t) => ({ taskId: t.id, name: t.name, workerType: t.workerType, priority: t.priority, attempt: t.lease?.attempt ?? 0 }))
      const prompt = `Mission objective: ${view.objective}\nChoose the single most valuable next task from these claimable candidates:\n${JSON.stringify(list)}\nReturn { "taskId": "<chosen id>" } or { "taskId": "" } if none is worth running now.`
      const parsed = await structuredCall(ctx, {
        purpose: 'task decision',
        prompt,
        schema: DECIDE_SCHEMA,
        ...options,
      }) as { taskId?: string } | undefined
      const id = typeof parsed?.taskId === 'string' && parsed.taskId !== '' ? parsed.taskId : null
      if (id === null) return undefined
      return candidates.find((c) => c.id === id)
    } catch {
      return undefined
    }
  }
}

const REPLAN_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tasks', 'dependencies'],
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['taskId', 'name', 'workerType', 'priority'],
        properties: {
          taskId: { type: 'string' },
          name: { type: 'string' },
          workerType: { type: 'string' },
          priority: { type: 'number' },
        },
      },
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['taskId', 'dependsOn'],
        properties: {
          taskId: { type: 'string' },
          dependsOn: { type: 'string' },
        },
      },
    },
  },
}

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
export function llmReplanner(ctx: Context, options: LlmStrategyOptions = {}): (view: MissionView) => Promise<PlanProposal> {
  return async (view) => {
    const tasks = view.tasks.map((t) => ({
      taskId: t.id,
      name: t.name,
      workerType: t.workerType,
      priority: t.priority,
      stored: t.stored,
      status: t.status,
      verification: t.verification,
    }))
    const prompt = `Mission objective: ${view.objective}\n`
      + `Current revision ${view.revision} is stuck (status FAILED). Current plan:\n`
      + `${JSON.stringify({ tasks, dependencies: view.dependencies })}\n\n`
      + 'Produce the next plan revision. Rules:\n'
      + '- A task with status DONE must be kept with EXACTLY the same taskId and spec (taskId/name/workerType/priority).\n'
      + '- Rework FAILED work under a NEW taskId (e.g. suffix -v2) describing the adjusted approach; you may also drop it.\n'
      + '- Unfinished non-failed tasks may be kept as-is (they reset to PENDING) or reworked under new taskIds.\n'
      + '- Dependencies must reference only taskIds present in the plan and must not contain cycles.\n'
      + `Return { "tasks": [{ taskId, name, workerType, priority }], "dependencies": [{ taskId, dependsOn }] }.`
    const parsed = await structuredCall(ctx, {
      purpose: 'plan revision',
      prompt,
      schema: REPLAN_SCHEMA,
      ...options,
    }) as { tasks?: TaskSpec[]; dependencies?: Dependency[] } | undefined
    if (parsed === undefined || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.dependencies)) {
      throw new MissionError('replanner returned no usable plan proposal', 'MISSION_INVALID_TRANSITION')
    }
    return { tasks: parsed.tasks, dependencies: parsed.dependencies }
  }
}

/**
 * Human/policy approval gate over a replan. Asks the composed approval
 * service; only an `allowed-once` grant approves. If no approval service is
 * mounted, or the ask cannot complete (no open turn, no answerer), the gate
 * AUTO-APPROVES: the mission is already stuck, the replan is deterministically
 * validated and versioned, and progress must not silently die on an
 * unanswered question. Compositions that require a hard gate should wrap this
 * with their own policy instead.
 */
export function userApprovalGate(ctx: Context, toolName = 'mission_replan'): ReplanApproval {
  return async (agent, view, proposal) => {
    const approval = ctx.get('approval')
    if (approval === undefined) return true
    try {
      const outcome = await approval.request({
        agent,
        toolName,
        reason: `mission ${view.id} is stuck (revision ${view.revision}); approve replan with ${proposal.tasks.length} tasks?`,
      })
      return outcome === 'allowed-once'
    } catch {
      return true
    }
  }
}

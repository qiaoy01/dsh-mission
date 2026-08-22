// Model-facing `mission_create`, `mission_plan`, and `mission_status` tools
// over the persisted mission domain. Execution and verification are
// driver-side actions (phase C), so the model only creates, plans, and reads.
// @module @deepseek-ai/dsh-mission/tool

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import { MissionError } from './domain.ts'
import type { Dependency, TaskSpec } from './types.ts'

export const name = 'tool-mission'
export const inject = ['mission', 'tools']

/** JSON-string output: the mission view serialized as a single text block. */
const STRING_OUTPUT = {
  schema: { type: 'string' } as const,
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

function present(title: string, rawInput?: unknown): GenericCallView {
  return { card: 'generic', title, kind: 'other', ...(rawInput === undefined ? {} : { rawInput }) }
}

function liveAgent(exec: { agent?: import('@deepseek-ai/dsh-agent').Agent }): import('@deepseek-ai/dsh-agent').Agent {
  if (exec.agent === undefined) {
    throw new MissionError('tool executed without a live agent', 'MISSION_AGENT_NOT_LIVE')
  }
  return exec.agent
}

/** Register the three model-facing mission tools. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'mission_create',
    description: 'Create one persisted mission for a long-horizon objective that the runtime will '
      + 'drive across many turns. Do not use this for short single-turn work.',
    parameters: {
      objective: {
        type: 'string',
        required: true,
        description: 'The concrete long-horizon objective the mission should reach.',
      },
    },
    output: STRING_OUTPUT,
    execute(args, exec) {
      const agent = liveAgent(exec)
      return Promise.resolve(JSON.stringify(ctx.mission.create(agent, { objective: args.objective })))
    },
    presentCall: args => present('Create mission', args.objective),
  }))

  ctx.tools.register(defineTool({
    name: 'mission_plan',
    description: 'Commit a full mission plan snapshot (tasks + dependencies) as the next revision. '
      + 'The revision must be exactly the current revision + 1. Completed tasks keep their DONE state '
      + 'when their spec is unchanged.',
    parameters: {
      revision: { type: 'number', required: true, description: 'Expected next plan revision (current + 1).' },
      tasks: {
        type: 'array',
        required: true,
        description: 'Task specs, each { taskId, name, workerType, priority }.',
      },
      dependencies: {
        type: 'array',
        required: true,
        description: 'Dependency edges, each { taskId, dependsOn }.',
      },
    },
    output: STRING_OUTPUT,
    execute(args, exec) {
      const agent = liveAgent(exec)
      return Promise.resolve(JSON.stringify(ctx.mission.plan(agent, {
        revision: args.revision,
        tasks: args.tasks as unknown as TaskSpec[],
        dependencies: args.dependencies as unknown as Dependency[],
      })))
    },
    presentCall: args => present(`Plan mission (revision ${args.revision})`),
  }))

  ctx.tools.register(defineTool({
    name: 'mission_status',
    description: 'Read the current mission: objective, status, revision, and every task with its '
      + 'stored/effective status and lease.',
    parameters: {},
    output: STRING_OUTPUT,
    execute(_args, exec) {
      const agent = liveAgent(exec)
      return Promise.resolve(JSON.stringify(ctx.mission.status(agent) ?? null))
    },
    presentCall: () => present('Read mission status'),
  }))

  ctx.tools.register(defineTool({
    name: 'mission_cancel',
    description: 'Cancel the current mission: it becomes CANCELLED (terminal) and the runtime stops '
      + 'claiming/executing further tasks. Use it to abort a mission that is going the wrong way; '
      + 'a new mission can be created afterwards in the same session.',
    parameters: {},
    output: STRING_OUTPUT,
    execute(_args, exec) {
      const agent = liveAgent(exec)
      return Promise.resolve(JSON.stringify(ctx.mission.cancel(agent)))
    },
    presentCall: () => present('Cancel mission'),
  }))
}

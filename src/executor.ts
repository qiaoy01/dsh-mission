// executor — one-shot subagent dispatch for a claimed task. Each task runs as
// a child agent whose structured output carries `exitCode` and optional
// `output`; the driver treats that as the environment declaration (report),
// never as the authority (verify).
// @module @deepseek-ai/dsh-mission

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-subagent'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import type { TaskView } from './service.ts'
import type { TaskExecutor, TaskOutcome } from './driver.ts'

/** Structured-output contract a task subagent must satisfy. */
const TASK_OUTPUT_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['exitCode'],
  properties: {
    exitCode: { type: 'integer' },
    output: { type: 'object', additionalProperties: true },
  },
}

function taskPrompt(task: TaskView): string {
  return 'Execute this task and return a structured result with an integer `exitCode` '
    + `(0 for success) and optional \`output\`.\n\nTask: ${task.name}\nWorker type: ${task.workerType}\nPriority: ${task.priority}`
}

/** One-shot subagent executor: dispatch each task to a child agent. */
export function subagentExecutor(ctx: Context, providerName = 'spawn'): TaskExecutor {
  return async (agent: Agent, task: TaskView): Promise<TaskOutcome> => {
    const run = await ctx.subagents.start(providerName, {
      prompt: [{ type: 'text', text: taskPrompt(task) }],
      parent: agent,
      signal: new AbortController().signal,
      outputSchema: TASK_OUTPUT_SCHEMA,
    })
    try {
      const result = await run.result
      const structured = result.structured as { exitCode?: number; output?: unknown } | undefined
      return {
        exitCode: structured?.exitCode ?? (result.stopReason === 'completed' ? 0 : 1),
        output: structured?.output,
      }
    } finally {
      await run.dispose()
    }
  }
}

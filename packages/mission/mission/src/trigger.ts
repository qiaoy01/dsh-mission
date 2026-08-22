// dsh-mission trigger companion: routes trigger phrases into the mission
// workflow. Two tolerant, independent contributions, each a no-op where its
// service is absent (so a minimal composition without dsh-system-prompt or
// dsh-commands still boots):
//
//   1. A soft-guidance system-prompt section (the same pattern as
//      dsh-plan-mode's `plan:policy`) that steers the model to call
//      `mission_create` + `mission_plan` when the user's request carries a
//      trigger phrase — the model plans, then stops; mission-driver executes.
//   2. A `/mission` slash command (like dsh-command-goal's `/goal`) for direct
//      UI invocation: status / cancel / create.
//
// @module @deepseek-ai/dsh-mission/trigger

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { MissionError } from './domain.ts'
import type { MissionView } from './service.ts'

export const name = 'mission-trigger'
/** No hard inject: `systemPrompt` and `commands` are optional in minimal compositions. */
export const inject: readonly string[] = []

/** Unique guidance section name (namespace convention mirrors `plan:policy`). */
const SECTION_NAME = 'mission:trigger'
/** Tool-guidance band (100–199), just after the base tool guidance. */
const SECTION_ORDER = 150
const COMMAND_NAME = 'mission'

/** Human trigger phrases routed into the mission workflow. */
const TRIGGER_PHRASES = ['mission:', '/mission', 'create mission', 'new mission', '创建任务', '新建任务', '创建 mission']

/** Soft guidance: how the model should respond to a trigger phrase. */
const GUIDANCE = [
  'Mission workflow routing (dsh-mission).',
  `A request that begins with one of these trigger phrases — ${TRIGGER_PHRASES.join(' / ')} — asks for a long-horizon mission, not a one-shot answer.`,
  'When you recognize a trigger, do NOT carry out the work yourself. Instead:',
  '1. Call mission_create with the concrete objective.',
  '2. Call mission_plan to commit a task dependency DAG (revision must equal the current revision + 1; a flat agenda has empty dependencies).',
  '3. Stop there. The mission-driver runtime claims tasks, dispatches subagents, and independently verifies each one until the mission completes.',
  'Never use mission tools for short single-turn work.',
].join('\n')

type ParsedCommand = { kind: 'status' } | { kind: 'cancel' } | { kind: 'create'; objective: string }

/** `/mission` grammar: bare/`status` reads, `cancel` cancels, anything else is an objective. */
function parseCommand(rawInput: string): ParsedCommand {
  const input = rawInput.trim()
  const control = input.toLowerCase()
  if (control.length === 0 || control === 'status') return { kind: 'status' }
  if (control === 'cancel') return { kind: 'cancel' }
  return { kind: 'create', objective: input }
}

/** Compact human-readable status for the direct `/mission` UI. */
function renderStatus(view: MissionView): string {
  const tasks = view.tasks.map((t) => {
    const mark = t.status === 'DONE' ? '✓' : t.status === 'FAILED' ? '✗' : '•'
    return `  ${mark} ${t.id} [${t.status}]`
  }).join('\n')
  return [
    'Mission',
    `Status: ${view.status}`,
    `Revision: ${view.revision}`,
    `Objective: ${view.objective}`,
    `Tasks (${view.tasks.length}):`,
    tasks.length > 0 ? tasks : '  (no plan committed yet)',
  ].join('\n')
}

/** Execute one parsed human command through the mission domain. */
function executeCommand(ctx: Context, agent: Agent, rawInput: string): CommandResult {
  const mission = ctx.get('mission')
  if (mission === undefined) {
    return { kind: 'error', text: 'The mission service is not available in this composition.' }
  }
  const cmd = parseCommand(rawInput)
  try {
    const current = mission.status(agent)
    switch (cmd.kind) {
      case 'status':
        return current === undefined
          ? { kind: 'success', text: 'No mission yet. Use /mission <objective> to create one.' }
          : { kind: 'success', text: renderStatus(current) }
      case 'cancel': {
        if (current === undefined) return { kind: 'success', text: 'No mission to cancel.' }
        mission.cancel(agent)
        return { kind: 'success', text: 'Mission cancelled.' }
      }
      case 'create': {
        const created = mission.create(agent, { objective: cmd.objective })
        // Queue a follow-up so the model plans the freshly created mission
        // (creation is a direct command; planning is a model action).
        agent.followup(createUserMessage({
          content: [{
            type: 'text',
            text: 'The mission was created. Now call mission_plan to commit a task dependency DAG (revision = current + 1), then stop — the mission-driver runtime will execute the tasks.',
          }],
          source: { kind: 'user' },
        }))
        return { kind: 'success', text: `Mission created.\nObjective: ${created.objective}\nPlanning…` }
      }
    }
  } catch (error) {
    if (error instanceof MissionError) return { kind: 'error', text: `Mission command is not valid: ${error.message}` }
    throw error
  }
}

/**
 * Install the trigger companion: a soft-guidance section and a `/mission`
 * command, each registered whenever its service exists in this scope and
 * re-registered via `internal/service` when the service appears later.
 */
export function apply(ctx: Context): void {
  let sectionRegistered = false
  const registerSection = (): void => {
    if (sectionRegistered) return
    const systemPrompt = ctx.get('systemPrompt')
    if (systemPrompt === undefined) return
    systemPrompt.section({ name: SECTION_NAME, order: SECTION_ORDER, text: GUIDANCE })
    sectionRegistered = true
  }
  registerSection()
  ctx.on('internal/service', (serviceName, value) => {
    if (serviceName !== 'systemPrompt') return
    if (value === undefined) sectionRegistered = false
    else registerSection()
  }, { global: true })

  let commandRegistered = false
  const registerCommand = (): void => {
    if (commandRegistered) return
    const commands = ctx.get('commands')
    if (commands === undefined) return
    commands.register({
      name: COMMAND_NAME,
      description: 'create, plan, or view a long-horizon mission',
      input: { hint: '[<objective>|status|cancel]' },
      handler: (invocation) => executeCommand(ctx, invocation.agent, invocation.rawInput),
    })
    commandRegistered = true
  }
  registerCommand()
  ctx.on('internal/service', (serviceName, value) => {
    if (serviceName !== 'commands') return
    if (value === undefined) commandRegistered = false
    else registerCommand()
  }, { global: true })
}

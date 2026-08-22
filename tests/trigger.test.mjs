// Trigger companion test: the soft-guidance section and the /mission slash
// command, against the real cordis + MissionService with mock systemPrompt and
// commands registries.
// Run: node tests/trigger.test.mjs
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { MissionService } from '../lib/index.js'
import { apply as applyTrigger } from '../lib/src/trigger.js'

let failures = 0
function check(name, cond) {
  if (cond) console.log('  ok:', name)
  else { failures++; console.error('  FAIL:', name) }
}

function stubAgent(rawId) {
  const session = Session.create(SessionId(rawId))
  const id = session.id
  const agent = {
    id,
    options: {},
    session,
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    cancel() {},
    whenIdle() { return Promise.resolve() },
  }
  return { agent, session }
}

// Mock registries capture what the trigger companion registers.
const mockCommands = { defs: [], register(def) { this.defs.push(def); return () => {} } }
const mockSystemPrompt = { sections: [], section(def) { this.sections.push(def); return () => {} } }

const ctx = new Context()
ctx.provide('commands', mockCommands)
ctx.provide('systemPrompt', mockSystemPrompt)
await ctx.plugin(AgentRegistry)
await ctx.plugin(MissionService)
const { agent } = stubAgent(`trigger-test-${Math.random()}`)
ctx.agents.register(agent)

await ctx.plugin({ name: 'mission-trigger', inject: [], apply: applyTrigger })

console.log('1. registrations')
const section = mockSystemPrompt.sections.find(s => s.name === 'mission:trigger')
check('guidance section registered (mission:trigger)', section !== undefined)
check('guidance mentions mission_create + mission_plan', section !== undefined && section.text.includes('mission_create') && section.text.includes('mission_plan'))
check('guidance lists trigger phrases', section !== undefined && /mission:|创建任务|create mission/.test(section.text))
const cmd = mockCommands.defs.find(d => d.name === 'mission')
check('/mission command registered', cmd !== undefined)

console.log('2. /mission <objective> creates')
const sig = new AbortController().signal
const create = cmd.handler({ agent, rawInput: 'build a hello world page', attachments: [], signal: sig })
check('create result is success', create.kind === 'success')
const afterCreate = ctx.mission.status(agent)
check('mission created with the objective', afterCreate !== undefined && afterCreate.objective === 'build a hello world page')
check('mission CREATED before plan', afterCreate !== undefined && afterCreate.status === 'CREATED')

console.log('3. /mission (bare) shows status')
const show = cmd.handler({ agent, rawInput: '', attachments: [], signal: sig })
check('status result is success', show.kind === 'success')
check('status text carries the objective', show.text.includes('build a hello world page'))

console.log('4. /mission cancel cancels')
const cancel = cmd.handler({ agent, rawInput: 'cancel', attachments: [], signal: sig })
check('cancel result is success', cancel.kind === 'success')
check('mission CANCELLED after cancel', ctx.mission.status(agent).status === 'CANCELLED')

console.log(failures === 0 ? 'ALL TRIGGER TESTS PASS' : `${failures} TRIGGER TEST FAILURES`)
process.exit(failures === 0 ? 0 : 1)

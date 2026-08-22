// Batch-regenerate every comic PNG under slides/assets/comics using the
// Z-Image Turbo workflow from gen-flux.mjs (imports its exported gen()).
// Subjects: robots / machines / devices / abstract geometric shapes.
// Negative prompt (REQUIRED): no humans, no people, no person, no face, no hands, no human figure.
// Z-Image Turbo is a CFG-distilled model (cfg=1.0, zeroed-out negative in gen-flux.mjs),
// so the "no humans" avoidance is enforced by embedding the negative phrases in the positive prompt.
import { gen } from './gen-flux.mjs'

const NEG = 'no humans, no people, no person, no face, no hands, no human figure'

// Exact target list matches .comfy-temp/verify-dims.mjs (23 canonical assets).
const ASSETS = [
  { name: 'cover', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'a friendly robot agent sprinting toward a glowing goal flag, dynamic pose, speed lines' },
  { name: 'agenda', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'a friendly robot presenting a roadmap chart with milestones and checkpoints' },
  { name: 'agent', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'a thoughtful robot with a glowing lightbulb head and internal gears, thinking and acting' },
  { name: 'eliza', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'a friendly retro computer terminal with a blinking cursor acting as a chatbot program' },
  { name: 'expert', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'an expert system machine with a knowledge base of stacked books feeding an inference engine of connected logic boxes' },
  { name: 'mas', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'several small robots passing glowing message envelopes to each other in a network' },
  { name: 'stack', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'a robot climbing a staircase of stacked capability blocks' },
  { name: 'lesson2023', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'a robot proudly raising a done flag while its own machine sits broken with smoke' },
  { name: 'harness', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'a robot being measured and guided inside a test harness frame with gauges and dials' },
  { name: 'mission', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'a robot scheduler orchestrating a graph of task nodes connected by arrows' },
  { name: 'conclusion', w: 768, h: 1024, style: 'clean bold flat illustration', subject: 'three interlocking gears labeled propose, feedback and commit forming a cycle' },
  { name: 'dsh', w: 832, h: 832, style: 'clean bold flat illustration', subject: 'abstract geometric puzzle pieces snapping together into a modular plugin runtime hub' },
  { name: 'cyber', w: 960, h: 544, style: 'clean bold flat illustration', subject: 'a cybernetic feedback loop diagram with sensors, actuators and circular arrows' },
  { name: 'reasoning', w: 960, h: 544, style: 'clean bold flat illustration', subject: 'a robot exploring multiple branching reasoning paths toward a glowing answer' },
  { name: 'react', w: 960, h: 544, style: 'clean bold flat illustration', subject: 'a robot in a think-act-observe loop with three circular arrows' },
  { name: 'line-shakey', w: 960, h: 264, style: 'minimal black and white line art', subject: 'a wheeled robot pushing a block toward a doorway, with labels perceive, plan, act' },
  { name: 'line-tools', w: 960, h: 264, style: 'minimal black and white line art', subject: 'a boxy robot head with many arms pressing browser, calculator, calendar and API tool icons' },
  { name: 'line-frameworks', w: 960, h: 264, style: 'minimal black and white line art', subject: 'a pipeline of chain links, a team of small robots, a graph of nodes, and a USB-C plug into a tool socket' },
  { name: 'line-increment', w: 960, h: 264, style: 'minimal black and white line art', subject: 'assembled puzzle pieces with one highlighted gap piece being fitted in' },
  { name: 'line-install', w: 960, h: 264, style: 'minimal black and white line art', subject: 'a terminal window showing an install command and a robot taking over a long task' },
  { name: 'line-recovery', w: 960, h: 264, style: 'minimal black and white line art', subject: 'a machine restarting after a crash and reclaiming a lease token' },
  { name: 'line-references', w: 960, h: 264, style: 'minimal black and white line art', subject: 'a bookshelf of reference books and link icons' },
  { name: 'line-peas-loop', w: 560, h: 248, style: 'minimal black and white line art', subject: 'a control loop diagram labeled performance, environment, actuators and sensors' }
]

const results = []
let failed = 0
for (let i = 0; i < ASSETS.length; i++) {
  const a = ASSETS[i]
  const prompt = `${a.subject}, ${a.style}, ${NEG}`
  const seed = 2000 + i
  try {
    const r = await gen({ prompt, out: `${a.name}.png`, width: a.w, height: a.h, seed })
    results.push({ name: a.name, ok: true, bytes: r.bytes, s: r.elapsedS })
    console.log(`[${i + 1}/${ASSETS.length}] ${a.name} OK (${r.bytes} bytes, ${r.elapsedS}s)`)
  } catch (e) {
    failed++
    results.push({ name: a.name, ok: false, error: String((e && e.message) || e) })
    console.error(`[${i + 1}/${ASSETS.length}] ${a.name} FAILED: ${(e && e.message) || e}`)
  }
}

console.log('\n=== SUMMARY ===')
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.ok ? '' : ' :: ' + r.error}`)
console.log(`\n${ASSETS.length - failed}/${ASSETS.length} succeeded, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

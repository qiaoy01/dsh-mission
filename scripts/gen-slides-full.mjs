// Generate the full slide-deck comic/illustration set via local ComfyUI.
// Reuses the workflow shape from gen-comics-cartoon.mjs (CheckpointLoaderSimple ->
// CLIPTextEncode -> EmptyLatentImage -> KSampler -> VAEDecode -> SaveImage), but
// expands to the full deck in cartoon-realistic (semi-realistic anime) style.
// Every subject is a robot, machine, device, or abstract/geometric object — never a human.
// Node 22+ (global fetch). Run: node scripts/gen-slides-full.mjs
import { writeFile, rm, readdir } from 'node:fs/promises'

const BASE = 'http://127.0.0.1:8188'
const CKPT = 'majicmixRealistic_v7.safetensors'
const OUT = 'slides/assets/comics'

// Required no-human negative prompt (must always be present).
const NEG_NO_HUMAN = 'no humans, no people, no person, no face, no hands, no crowd, no human figure, '

// Single negative prompt: required no-human terms + illustration quality negatives.
const NEG = NEG_NO_HUMAN +
  'lowres, bad anatomy, bad hands, extra fingers, missing fingers, blurry, ' +
  'worst quality, low quality, jpeg artifacts, watermark, signature, text, logo, nsfw, nude, deformed, ' +
  'photo, photographic, realistic photo, 3d render, cgi, oversaturated'

const STYLE_SEMI = 'semi-realistic anime, cartoon-realistic, detailed digital illustration, ' +
  'clean linework, soft shading, vibrant colors, '

// width/height must be multiples of 8. Aspect ratios preserved from the current files.
const comics = [
  // ---- semi-realistic anime (portrait 768x1024) ----
  {
    id: 'cover', seed: 7001, width: 768, height: 1024,
    pos: STYLE_SEMI + 'a sleek robot agent with a glowing blue core in its chest, standing confidently on a ' +
      'futuristic command platform, holographic mission timeline and a glowing dependency graph of connected ' +
      'nodes floating around it, deep blue violet cyan color scheme, cinematic rim lighting, no text'
  },
  {
    id: 'eliza', seed: 7002, width: 768, height: 1024,
    pos: STYLE_SEMI + 'a vintage 1960s computer terminal with a green phosphor CRT screen showing faint ' +
      'unreadable green monospace characters, a chunky keyboard and a teletype line printer beside it, on a ' +
      'wooden desk in a dimly lit retro computer lab, warm ambient light, subtle film grain, no readable text'
  },
  {
    id: 'agenda', seed: 7003, width: 768, height: 1024,
    pos: STYLE_SEMI + 'a clean roadmap illustration with a winding path rising from bottom to top, milestones ' +
      'marked with glowing nodes and small icons for history, agents, tools, frameworks, mission runtime and ' +
      'conclusion, a small cute robot walking the path, blue violet cyan palette, no text'
  },
  {
    id: 'agent', seed: 7004, width: 768, height: 1024,
    pos: STYLE_SEMI + 'a single clean cute robot agent with visible sensors on its head, actuators as arms and ' +
      'wheels, and a glowing performance gauge on its chest, standing in a simple clean environment with a soft ' +
      'grid floor, clean composition, blue cyan palette, no text'
  },
  {
    id: 'expert', seed: 7005, width: 768, height: 1024,
    pos: STYLE_SEMI + 'an expert system illustration: a glowing brain-shaped knowledge base of rules connected ' +
      'by lines to a turning inference engine gear, with a small robot technician inspecting it, floating ' +
      'medical and chemistry symbols around, blue violet cyan palette, no text'
  },
  {
    id: 'mas', seed: 7006, width: 768, height: 1024,
    pos: STYLE_SEMI + 'multiple small cute robots cooperating on a shared task, with a glowing reinforcement ' +
      'learning loop of reward signals and arrows flowing between them, a scoreboard and a gradient hill in the ' +
      'background, blue violet cyan palette, no text'
  },
  {
    id: 'stack', seed: 7007, width: 768, height: 1024,
    pos: STYLE_SEMI + 'a capability stack pyramid built of layered glowing blocks, from a wide foundation layer ' +
      'rising through narrower layers to a bright glowing apex, a small robot climbing the pyramid, ' +
      'blue violet cyan palette, no text'
  },
  {
    id: 'lesson2023', seed: 7009, width: 768, height: 1024,
    pos: STYLE_SEMI + 'a proud robot raising an arm in triumph to claim the task is done while the machine ' +
      'behind it is broken and smoking, humorous single panel, no text'
  },
  {
    id: 'harness', seed: 7010, width: 768, height: 1024,
    pos: STYLE_SEMI + 'a robot wearing a harness and reins connected to a control console, being guided and ' +
      'measured along a track, blue violet palette, no text'
  },
  {
    id: 'mission', seed: 7011, width: 768, height: 1024,
    pos: STYLE_SEMI + 'a central robot mission dispatcher at a control desk orchestrating several small robots ' +
      'working on a glowing dependency graph of connected nodes, blue cyan palette, no text'
  },
  {
    id: 'conclusion', seed: 7012, width: 768, height: 1024,
    pos: STYLE_SEMI + 'three stages flowing left to right: a robot proposing an idea with a speech bubble, ' +
      'an environment giving a checkmark feedback loop, and a runtime machine stamping approval, no text'
  },

  // ---- square ----
  {
    id: 'dsh', seed: 7008, width: 832, height: 832,
    pos: STYLE_SEMI + 'a plugin architecture diagram: a glowing central hub core with several plugin modules ' +
      'arranged in a ring around it, each connected by cables to the hub, gear and node icons, ' +
      'blue violet cyan palette on dark background, no text'
  },

  // ---- landscape diagrams (960x544) ----
  {
    id: 'cyber', seed: 7013, width: 960, height: 544,
    pos: STYLE_SEMI + 'a cybernetic feedback loop diagram as a glowing circular system: a controller connected ' +
      'by arrows to an actuator and a sensor feeding back to the controller, with a small robot arm inside the ' +
      'loop, blue violet cyan glow on a dark background, no text'
  },
  {
    id: 'reasoning', seed: 7014, width: 960, height: 544,
    pos: STYLE_SEMI + 'an illustration of AI reasoning: a central question node branching into three thought ' +
      'paths, chain-of-thought as linked glowing beads, a tree-of-thought with branching branches, and several ' +
      'sampled answers converging on one consistent result, blue violet cyan palette, no text'
  },
  {
    id: 'react', seed: 7015, width: 960, height: 544,
    pos: STYLE_SEMI + 'a ReAct reasoning loop diagram: a robot control unit thinking connected by an arrow to a ' +
      'robot gripper arm acting, connected by an arrow to a robot camera sensor observing, looping back to the ' +
      'control unit in a triangle cycle, glowing arrows, blue violet cyan palette, no text'
  },

  // ---- concrete wide banners (960x264) ----
  {
    id: 'line-shakey', seed: 7016, width: 960, height: 264,
    pos: STYLE_SEMI + 'a concrete scene of Shakey the Robot, a boxy 1960s robot on wheels with a camera head and ' +
      'a bump sensor, pushing a large wooden block across a room floor toward a doorway, ramps and blocks in the ' +
      'room, warm lab lighting, no text'
  },
  {
    id: 'line-tools', seed: 7017, width: 960, height: 264,
    pos: STYLE_SEMI + 'a large friendly robot with multiple arms reaching out to press four glowing tool panels: ' +
      'a web browser window, a calculator, a calendar, and an API plug icon, connected by bright lines, no text'
  },
  {
    id: 'line-frameworks', seed: 7018, width: 960, height: 264,
    pos: STYLE_SEMI + 'a horizontal pipeline left to right: a chain link, then a group of small cute robots, ' +
      'then a glowing node graph, then a plug inserting into a wall socket, no text'
  },
  {
    id: 'line-increment', seed: 7019, width: 960, height: 264,
    pos: STYLE_SEMI + 'a colorful jigsaw puzzle mostly complete with one empty gap and a bright cyan puzzle ' +
      'piece being inserted into the gap, no text'
  },
  {
    id: 'line-install', seed: 7021, width: 960, height: 264,
    pos: STYLE_SEMI + 'a terminal window with a command line on the left connected by an arrow to a cute robot ' +
      'on the right taking over, no text'
  },
  {
    id: 'line-recovery', seed: 7022, width: 960, height: 264,
    pos: STYLE_SEMI + 'a cute robot that has fallen down on the left, then restarting and resuming work on the ' +
      'right, with a progress arrow between, no text'
  },
  {
    id: 'line-references', seed: 7023, width: 960, height: 264,
    pos: STYLE_SEMI + 'a bookshelf with a few colorful books and a chain link icon, no text'
  },

  // ---- peas-loop banner (560x248) ----
  {
    id: 'line-peas-loop', seed: 7020, width: 560, height: 248,
    pos: STYLE_SEMI + 'a circular loop diagram with four nodes observe reason act observe connected by glowing ' +
      'arrows, no text'
  }
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function workflow(c) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: c.pos, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: c.width, height: c.height, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: c.seed, steps: 25, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras',
        denoise: 1.0, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0]
      }
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'slides_' + c.id, images: ['6', 0] } }
  }
}

async function gen(c) {
  const t0 = Date.now()
  const resp = await fetch(`${BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow(c), client_id: 'dsh-slides-full' })
  })
  const j = await resp.json()
  if (j && j.node_errors && Object.keys(j.node_errors).length) {
    throw new Error(`node_errors for ${c.id}: ${JSON.stringify(j.node_errors)}`)
  }
  const pid = j.prompt_id
  if (!pid) throw new Error(`no prompt_id for ${c.id}: ${JSON.stringify(j)}`)

  for (let i = 0; i < 450; i++) {
    await sleep(2000)
    const h = await (await fetch(`${BASE}/history/${pid}`)).json()
    const entry = h && h[pid]
    if (!entry) continue
    if (entry.status && entry.status.status_str === 'error') {
      throw new Error(`exec error for ${c.id}: ${JSON.stringify(entry.status)}`)
    }
    const img = entry.outputs && entry.outputs['7'] && entry.outputs['7'].images && entry.outputs['7'].images[0]
    if (img) {
      const url = `${BASE}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      await writeFile(`${OUT}/${c.id}.png`, buf)
      console.log(`OK ${c.id} -> ${c.id}.png (${buf.length} bytes, ${Math.round((Date.now() - t0) / 1000)}s)`)
      return
    }
  }
  throw new Error(`timeout for ${c.id}`)
}

const failed = []
for (const c of comics) {
  try {
    await gen(c)
  } catch (e) {
    console.error(`FAIL ${c.id}: ${e.message}`)
    failed.push(c)
  }
}

// One retry pass for failures (bump seed to avoid a reproducible local failure).
if (failed.length) {
  console.log(`\nRetrying ${failed.length} failed image(s)...`)
  for (const c of failed) {
    c.seed += 999
    try {
      await gen(c)
      console.log(`RECOVERED ${c.id}`)
    } catch (e) {
      console.error(`STILL FAIL ${c.id}: ${e.message}`)
    }
  }
}

// clean up SaveImage leftovers (slides_*_00001_.png) that land in the output dir
const files = await readdir(OUT)
let cleaned = 0
for (const f of files) {
  if (f.startsWith('slides_')) {
    await rm(`${OUT}/${f}`)
    cleaned++
  }
}
console.log(`cleaned ${cleaned} SaveImage leftover(s)`)

// final verification
const missing = []
for (const c of comics) {
  try {
    const { stat } = await import('node:fs/promises')
    const s = await stat(`${OUT}/${c.id}.png`)
    if (s.size < 1000) missing.push(`${c.id} (too small: ${s.size})`)
  } catch {
    missing.push(c.id)
  }
}
if (missing.length) {
  console.error('MISSING/INVALID: ' + missing.join(', '))
  process.exit(1)
}
console.log('ALL DONE — ' + comics.length + ' images verified')

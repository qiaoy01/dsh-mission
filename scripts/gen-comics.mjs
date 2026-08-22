// Generate SFW manga-style comics via local ComfyUI for the slide deck.
// Node 22+ (global fetch). Run: node scripts/gen-comics.mjs
import { writeFile } from 'node:fs/promises'

const BASE = 'http://127.0.0.1:8188'
const CKPT = 'majicmixRealistic_v7.safetensors'
const OUT = 'slides/assets/comics'

const NEG = 'lowres, bad anatomy, bad hands, extra fingers, missing fingers, blurry, ' +
  'worst quality, low quality, jpeg artifacts, watermark, signature, text, logo, nsfw, nude, deformed, ' +
  'photo, photographic, realistic photo, 3d render, cgi'

const STYLE = 'anime illustration, comic book style, cel shading, bold clean outlines, vibrant flat colors, '

const comics = [
  {
    id: 'cover', seed: 1001,
    pos: STYLE + 'a cute friendly white and blue robot agent wearing a small harness and backpack, ' +
      'running forward through a futuristic circuit board landscape toward a glowing goal flag on a hill, ' +
      'blue violet cyan color palette, dynamic composition, no text'
  },
  {
    id: 'agent', seed: 1002,
    pos: STYLE + 'a small cute robot thinking with a glowing lightbulb above its head, surrounded by floating ' +
      'tool icons, a book and a map, representing an AI agent that reasons and acts, ' +
      'blue color palette, no text'
  },
  {
    id: 'lesson2023', seed: 1003,
    pos: STYLE + 'a proud robot raising its hand to claim the task is done while the machine behind it is broken ' +
      'and smoking, humorous single panel comic, no text'
  },
  {
    id: 'harness', seed: 1004,
    pos: STYLE + 'a robot wearing a harness and reins connected to a control console, being guided and measured ' +
      'along a track, metaphor of a harness, blue violet palette, no text'
  },
  {
    id: 'mission', seed: 1005,
    pos: STYLE + 'a central robot mission dispatcher at a control desk orchestrating several small robots working ' +
      'on a glowing dependency graph of connected nodes, blue cyan palette, no text'
  },
  {
    id: 'conclusion', seed: 1006,
    pos: STYLE + 'three stages flowing left to right: a robot proposing an idea with a speech bubble, ' +
      'an environment giving a checkmark feedback loop, and a runtime machine stamping approval, no text'
  }
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function workflow(c) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: c.pos, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 768, height: 1024, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: c.seed, steps: 25, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras',
        denoise: 1.0, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0]
      }
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'comic_' + c.id, images: ['6', 0] } }
  }
}

async function gen(c) {
  const t0 = Date.now()
  const resp = await fetch(`${BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow(c), client_id: 'dsh-slides' })
  })
  const j = await resp.json()
  if (j && j.node_errors && Object.keys(j.node_errors).length) {
    throw new Error(`node_errors for ${c.id}: ${JSON.stringify(j.node_errors)}`)
  }
  const pid = j.prompt_id
  if (!pid) throw new Error(`no prompt_id for ${c.id}: ${JSON.stringify(j)}`)

  for (let i = 0; i < 150; i++) {
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

for (const c of comics) {
  await gen(c)
}
console.log('ALL DONE')

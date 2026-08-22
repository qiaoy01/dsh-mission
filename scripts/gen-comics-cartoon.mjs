// Regenerate the 8 line-*.png banner images in CARTOON style via local ComfyUI.
// Reuses the workflow from gen-comics.mjs but with the CARTOON style instead of
// line-art. Overwrites the same filenames (line-shakey.png, ...).
// Node 22+ (global fetch). Run: node scripts/gen-comics-cartoon.mjs
import { writeFile, rm } from 'node:fs/promises'

const BASE = 'http://127.0.0.1:8188'
const CKPT = 'majicmixRealistic_v7.safetensors'
const OUT = 'slides/assets/comics'

const NEG = 'lowres, bad anatomy, bad hands, extra fingers, missing fingers, blurry, ' +
  'worst quality, low quality, jpeg artifacts, watermark, signature, text, logo, nsfw, nude, deformed, ' +
  'photo, photographic, realistic photo, 3d render, cgi'

const STYLE = 'anime illustration, comic book style, cel shading, bold clean outlines, vibrant flat colors, '

// width/height must be multiples of 8 (banner aspect ratios from the line-art set).
const comics = [
  {
    id: 'line-shakey', seed: 2001, width: 960, height: 264,
    pos: STYLE + 'a cute box shaped robot with an antenna pushing a block toward a doorway in a room, ' +
      'with colorful arrows showing a perceive plan act cycle, no text'
  },
  {
    id: 'line-tools', seed: 2002, width: 960, height: 264,
    pos: STYLE + 'a friendly square headed robot reaching out with multiple arms to press four glowing icons: ' +
      'a browser window, a calculator, a calendar, and a plug, representing function calling, no text'
  },
  {
    id: 'line-frameworks', seed: 2003, width: 960, height: 264,
    pos: STYLE + 'a horizontal pipeline left to right: a chain link, then a group of small cute robots, ' +
      'then a glowing node graph, then a plug inserting into a wall socket, no text'
  },
  {
    id: 'line-increment', seed: 2004, width: 960, height: 264,
    pos: STYLE + 'a colorful jigsaw puzzle mostly complete with one empty gap and a bright cyan puzzle piece ' +
      'being inserted into the gap, no text'
  },
  {
    id: 'line-peas-loop', seed: 2005, width: 560, height: 248,
    pos: STYLE + 'a circular loop diagram with four nodes observe reason act observe connected by colorful arrows, no text'
  },
  {
    id: 'line-install', seed: 2006, width: 960, height: 264,
    pos: STYLE + 'a terminal window with a command line on the left connected by an arrow to a cute robot ' +
      'on the right taking over, no text'
  },
  {
    id: 'line-recovery', seed: 2007, width: 960, height: 264,
    pos: STYLE + 'a cute robot that has fallen down on the left, then restarting and resuming work on the right, ' +
      'with a progress arrow between, no text'
  },
  {
    id: 'line-references', seed: 2008, width: 960, height: 264,
    pos: STYLE + 'a bookshelf with a few colorful books and a chain link icon, no text'
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
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'cartoon_' + c.id, images: ['6', 0] } }
  }
}

async function gen(c) {
  const t0 = Date.now()
  const resp = await fetch(`${BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow(c), client_id: 'dsh-slides-cartoon' })
  })
  const j = await resp.json()
  if (j && j.node_errors && Object.keys(j.node_errors).length) {
    throw new Error(`node_errors for ${c.id}: ${JSON.stringify(j.node_errors)}`)
  }
  const pid = j.prompt_id
  if (!pid) throw new Error(`no prompt_id for ${c.id}: ${JSON.stringify(j)}`)

  for (let i = 0; i < 300; i++) {
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

// clean up SaveImage leftovers (cartoon_*_00001_.png) that land in the output dir
const { readdir } = await import('node:fs/promises')
const files = await readdir(OUT)
let cleaned = 0
for (const f of files) {
  if (f.startsWith('cartoon_')) {
    await rm(`${OUT}/${f}`)
    cleaned++
  }
}
console.log(`cleaned ${cleaned} SaveImage leftover(s)`)
console.log('ALL DONE')

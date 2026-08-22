// Generate images via local ComfyUI using Z-Image Turbo (Alibaba's distilled 6B DiT,
// a Flux-family model that is general-scene focused, not human/portrait focused).
// Node 22+ (global fetch). Run:
//   node scripts/gen-flux.mjs "prompt here" [output.png] [--seed N] [--width W] [--height H]
import { writeFile } from 'node:fs/promises'

const BASE = 'http://127.0.0.1:8188'
const OUT = 'slides/assets/comics'

// Z-Image Turbo model family. NOTE: unlike Flux, Z-Image uses a SINGLE Qwen3-4B
// text encoder (not the T5-XXL + CLIP-L dual pair), so it loads via CLIPLoader
// with type "lumina2" rather than DualCLIPLoader.
const UNET = 'z_image_turbo_bf16.safetensors' // diffusion model (UNETLoader)
const CLIP = 'qwen_3_4b_fp8.safetensors' // Qwen3-4B text encoder (fp8)
const CLIP_TYPE = 'lumina2'
const VAE = 'ae.safetensors' // Flux VAE

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Minimal txt2img workflow (API format), following the official ComfyUI
// "Text to Image (Z-Image-Turbo)" blueprint:
// UNETLoader + CLIPLoader(lumina2) + VAELoader -> CLIPTextEncode -> ConditioningZeroOut
// -> ModelSamplingAuraFlow(shift 3) + EmptySD3LatentImage -> KSampler -> VAEDecode -> SaveImage
export function workflow(opts) {
  const {
    prompt,
    seed = 0,
    width = 1024,
    height = 1024,
    steps = 8,
    cfg = 1.0,
    sampler = 'res_multistep',
    scheduler = 'simple',
    shift = 3.0,
    prefix = 'flux'
  } = opts
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: UNET, weight_dtype: 'default' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: CLIP, type: CLIP_TYPE } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: VAE } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
    '7': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift } },
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed, steps, cfg, sampler_name: sampler, scheduler, denoise: 1.0,
        model: ['7', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0]
      }
    },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    '10': { class_type: 'SaveImage', inputs: { filename_prefix: prefix, images: ['9', 0] } }
  }
}

export async function gen(opts) {
  const t0 = Date.now()
  const resp = await fetch(`${BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow(opts), client_id: 'dsh-flux' })
  })
  const j = await resp.json()
  if (j && j.node_errors && Object.keys(j.node_errors).length) {
    throw new Error(`node_errors: ${JSON.stringify(j.node_errors)}`)
  }
  const pid = j.prompt_id
  if (!pid) throw new Error(`no prompt_id: ${JSON.stringify(j)}`)

  for (let i = 0; i < 300; i++) {
    await sleep(2000)
    const h = await (await fetch(`${BASE}/history/${pid}`)).json()
    const entry = h && h[pid]
    if (!entry) continue
    if (entry.status && entry.status.status_str === 'error') {
      throw new Error(`exec error: ${JSON.stringify(entry.status)}`)
    }
    const img = entry.outputs && entry.outputs['10'] && entry.outputs['10'].images && entry.outputs['10'].images[0]
    if (img) {
      const url = `${BASE}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      const outName = opts.out || img.filename
      await writeFile(`${OUT}/${outName}`, buf)
      const s = Math.round((Date.now() - t0) / 1000)
      console.log(`OK ${outName} (${buf.length} bytes, ${s}s, seed=${opts.seed})`)
      return { filename: outName, bytes: buf.length, elapsedS: s }
    }
  }
  throw new Error('timeout waiting for history')
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = {
    prompt: 'a friendly robot among gears, clean composition, no humans',
    out: 'flux_robot_test.png',
    seed: 0,
    width: 1024,
    height: 1024
  }
  const positional = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--seed') opts.seed = Number(args[++i])
    else if (a === '--width') opts.width = Number(args[++i])
    else if (a === '--height') opts.height = Number(args[++i])
    else positional.push(a)
  }
  if (positional[0]) opts.prompt = positional[0]
  if (positional[1]) opts.out = positional[1]
  return opts
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const opts = parseArgs(process.argv)
  await gen(opts)
}

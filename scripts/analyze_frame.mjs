// analyze_frame.mjs <input.jpg> <x0> <y0> <x1> <y1> [scaleW]
// Samples a region of a JPEG (normalized 0-100 coords) and prints color stats.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [jpg, x0s, y0s, x1s, y1s, scaleWs] = process.argv.slice(2);
const x0 = parseFloat(x0s), y0 = parseFloat(y0s), x1 = parseFloat(x1s), y1 = parseFloat(y1s);
const scaleW = parseInt(scaleWs || '80', 10);

const tmp = path.join(os.tmpdir(), `af_${Date.now()}.raw`);
try {
  execFileSync('ffmpeg', [
    '-y', '-i', jpg, '-vf', `scale=${scaleW}:-1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', tmp,
  ], { stdio: 'ignore' });
  const buf = fs.readFileSync(tmp);
  // need height: infer from jpg dims via ffprobe
  const dims = execFileSync('ffprobe', [
    '-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=s=x:p=0', jpg,
  ]).toString().trim().split('x').map(Number);
  const W = dims[0], H = dims[1];
  const scaleH = Math.round(H * scaleW / W);
  const px = (X, Y) => { const ix = X * 3 + Y * scaleW * 3; return [buf[ix], buf[ix+1], buf[ix+2]]; };
  const sx0 = Math.round(x0/100*scaleW), sy0 = Math.round(y0/100*scaleH);
  const sx1 = Math.round(x1/100*scaleW), sy1 = Math.round(y1/100*scaleH);
  const hist = new Map();
  let n = 0, rSum=0, gSum=0, bSum=0, minL=255, maxL=0;
  for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
    const [r,g,b] = px(x,y);
    const lum = 0.299*r+0.587*g+0.114*b;
    rSum+=r; gSum+=g; bSum+=b; n++;
    if (lum<minL) minL=lum; if (lum>maxL) maxL=lum;
    const key = `${r>>5},${g>>5},${b>>5}`; // 8 buckets per channel
    hist.set(key, (hist.get(key)||0)+1);
  }
  const avg = [rSum/n, gSum/n, bSum/n].map(v=>v.toFixed(0));
  console.log(`region ${x0},${y0}->${x1},${y1} (scaled ${scaleW}x${scaleH})`);
  console.log(`avg_rgb=${avg.join(',')}  lum_min=${minL.toFixed(0)} lum_max=${maxL.toFixed(0)}`);
  const top = [...hist.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 12)
    .map(([k,v])=>`${k}(${(100*v/n).toFixed(1)}%)`).join('  ');
  console.log(`top_colors: ${top}`);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}

/**
 * 잔별 별 카드 (star-card.js)
 * ------------------------------------------------------------
 * 휴대폰 브라우저 안에서 별 카드를 그리고,
 *   - 이미지(PNG, 1080x1920)
 *   - 움직이는 영상(MP4, H.264, 별자리가 60초에 한 바퀴 도는 속도)
 * 로 만들어 공유창(인스타그램·카톡·사진첩)으로 보냅니다.
 * 서버 비용은 들지 않습니다.
 *
 * 의존성: mp4-muxer (영상 저장에만 필요)
 *   npm install mp4-muxer
 *   또는 <script type="module"> 에서
 *   import { Muxer, ArrayBufferTarget } from "https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/+esm";
 */
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

// ------------------------------------------------------------
// 1. 설정
// ------------------------------------------------------------
const W = 1080, H = 1920, CX = 540, CY = 520;
const TAU = Math.PI * 2;
const SECONDS_PER_TURN = 60;           // 별자리 한 바퀴에 걸리는 시간
// 사이트와 같은 글꼴 (index.html 에서 Google Fonts 로 불러옵니다)
export const FONT_FAMILY = '"Noto Sans KR", system-ui, sans-serif'; // 안내 글자
export const SERIF_FAMILY = '"Gowun Batang", "Nanum Myeongjo", serif'; // 별 문장 — 별 카드(StarCard)의 본문과 같은 글꼴
export const SITE = "https://janbyeol.com";

const TYPES = {
  mine: {           // 내가 띄운 별
    label: "내가 띄운 별",
    accent: [245, 213, 138], core: "#FFF4D6",
    main: "평범한 내 하루가 누군가를 위로해 줬어요.",
    sub: (s) => (s.empathyCount > 0 ? `이 별에 ${s.empathyCount}명이 온기를 더했어요` : "오늘의 하루가 별이 되었어요"),
  },
  comfort: {        // 나를 비춘 별
    label: "나를 비춘 별",
    accent: [184, 181, 255], core: "#F1F0FF",
    main: "오늘 누군가의 한마디가 나를 위로해 줬어요.",
    sub: () => "당신의 오늘도 누군가의 별이 될 수 있어요",
  },
};

// ------------------------------------------------------------
// 2. 별 데이터 → 카드 그리기
// ------------------------------------------------------------
/**
 * star = {
 *   id: "s-muwcvicd-pi0j",
 *   text: "처음으로 커피를 안 마셨다. 별일 아닌데 뿌듯하다.",
 *   category: "일상",
 *   createdAt: "2026-10-22T09:58:00+09:00",
 *   empathyCount: 12,       // 받은 온기 수
 *   color: [255, 226, 150], // (선택) 하늘에서 보이는 이 별의 마음 색 — 주인공 별이 이 색으로 빛납니다
 *   allowCardShare: true,   // 작성자가 '다른 사람이 카드로 간직해도 괜찮아요'에 동의했는지
 * }
 * type = "mine" | "comfort"
 */
function makeRng(seed) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
function hashSeed(str) { let h = 7; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 2147483647; return h; }

function buildScene(star) {
  // 별 id로 씨앗을 정해서 같은 별은 늘 같은 하늘, 다른 별은 다른 하늘이 되게 합니다.
  const r = makeRng(hashSeed(star.id || star.text));
  const bg = Array.from({ length: 480 }, () => ({
    x: r() * W, y: r() * H, s: r() < 0.9 ? r() * 1.6 + 0.4 : r() * 2.4 + 1.4,
    a: r() * 0.6 + 0.3, k: 10 + Math.floor(r() * 15), ph: r(), warm: r() < 0.2,
  }));
  const cluster = Array.from({ length: 110 }, () => {
    const u = r() * TAU, v = Math.acos(2 * r() - 1), rad = Math.cbrt(r());
    return { x: Math.sin(v) * Math.cos(u) * 470 * rad, y: Math.cos(v) * 250 * rad,
             z: Math.sin(v) * Math.sin(u) * 470 * rad, s: r() * 1.8 + 0.8, ph: r() };
  });
  const con = [0, 1, 3, 4].map((i) => {
    const side = i < 2 ? -1 : 1, near = i === 1 || i === 3;
    return [side * (near ? 190 + r() * 60 : 340 + r() * 50), (r() - 0.5) * 240, (r() - 0.5) * 260];
  });
  con.splice(2, 0, [0, 0, 0]); // 가운데가 이 카드의 주인공 별
  return { bg, cluster, con };
}

function project(p, th) {
  const TILT = 0.28;
  const x = p[0] * Math.cos(th) + p[2] * Math.sin(th);
  let z = -p[0] * Math.sin(th) + p[2] * Math.cos(th);
  const y = p[1] * Math.cos(TILT) - z * Math.sin(TILT);
  z = p[1] * Math.sin(TILT) + z * Math.cos(TILT);
  const sc = 1100 / (1100 + z);
  return { x: CX + x * sc, y: CY + y * sc, sc };
}

/** 카드에 옮길 글 다듬기 — 빈 줄·앞뒤 공백을 걷어내고, 문단 사이는 한 줄로만 */
export function cleanText(text = "") {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function wrapLines(ctx, text, maxW, maxLines = 5) {
  const lines = [];
  for (const para of cleanText(text).split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      // 띄어쓰기 없이 아주 긴 낱말은 글자 단위로 잘라 넣습니다 (화면 밖으로 넘치지 않게)
      for (const piece of splitLongWord(ctx, w, maxW)) {
        const t = line ? line + " " + piece : piece;
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = piece; } else line = t;
      }
    }
    if (line) lines.push(line);
  }
  if (!lines.length) lines.push("");
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, "…"); }
  return lines;
}

function splitLongWord(ctx, word, maxW) {
  if (ctx.measureText(word).width <= maxW) return [word];
  const out = []; let cur = "";
  for (const ch of word) {
    if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function spaced(ctx, txt, x, y, sp) {
  const chars = [...txt];
  const w = chars.reduce((s, ch) => s + ctx.measureText(ch).width + sp, -sp);
  let cx = x - w / 2; ctx.textAlign = "left";
  for (const ch of chars) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
  ctx.textAlign = "center";
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

/** t = 지금까지 흐른 초. 이미지는 0, 영상은 프레임마다 증가 */
export function drawCard(ctx, star, type, scene, t) {
  const C = TYPES[type];
  const ACC = (a) => `rgba(${C.accent.join(",")},${a})`;
  const loop = t / SECONDS_PER_TURN;     // 0 → 1 이 한 바퀴

  // 하늘
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#04050a"); g.addColorStop(0.55, "#0b0f26"); g.addColorStop(1, "#141a3e");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const neb = (x, y, rx, col) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, rx); rg.addColorStop(0, col); rg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); };
  neb(760 + 30 * Math.sin(TAU * loop), 340, 620, "rgba(84,64,170,.40)");
  neb(220, 1650, 560, "rgba(30,60,140,.30)");

  // 배경 별 반짝임
  for (const s of scene.bg) {
    const a = s.a * (0.55 + 0.45 * Math.sin(TAU * (loop * s.k + s.ph)));
    ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, TAU);
    ctx.fillStyle = s.warm ? `rgba(255,232,180,${a})` : `rgba(225,228,255,${a})`;
    ctx.shadowColor = "rgba(220,225,255,.8)"; ctx.shadowBlur = s.s * 3; ctx.fill();
  }
  ctx.shadowBlur = 0;

  // 성단 + 별자리 (3D 회전)
  const th = TAU * loop;
  for (const c of scene.cluster) {
    const p = project([c.x, c.y, c.z], th);
    const depth = Math.max(0, Math.min(1, (p.sc - 0.7) / 0.6));
    const a = (0.25 + 0.6 * depth) * (0.7 + 0.3 * Math.sin(TAU * (12 * loop + c.ph)));
    ctx.beginPath(); ctx.arc(p.x, p.y, c.s * p.sc, 0, TAU);
    ctx.fillStyle = `rgba(230,232,255,${a})`; ctx.fill();
  }
  const P = scene.con.map((p) => project(p, th));
  ctx.lineWidth = 2;
  for (let i = 0; i < P.length - 1; i++) {
    ctx.strokeStyle = ACC(0.18 + 0.3 * Math.min(1, (P[i].sc + P[i + 1].sc) / 2 - 0.6));
    ctx.beginPath(); ctx.moveTo(P[i].x, P[i].y); ctx.lineTo(P[i + 1].x, P[i + 1].y); ctx.stroke();
  }
  P.forEach((p, i) => {
    if (i === 2) return;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 * p.sc, 0, TAU); ctx.fillStyle = ACC(0.95);
    ctx.shadowColor = ACC(0.9); ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
  });

  // 주인공 별 — 하늘에서 보이던 그 별의 색으로
  const HERO = (a) => `rgba(${(star.color || C.accent).join(",")},${a})`;
  const pulse = 1 + 0.07 * Math.sin(TAU * 10 * loop);
  const hg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 190 * pulse);
  hg.addColorStop(0, HERO(0.6)); hg.addColorStop(0.35, HERO(0.14)); hg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(CX, CY, 190 * pulse, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(CX, CY, 23, 0, TAU); ctx.fillStyle = C.core;
  ctx.shadowColor = HERO(0.95); ctx.shadowBlur = 50; ctx.fill(); ctx.shadowBlur = 0;

  // 글자
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#9AA0C3"; ctx.font = `400 34px ${FONT_FAMILY}`; spaced(ctx, C.label, CX, 338, 8);

  const tag = type === "comfort" ? "누군가의 사소한 하루" : (star.category || "일상");
  ctx.font = `400 32px ${FONT_FAMILY}`;
  const tw = ctx.measureText(tag).width + 60;
  ctx.strokeStyle = ACC(0.6); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(CX - tw / 2, 792, tw, 64, 32); ctx.stroke();
  ctx.fillStyle = ACC(1); ctx.fillText(tag, CX, 836);

  // 짧은 글은 크게, 긴 글은 한 단계 작게 — 날짜 줄과 겹치지 않도록 (최대 5줄)
  ctx.fillStyle = "#E8EAF6";
  ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 12;
  ctx.font = `400 54px ${SERIF_FAMILY}`;
  let lines = wrapLines(ctx, star.text, 820, 99), lh = 86;
  if (lines.length > 4) {
    ctx.font = `400 46px ${SERIF_FAMILY}`;
    lines = wrapLines(ctx, star.text, 840, 5); lh = 74;
  }
  lines.forEach((ln, i) => ctx.fillText(ln, CX, 950 + i * lh));
  ctx.shadowBlur = 0;

  ctx.font = `400 32px ${FONT_FAMILY}`; ctx.fillStyle = "#9AA0C3";
  spaced(ctx, formatDate(star.createdAt) + (type === "comfort" ? " · 오늘 나를 비춘 별" : ""), CX, 1325, 3);
  ctx.font = `400 40px ${SERIF_FAMILY}`; ctx.fillStyle = "#F5D58A"; ctx.fillText(C.main, CX, 1430);
  ctx.font = `400 33px ${FONT_FAMILY}`; ctx.fillStyle = "#C9CCE4"; ctx.fillText(C.sub(star), CX, 1488);
  ctx.font = `700 44px ${FONT_FAMILY}`; ctx.fillStyle = "#E8EAF6"; spaced(ctx, "잔별", CX, 1590, 8);
  ctx.font = `400 30px ${FONT_FAMILY}`; ctx.fillStyle = "#C9CCE4"; spaced(ctx, "janbyeol.com", CX, 1640, 4);
}

// 남의 별인데 작성자가 동의하지 않았다면 문장을 숨깁니다.
function safeStar(star, type) {
  if (type === "comfort" && !star.allowCardShare) return { ...star, text: "누군가의 사소한 하루가\n오늘 나의 밤을 비췄어요." };
  return star;
}

async function prepare(star, type) {
  await Promise.all([
    document.fonts.load(`400 54px ${SERIF_FAMILY}`, star.text),
    document.fonts.load(`400 34px ${FONT_FAMILY}`, "잔별 내가 띄운 별 나를 비춘"),
    document.fonts.load(`700 44px ${FONT_FAMILY}`, "잔별"),
  ]).catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const s = safeStar(star, type);
  return { canvas, ctx: canvas.getContext("2d"), star: s, scene: buildScene(s) };
}

// ------------------------------------------------------------
// 3. 이미지 만들기
// ------------------------------------------------------------
export async function makeCardImage(star, type) {
  const { canvas, ctx, star: s, scene } = await prepare(star, type);
  drawCard(ctx, s, type, scene, 0);
  return new Promise((res) => canvas.toBlob(res, "image/png"));
}

// ------------------------------------------------------------
// 4. 움직이는 카드(MP4) 만들기
// ------------------------------------------------------------
export function canMakeVideo() {
  return typeof window.VideoEncoder === "function" && typeof window.VideoFrame === "function";
}

/** 지원되는 H.264 설정을 고릅니다. 1080p가 안 되면 720p로 낮춥니다. */
async function pickConfig(fps) {
  const tries = [
    { codec: "avc1.640028", width: 1080, height: 1920 },  // High 4.0
    { codec: "avc1.4d0028", width: 1080, height: 1920 },  // Main 4.0
    { codec: "avc1.42001f", width: 720, height: 1280 },   // Baseline 3.1
  ];
  for (const t of tries) {
    const config = { ...t, bitrate: t.width === 1080 ? 6_000_000 : 3_000_000, framerate: fps, avc: { format: "avc" } };
    const { supported } = await VideoEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
    if (supported) return config;
  }
  return null;
}

/**
 * seconds: 영상 길이 (스토리용 15초 권장, 60초면 한 바퀴가 끊김 없이 반복)
 * onProgress: (0~1) => void  — "별자리를 담는 중…" 진행 표시용
 */
export async function makeCardVideo(star, type, { seconds = 15, fps = 30, onProgress } = {}) {
  if (!canMakeVideo()) throw new Error("VIDEO_NOT_SUPPORTED");
  const config = await pickConfig(fps);
  if (!config) throw new Error("VIDEO_NOT_SUPPORTED");

  const { canvas, ctx, star: s, scene } = await prepare(star, type);
  // 720p로 낮춰야 하는 기기는 작은 캔버스에 축소해서 넣습니다.
  let out = canvas, octx = null;
  if (config.width !== W) {
    out = document.createElement("canvas"); out.width = config.width; out.height = config.height;
    octx = out.getContext("2d");
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: config.width, height: config.height, frameRate: fps },
    fastStart: "in-memory",
  });
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  encoder.configure(config);

  const total = Math.round(seconds * fps);
  for (let i = 0; i < total; i++) {
    if (failure) throw failure;
    drawCard(ctx, s, type, scene, i / fps);
    if (octx) octx.drawImage(canvas, 0, 0, out.width, out.height);
    const frame = new VideoFrame(out, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    // 인코더가 밀리면 잠깐 기다립니다 (휴대폰 메모리 보호)
    while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
    if (i % 10 === 0) { onProgress?.(i / total); await new Promise((r) => setTimeout(r, 0)); }
  }
  await encoder.flush();
  encoder.close();
  muxer.finalize();
  onProgress?.(1);
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

// ------------------------------------------------------------
// 5. 공유창 열기 / 저장
// ------------------------------------------------------------
export function cardLink(star) {
  return `${SITE}/s/${star.id}?utm_source=card&utm_medium=story`;
}

/** 휴대폰 공유창(인스타그램·카톡·사진첩)을 엽니다. 안 되면 파일을 내려받습니다. */
export async function shareCardFile(blob, star) {
  const ext = blob.type === "video/mp4" ? "mp4" : "png";
  const file = new File([blob], `janbyeol-${star.id}.${ext}`, { type: blob.type });
  const link = cardLink(star);

  // 스토리 링크 스티커에 붙일 수 있게 링크를 미리 복사해 둡니다.
  try { await navigator.clipboard.writeText(link); } catch (_) {}

  // 휴대폰에서만 공유창을 씁니다. PC(윈도우·맥)의 공유창은 카카오톡 같은 앱에
  // 영상을 제대로 넘기지 못하는 경우가 많아서, PC에서는 바로 파일로 저장합니다.
  if (isMobileDevice() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";   // 사용자가 공유창을 닫음
    }
  }
  // 공유창이 안 되는 브라우저(PC, 일부 인앱 브라우저)는 다운로드
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return "downloaded";
}

/** 휴대폰·태블릿인지 (아이패드는 맥처럼 보이므로 터치로 한 번 더 확인) */
export function isMobileDevice() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean" && navigator.userAgentData.mobile) return true;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** 카카오톡·인스타그램 앱 안의 브라우저인지 (파일 공유가 막히는 경우가 많음) */
export function isInAppBrowser() {
  return /KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\//i.test(navigator.userAgent);
}

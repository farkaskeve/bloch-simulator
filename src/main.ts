import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  State, Gate, Vec3, C, FIXED, parametric, apply, bloch, rotate, angles,
  fromAngles, fidelity, abs2, fmtAngle,
} from "./quantum";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const ACCENT = 0xff6a1f;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ================================================================ model
let psi0: State = fromAngles(0, 0);
let circuit: Gate[] = [];
let states: State[] = [psi0]; // states[i] = state after i gates

function recompute() {
  states = [psi0];
  for (const g of circuit) states.push(apply(g.matrix, states[states.length - 1]));
}

// ================================================================ scene
const host = $("scene");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
host.appendChild(labels.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(2.6, 1.5, 4.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 14;
controls.rotateSpeed = 0.7;

/** Bloch (x, y, z) → three.js (y, z, x): z up, x towards viewer, y to the right. */
const toThree = ([x, y, z]: Vec3) => new THREE.Vector3(y, z, x);

// Soft daylight: sky-blue from above, warm bounce from below, one sun.
scene.add(new THREE.HemisphereLight(0xdff3ff, 0xc9e7a8, 1.3));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.3);
sun.position.set(3, 5, 4);
scene.add(sun);

// Frosted-glass sphere shell (drawn first so the arrow stays vivid inside it)
const shell = new THREE.Mesh(
  new THREE.SphereGeometry(1, 96, 64),
  new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.35, transparent: true, opacity: 0.28, depthWrite: false,
  }),
);
shell.renderOrder = -1;
scene.add(shell);

// Soft contact shadow under the sphere
{
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(30,80,140,0.28)");
  grad.addColorStop(1, "rgba(30,80,140,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.3;
  scene.add(shadow);
}

const lineMat = (opacity: number) =>
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false });

function circle(radius: number, height: number, plane: "xy" | "xz" | "yz", opacity: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    const u = Math.cos(a) * radius, v = Math.sin(a) * radius;
    pts.push(toThree(plane === "xy" ? [u, v, height] : plane === "xz" ? [u, 0, v] : [0, u, v]));
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(opacity)));
}
circle(1, 0, "xy", 0.95); // equator
circle(1, 0, "xz", 0.55);
circle(1, 0, "yz", 0.55);
for (const h of [-0.5, 0.5]) circle(Math.sqrt(1 - h * h), h, "xy", 0.3);

// Axes + labels
function label(text: string, pos: Vec3, cls = "label") {
  const el = document.createElement("div");
  el.className = cls;
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.copy(toThree(pos));
  scene.add(obj);
}
for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[]) {
  const a = toThree(axis).multiplyScalar(1.15);
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone().negate(), a]), lineMat(0.6)));
}
label("|0⟩", [0, 0, 1.3]);
label("|1⟩", [0, 0, -1.3]);
label("|+⟩", [1.3, 0, 0]);
label("|−⟩", [-1.3, 0, 0]);
label("|+i⟩", [0, 1.32, 0]);
label("|−i⟩", [0, -1.32, 0]);

// State arrows: a soft, lit stick with a round bead on the tip
function makeArrow(color: number, opacity: number, radius: number, bead: number) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.45, emissive: color, emissiveIntensity: 0.18,
    transparent: opacity < 1, opacity,
  });
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 20), mat);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(bead, 32, 24), mat);
  shaft.scale.y = 1 - bead;
  shaft.position.y = (1 - bead) / 2;
  tip.position.y = 1;
  g.add(shaft, tip);
  scene.add(g);
  return (v: Vec3) =>
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toThree(v).normalize());
}
const setGhost = makeArrow(0xffffff, 0.75, 0.012, 0.04);
const setArrow = makeArrow(ACCENT, 1, 0.022, 0.075);

// Floating specks of light
const specks = (() => {
  const n = 70, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 7;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 4.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dot = document.createElement("canvas");
  dot.width = dot.height = 32;
  const g = dot.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(dot), size: 0.06, transparent: true, opacity: 0.9, depthWrite: false,
  }));
  scene.add(pts);
  return pts;
})();

// Path history (one arc per gate) + dots at each intermediate state
const trail = new THREE.Group();
scene.add(trail);
const trailMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5, emissive: 0xffc21a, emissiveIntensity: 0.35 });
const dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
const dotGeo = new THREE.SphereGeometry(0.03, 16, 12);

function arcPoints(from: Vec3, g: Gate, t: number) {
  const n = Math.max(2, Math.ceil(48 * t * (g.angle / Math.PI)) + 1);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) pts.push(toThree(rotate(from, g.axis, (g.angle * t * i) / n)));
  return pts;
}

/** Arcs for gates [0, step) in full, gate `step` up to fraction t; dots at each visited state. */
function drawTrail(step: number, t: number) {
  for (const child of trail.children) {
    const geo = (child as THREE.Mesh).geometry;
    if (geo !== dotGeo) geo.dispose();
  }
  trail.clear();
  for (let i = 0; i <= step && i < circuit.length; i++) {
    const tt = i < step ? 1 : t;
    if (tt <= 0) continue;
    const pts = arcPoints(bloch(states[i]), circuit[i], tt);
    const span = Math.max(...pts.map((p) => p.distanceTo(pts[0])));
    if (span < 1e-3) continue; // state lies on the rotation axis: nothing moves
    const curve = new THREE.CatmullRomCurve3(pts);
    trail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, 0.012, 8), trailMat));
  }
  for (let i = 0; i <= Math.min(step, circuit.length); i++) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(toThree(bloch(states[i])));
    trail.add(dot);
  }
}

// ================================================================ animation
let shown = 0; // gates fully animated so far
let anim: { step: number; start: number; dur: number } | null = null;

const show = (v: Vec3) => setArrow(v);

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function tick(now: number) {
  if (!anim && shown < circuit.length) {
    const backlog = circuit.length - shown;
    anim = { step: shown, start: now, dur: reduceMotion ? 0 : 650 / Math.min(backlog, 4) };
    syncChips();
  }
  if (anim) {
    const raw = anim.dur ? Math.min(1, (now - anim.start) / anim.dur) : 1;
    const t = easeInOut(raw);
    const g = circuit[anim.step];
    show(rotate(bloch(states[anim.step]), g.axis, g.angle * t));
    drawTrail(anim.step, t);
    if (raw >= 1) {
      shown = anim.step + 1;
      anim = null;
      render();
    }
  }
  if (!reduceMotion) {
    specks.rotation.y = now * 0.00002;
    specks.position.y = Math.sin(now * 0.0004) * 0.05;
  }
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(tick);
}

/** Jump to the final state with no animation (used after edits). */
function settle() {
  anim = null;
  shown = circuit.length;
  show(bloch(states[shown]));
  drawTrail(shown, 1);
  render();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  // Fit the sphere (+ labels) into the space left between the readout and the dock.
  const k = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const ui = w < 720 ? 460 : 270; // px taken by overlays
  const byHeight = (1.38 * h) / (k * Math.max(h - ui, 200));
  const byWidth = 1.5 / (k * 0.94 * (w / h));
  camera.position.setLength(Math.max(byHeight, byWidth));
  // nudge the picture up, away from the dock, without moving the orbit pivot
  camera.setViewOffset(w, h, 0, w < 720 ? 70 : 44, w, h);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

// ================================================================ UI
const fmtC = ({ re, im }: C) => {
  const r = Math.abs(re) < 5e-4 ? 0 : re, i = Math.abs(im) < 5e-4 ? 0 : im;
  const n = (x: number) => Math.abs(x).toFixed(3).replace(/\.?0+$/, "") || "0";
  if (!i) return `${r < 0 ? "−" : ""}${n(r)}`;
  if (!r) return `${i < 0 ? "−" : ""}${Math.abs(Math.abs(i) - 1) < 5e-4 ? "" : n(i)}i`;
  return `(${r < 0 ? "−" : ""}${n(r)}${i < 0 ? "−" : "+"}${n(i)}i)`;
};
/** Amplitude β written as "+ β" or "− |β|" so the ket reads naturally. */
function fmtTerm(z: C) {
  const r = Math.abs(z.re) < 5e-4 ? 0 : z.re, i = Math.abs(z.im) < 5e-4 ? 0 : z.im;
  const neg = (r < 0 && !i) || (!r && i < 0);
  return neg ? ` − <b>${fmtC({ re: -r, im: -i })}</b>` : ` + <b>${fmtC(z)}</b>`;
}
const fix2 = (x: number) => (Math.abs(x) < 5e-3 ? 0 : x).toFixed(2);
const deg = (r: number) => `${((r * 180) / Math.PI).toFixed(0)}°`;

/** Readout shows the state the arrow currently rests on. */
function render() {
  const s = states[shown];
  const [a, b] = s;
  const { theta, phi } = angles(s);
  const [x, y, z] = bloch(s);
  $("ket").innerHTML = `|ψ⟩ = <b>${fmtC(a)}</b>|0⟩${fmtTerm(b)}|1⟩`;
  $("meta").innerHTML =
    `<span>θ ${deg(theta)}</span><span>φ ${deg(phi)}</span>` +
    `<span>r (${fix2(x)}, ${fix2(y)}, ${fix2(z)})</span><br>` +
    `<span>P(0) ${abs2(a).toFixed(3)}</span><span>P(1) ${abs2(b).toFixed(3)}</span>` +
    `<span class="f">F(ψ₀, ψ) ${fidelity(psi0, s).toFixed(3)}</span>`;
  syncChips();
}

// Circuit strip: chips are only (re)built when the circuit changes, so only new ones animate in
const box = $("circuit");
let chips: HTMLButtonElement[] = [];

function buildChips(animateLast = false) {
  box.innerHTML = `<span class="start">|ψ₀⟩ →</span>`;
  if (!circuit.length) box.insertAdjacentHTML("beforeend", `<span class="empty">tap a gate to begin</span>`);
  chips = circuit.map((g, i) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    if (!animateLast || i < circuit.length - 1) chip.style.animation = "none";
    chip.textContent = g.name;
    chip.title = "Click to remove";
    chip.onclick = () => { circuit.splice(i, 1); recompute(); buildChips(); settle(); };
    box.appendChild(chip);
    return chip;
  });
  box.scrollLeft = box.scrollWidth;
  syncChips();
}

function syncChips() {
  chips.forEach((chip, i) => {
    chip.classList.toggle("active", anim?.step === i);
    chip.classList.toggle("done", anim?.step !== i && i < shown);
  });
}

function addGate(g: Gate) {
  circuit.push(g);
  states.push(apply(g.matrix, states[states.length - 1]));
  buildChips(true);
}

// Gate buttons
const TIPS: Record<string, string> = {
  X: "Pauli-X — π about x (bit flip)", Y: "Pauli-Y — π about y", Z: "Pauli-Z — π about z (phase flip)",
  H: "Hadamard — π about (x+z)/√2", S: "Phase S — π/2 about z", T: "T — π/4 about z",
  Rx: "Rotate θ about x", Ry: "Rotate θ about y", Rz: "Rotate θ about z", P: "Phase shift P(θ)",
};
for (const k of Object.keys(FIXED)) {
  const btn = document.createElement("button");
  btn.className = "gate";
  btn.textContent = k;
  btn.title = `${TIPS[k]}  [${k}]`;
  btn.onclick = () => addGate(FIXED[k]);
  $("fixed").appendChild(btn);
}
const angleInput = $<HTMLInputElement>("angle");
const angleValue = () => (Number(angleInput.value) * Math.PI) / 12;
const syncAngle = () => ($("angleOut").textContent = fmtAngle(angleValue()));
angleInput.oninput = syncAngle;
for (const k of ["Rx", "Ry", "Rz", "P"] as const) {
  const btn = document.createElement("button");
  btn.className = "gate";
  btn.innerHTML = k.length > 1 ? `R<sub style="font-size:.7em">${k[1]}</sub>` : k;
  btn.title = TIPS[k];
  btn.onclick = () => addGate(parametric(k, angleValue()));
  $("param").appendChild(btn);
}

const replay = () => {
  if (!circuit.length) return;
  shown = 0;
  anim = null;
  show(bloch(psi0));
  drawTrail(0, 0);
  render();
};
const undo = () => { if (circuit.length) { circuit.pop(); recompute(); buildChips(); settle(); } };
$("play").onclick = replay;
$("clear").onclick = () => { circuit = []; recompute(); buildChips(); settle(); };

// Initial state popover
const pop = $("popover");
const thetaIn = $<HTMLInputElement>("theta"), phiIn = $<HTMLInputElement>("phi");
const initBtn = $("initBtn");
const setPop = (open: boolean) => {
  pop.hidden = !open;
  initBtn.setAttribute("aria-expanded", String(open));
};
initBtn.onclick = () => setPop(pop.hidden === true);
addEventListener("pointerdown", (e) => {
  const t = e.target as Node;
  if (!pop.hidden && !pop.contains(t) && !initBtn.contains(t)) setPop(false);
});

function setInitial(thetaDeg: number, phiDeg: number) {
  thetaIn.value = String(thetaDeg);
  phiIn.value = String(phiDeg);
  $("thetaOut").textContent = `${thetaDeg}°`;
  $("phiOut").textContent = `${phiDeg}°`;
  psi0 = fromAngles((thetaDeg * Math.PI) / 180, (phiDeg * Math.PI) / 180);
  setGhost(bloch(psi0));
  recompute();
  settle();
}
thetaIn.oninput = phiIn.oninput = () => setInitial(Number(thetaIn.value), Number(phiIn.value));

const PRESETS: [string, number, number][] = [
  ["0", 0, 0], ["1", 180, 0], ["+", 90, 0], ["−", 90, 180], ["+i", 90, 90], ["−i", 90, 270],
];
for (const [name, t, p] of PRESETS) {
  const btn = document.createElement("button");
  btn.textContent = `|${name}⟩`;
  btn.onclick = () => setInitial(t, p);
  $("presets").appendChild(btn);
}

// Keyboard: X Y Z H S T apply gates, Backspace undo, Space replay
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toUpperCase();
  if (FIXED[k]) addGate(FIXED[k]);
  else if (e.key === "Backspace") undo();
  else if (e.key === " ") { e.preventDefault(); replay(); }
  else if (e.key === "Escape") setPop(false);
});

// ================================================================ boot
syncAngle();
resize();
buildChips();
setInitial(0, 0);
requestAnimationFrame(tick);

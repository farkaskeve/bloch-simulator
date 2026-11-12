// Pure single-qubit quantum mechanics. No rendering code here.

export type C = { re: number; im: number };
export type State = [C, C]; // α|0⟩ + β|1⟩
export type Mat = [[C, C], [C, C]];
export type Vec3 = [number, number, number];

export const c = (re: number, im = 0): C => ({ re, im });
export const add = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
export const mul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const conj = (a: C): C => c(a.re, -a.im);
export const abs2 = (a: C): number => a.re * a.re + a.im * a.im;
export const expi = (t: number): C => c(Math.cos(t), Math.sin(t));

/** |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩ */
export function fromAngles(theta: number, phi: number): State {
  const s = Math.sin(theta / 2);
  return [c(Math.cos(theta / 2)), c(s * Math.cos(phi), s * Math.sin(phi))];
}

export function normalize([a, b]: State): State {
  const n = Math.sqrt(abs2(a) + abs2(b)) || 1;
  return [c(a.re / n, a.im / n), c(b.re / n, b.im / n)];
}

export function apply(m: Mat, [a, b]: State): State {
  return [add(mul(m[0][0], a), mul(m[0][1], b)), add(mul(m[1][0], a), mul(m[1][1], b))];
}

/** Bloch vector r = (⟨σx⟩, ⟨σy⟩, ⟨σz⟩) */
export function bloch([a, b]: State): Vec3 {
  const ab = mul(conj(a), b);
  return [2 * ab.re, 2 * ab.im, abs2(a) - abs2(b)];
}

/** Polar angle θ ∈ [0, π] and azimuth φ ∈ [0, 2π) of the Bloch vector */
export function angles(s: State): { theta: number; phi: number } {
  const [x, y, z] = bloch(s);
  const theta = Math.acos(Math.max(-1, Math.min(1, z)));
  let phi = Math.atan2(y, x);
  if (phi < 0) phi += 2 * Math.PI;
  if (Math.sin(theta) < 1e-9) phi = 0;
  return { theta, phi };
}

/** Fidelity F = |⟨a|b⟩|² */
export function fidelity([a0, a1]: State, [b0, b1]: State): number {
  return abs2(add(mul(conj(a0), b0), mul(conj(a1), b1)));
}

/** Rodrigues rotation of v about unit axis n by angle t (right-hand rule). */
export function rotate(v: Vec3, n: Vec3, t: number): Vec3 {
  const [x, y, z] = v;
  const [a, b, d] = n;
  const cos = Math.cos(t), sin = Math.sin(t), dot = a * x + b * y + d * z;
  return [
    x * cos + (b * z - d * y) * sin + a * dot * (1 - cos),
    y * cos + (d * x - a * z) * sin + b * dot * (1 - cos),
    z * cos + (a * y - b * x) * sin + d * dot * (1 - cos),
  ];
}

// ---------------------------------------------------------------- Gates

export interface Gate {
  name: string; // label shown on the chip, e.g. "Rx(π/2)"
  matrix: Mat; // the exact textbook matrix
  axis: Vec3; // rotation axis on the Bloch sphere
  angle: number; // rotation angle on the Bloch sphere
}

const R2 = Math.SQRT1_2;
const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0], Z: Vec3 = [0, 0, 1];

const phaseGate = (name: string, p: number): Gate => ({
  name,
  matrix: [[c(1), c(0)], [c(0), expi(p)]],
  axis: Z,
  angle: p,
});

/** R_n(θ) = cos(θ/2) I − i sin(θ/2) (n·σ) */
function rot(name: string, n: Vec3, t: number): Gate {
  const co = Math.cos(t / 2), s = Math.sin(t / 2);
  const [nx, ny, nz] = n;
  return {
    name,
    matrix: [
      [c(co, -nz * s), c(-ny * s, -nx * s)],
      [c(ny * s, -nx * s), c(co, nz * s)],
    ],
    axis: n,
    angle: t,
  };
}

export const FIXED: Record<string, Gate> = {
  X: { name: "X", matrix: [[c(0), c(1)], [c(1), c(0)]], axis: X, angle: Math.PI },
  Y: { name: "Y", matrix: [[c(0), c(0, -1)], [c(0, 1), c(0)]], axis: Y, angle: Math.PI },
  Z: { name: "Z", matrix: [[c(1), c(0)], [c(0), c(-1)]], axis: Z, angle: Math.PI },
  H: { name: "H", matrix: [[c(R2), c(R2)], [c(R2), c(-R2)]], axis: [R2, 0, R2], angle: Math.PI },
  S: phaseGate("S", Math.PI / 2),
  T: phaseGate("T", Math.PI / 4),
};

export function parametric(kind: "Rx" | "Ry" | "Rz" | "P", t: number): Gate {
  const label = `${kind}(${fmtAngle(t)})`;
  if (kind === "Rx") return rot(label, X, t);
  if (kind === "Ry") return rot(label, Y, t);
  if (kind === "Rz") return rot(label, Z, t);
  return phaseGate(label, t);
}

/** Pretty-prints an angle as a multiple of π when possible. */
export function fmtAngle(t: number): string {
  const k = t / Math.PI;
  for (const d of [1, 2, 3, 4, 6, 8, 12]) {
    const n = Math.round(k * d);
    if (Math.abs(k * d - n) < 1e-6) {
      if (n === 0) return "0";
      const num = n === 1 ? "π" : n === -1 ? "−π" : `${n < 0 ? "−" : ""}${Math.abs(n)}π`;
      return d === 1 ? num : `${num}/${d}`;
    }
  }
  return `${((t * 180) / Math.PI).toFixed(0)}°`;
}


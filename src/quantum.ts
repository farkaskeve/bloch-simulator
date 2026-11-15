// Pure single-qubit quantum mechanics. No rendering code here.

export type C = { re: number; im: number };
export type State = [C, C]; // a|0⟩ + b|1⟩
export type Mat = [[C, C], [C, C]];
export type Vec3 = [number, number, number];

export const c = (re: number, im = 0): C => ({ re, im });
export const add = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
export const mul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const conj = (a: C): C => c(a.re, -a.im);
export const abs2 = (a: C): number => a.re * a.re + a.im * a.im;
export const expi = (t: number): C => c(Math.cos(t), Math.sin(t));

/** |φ⟩ = cos(α/2)|0⟩ + e^{jβ} sin(α/2)|1⟩ */
export function fromAngles(alpha: number, beta: number): State {
  const s = Math.sin(alpha / 2);
  return [c(Math.cos(alpha / 2)), c(s * Math.cos(beta), s * Math.sin(beta))];
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

/** α ∈ [0, π] and β ∈ [0, 2π) of cos(α/2)|0⟩ + e^{jβ} sin(α/2)|1⟩ (up to global phase) */
export function angles(s: State): { alpha: number; beta: number } {
  const [x, y, z] = bloch(s);
  const alpha = Math.acos(Math.max(-1, Math.min(1, z)));
  let beta = Math.atan2(y, x);
  if (beta < 0) beta += 2 * Math.PI;
  if (Math.sin(alpha) < 1e-9) beta = 0;
  return { alpha, beta };
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
// Basic gates (Pauli-X/Y/Z, Hadamard), phase gates (S, T, P(α)) and rotation gates
// Rx(α), Ry(α), Rz(α). Phase gate: P(α) = [[1, 0], [0, e^{jα}]].

export interface Gate {
  name: string; // label shown on the chip, e.g. "P(0.5π)"
  matrix: Mat; // the exact textbook matrix
  axis: Vec3; // rotation axis on the Bloch sphere
  angle: number; // rotation angle on the Bloch sphere
}

const R2 = Math.SQRT1_2;
const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0], Z: Vec3 = [0, 0, 1];

/** R_n(α) = cos(α/2) I − j sin(α/2) (n·σ) */
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

const phaseGate = (name: string, alpha: number): Gate =>
  ({ name, matrix: [[c(1), c(0)], [c(0), expi(alpha)]], axis: Z, angle: alpha });

export const FIXED: Record<string, Gate> = {
  X: { name: "X", matrix: [[c(0), c(1)], [c(1), c(0)]], axis: X, angle: Math.PI },
  Y: { name: "Y", matrix: [[c(0), c(0, -1)], [c(0, 1), c(0)]], axis: Y, angle: Math.PI },
  Z: { name: "Z", matrix: [[c(1), c(0)], [c(0), c(-1)]], axis: Z, angle: Math.PI },
  H: { name: "H", matrix: [[c(R2), c(R2)], [c(R2), c(-R2)]], axis: [R2, 0, R2], angle: Math.PI },
  S: phaseGate("S", Math.PI / 2),
  T: phaseGate("T", Math.PI / 4),
};

export type ParamKind = "Rx" | "Ry" | "Rz" | "P";

/** Parametric gates: rotations Rx(α), Ry(α), Rz(α) and the phase gate P(α). */
export function parametric(kind: ParamKind, alpha: number): Gate {
  const name = `${kind}(${fmtAngle(alpha)})`;
  if (kind === "Rx") return rot(name, X, alpha);
  if (kind === "Ry") return rot(name, Y, alpha);
  if (kind === "Rz") return rot(name, Z, alpha);
  return phaseGate(name, alpha);
}

export const phase = (alpha: number) => parametric("P", alpha);

/** Angle as a decimal multiple of π */
export function fmtAngle(t: number): string {
  const k = Number((t / Math.PI).toFixed(3));
  if (k === 0) return "0";
  if (k === 1) return "π";
  return `${k}π`;
}

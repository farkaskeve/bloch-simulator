// Exact-form pretty printing of a|0⟩ + b|1⟩
// fractions (1/√2), j as the imaginary unit, phases as e^{j0.25π}, global phase factored out.
import { C, State, abs2 } from "./quantum";

const EPS = 1e-6;
const near = (x: number, y: number) => Math.abs(x - y) < EPS;

export const frac = (num: string, den: string) =>
  `<span class="frac"><span>${num}</span><span>${den}</span></span>`;
const sqrt = (n: string) => `√<span class="rad">${n}</span>`;

/** Magnitudes that get an exact form; everything else is printed with 3 decimals. */
const EXACT: [number, string][] = [
  [Math.SQRT1_2, frac("1", sqrt("2"))],
  [0.5, frac("1", "2")],
  [Math.sqrt(3) / 2, frac(sqrt("3"), "2")],
];
function magnitude(m: number): string {
  for (const [v, s] of EXACT) if (near(m, v)) return s;
  const r = Number(m.toFixed(3));
  return r === 1 ? "" : String(r); // 0.9996 is shown as a plain ket, like 1
}

/** Amplitudes below display precision (|a| < 0.0005) are treated as 0. */
const ZERO = 5e-4;

/** Angle as a decimal multiple of π, with a real minus sign (e.g. "−0.25π"). */
function piMultiple(t: number): string {
  const k = Number((t / Math.PI).toFixed(3));
  const abs = Math.abs(k) === 1 ? "π" : `${Math.abs(k)}π`;
  return `${k < 0 ? "−" : ""}${abs}`;
}

/** Wraps an angle into (−π, π]. */
function wrap(t: number): number {
  let x = t % (2 * Math.PI);
  if (x <= -Math.PI + EPS) x += 2 * Math.PI;
  if (x > Math.PI + EPS) x -= 2 * Math.PI;
  return x;
}

/** Unit phase factor e^{jθ}: sign plus the visible part ("", "j", or "e^{jθ}"). */
function phaseFactor(theta: number): { neg: boolean; body: string } {
  // Decide on the value as displayed (3 decimals of π), so e.g. 0.0004π never shows as e^{j0π}.
  const k = Number((wrap(theta) / Math.PI).toFixed(3));
  if (k === 0) return { neg: false, body: "" };
  if (Math.abs(k) === 1) return { neg: true, body: "" };
  if (k === 0.5) return { neg: false, body: "j" };
  if (k === -0.5) return { neg: true, body: "j" };
  const s = piMultiple(k * Math.PI);
  return { neg: false, body: `e<sup>${s.startsWith("−") ? "−j" + s.slice(1) : "j" + s}</sup>` };
}

const arg = (z: C) => Math.atan2(z.im, z.re);

/** One term m·e^{jθ}|k⟩ → sign and body, e.g. { neg: true, body: "j<frac>|1⟩" }. */
function term(m: number, theta: number, ket: string, withMagnitude: boolean) {
  const p = phaseFactor(theta);
  const mag = withMagnitude ? magnitude(m) : "";
  return { neg: p.neg, body: `${p.body}${mag}${ket}` };
}

function join(terms: { neg: boolean; body: string }[]): string {
  return terms
    .map((t, i) => (i === 0 ? (t.neg ? "−" : "") : t.neg ? " − " : " + ") + t.body)
    .join("");
}

/** HTML for the right-hand side of |φ⟩ = …, e.g. "e^{−j0.25π} (|0⟩ + j|1⟩)/√2". */
export function formatKet([a, b]: State): string {
  const ma = Math.sqrt(abs2(a)), mb = Math.sqrt(abs2(b));
  if (mb < ZERO) return join([term(ma, arg(a), "|0⟩", true)]);
  if (ma < ZERO) return join([term(mb, arg(b), "|1⟩", true)]);

  // Factor out the global phase of a, so that a is real and positive (as in the notes).
  const gamma = arg(a);
  const g = phaseFactor(gamma);
  const rel = arg(b) - gamma;

  const equal = near(ma, mb);

  // a is negative real and b is positive real or +j·|b|: write the positive term first, as the
  // notes do ("a|1⟩ − b|0⟩", "(|01⟩ − |10⟩)/√2"), instead of factoring out a −1.
  const pb = phaseFactor(arg(b));
  if (g.neg && !g.body && !pb.neg && (pb.body === "" || pb.body === "j")) {
    const t = join([term(mb, arg(b), "|1⟩", !equal), { neg: true, body: `${equal ? "" : magnitude(ma)}|0⟩` }]);
    return equal ? frac(t, sqrt("2")) : t;
  }

  let inner: string;
  let needsBrackets: boolean;
  if (equal) {
    // Equal superposition: (|0⟩ ± e^{jβ}|1⟩)/√2
    inner = frac(join([term(1, 0, "|0⟩", false), term(1, rel, "|1⟩", false)]), sqrt("2"));
    needsBrackets = false;
  } else {
    inner = join([term(ma, 0, "|0⟩", true), term(mb, rel, "|1⟩", true)]);
    needsBrackets = true;
  }
  if (!g.body) return (g.neg ? "−" : "") + (g.neg && needsBrackets ? `[${inner}]` : inner);
  return `${g.neg ? "−" : ""}${g.body}${needsBrackets ? `[${inner}]` : inner}`;
}

// Checks that the on-screen state readout (formatKet) is numerically correct for every gate,
// many initial states and random gate chains, and that it follows the notation of the notes.
// Run: npm test
import { FIXED, parametric, apply, fromAngles, abs2, angles, State, C, Gate, c, mul, add } from "../src/quantum";
import { formatKet } from "../src/format";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) {
    failures++;
    if (failures <= 20) console.log(`✗ ${label} ${detail}`);
  }
  return ok;
};

// ------------------------------------------------------------- HTML → plain text → numbers
/** Same flattening a reader does: fraction a/b, superscript ^{…}. */
export const text = (html: string) =>
  html
    .replace(/<span class="frac"><span>(.*?)<\/span><span>(.*?)<\/span><\/span>/g, "($1)/($2)")
    .replace(/<sup>(.*?)<\/sup>/g, "^{$1}")
    .replace(/<[^>]+>/g, "");

/** Recursive-descent parser for exactly the grammar formatKet produces. */
function parse(src: string): State {
  let i = 0;
  const peek = (s: string) => src.startsWith(s, i);
  const eat = (s: string) => {
    if (!peek(s)) throw new Error(`expected "${s}" at ${i} in "${src}"`);
    i += s.length;
  };
  const number = () => {
    const m = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (!m) throw new Error(`number expected at ${i} in "${src}"`);
    i += m[0].length;
    return Number(m[0]);
  };
  /** j | e^{±jkπ} | nothing → unit complex */
  const phase = (): C => {
    if (peek("e^{")) {
      eat("e^{");
      const neg = peek("−");
      if (neg) eat("−");
      eat("j");
      const k = peek("π") ? 1 : number();
      eat("π");
      eat("}");
      const t = (neg ? -1 : 1) * k * Math.PI;
      return c(Math.cos(t), Math.sin(t));
    }
    if (peek("j")) {
      eat("j");
      return c(0, 1);
    }
    return c(1);
  };
  const magnitude = (): number => {
    for (const [s, v] of [["(1)/(√2)", Math.SQRT1_2], ["(1)/(2)", 0.5], ["(√3)/(2)", Math.sqrt(3) / 2]] as const)
      if (peek(s)) { eat(s); return v; }
    return /^\d/.test(src.slice(i)) ? number() : 1;
  };
  const terms = (): State => {
    const out: State = [c(0), c(0)];
    let first = true;
    while (true) {
      let sign = 1;
      if (first) { if (peek("−")) { eat("−"); sign = -1; } }
      else if (peek(" + ")) eat(" + ");
      else if (peek(" − ")) { eat(" − "); sign = -1; }
      else break;
      first = false;
      const p = phase();
      const m = magnitude();
      const k = peek("|0⟩") ? 0 : 1;
      eat(k ? "|1⟩" : "|0⟩");
      out[k] = add(out[k], mul(p, c(sign * m)));
    }
    return out;
  };
  // expr := [−] [phase] ( "[" terms "]" | "(" terms ")/(√2)" ) | terms
  let sign = 1, g = c(1), s: State;
  if (peek("−")) { eat("−"); sign = -1; }
  g = phase();
  if (peek("[")) { eat("["); s = terms(); eat("]"); }
  else if (peek("(|") || peek("(−") || peek("(j") || peek("(e^")) {
    eat("("); s = terms(); eat(")/(√2)");
    s = [mul(s[0], c(Math.SQRT1_2)), mul(s[1], c(Math.SQRT1_2))];
  } else {
    i = 0; sign = 1; g = c(1);
    s = terms();
  }
  if (i !== src.length) throw new Error(`trailing "${src.slice(i)}" in "${src}"`);
  const f = mul(g, c(sign));
  return [mul(f, s[0]), mul(f, s[1])];
}

// ------------------------------------------------------------- notation rules from the notes
function notationProblems(t: string): string[] {
  const p: string[] = [];
  if (/i/.test(t.replace(/\|[01]⟩/g, ""))) p.push("uses i instead of j");
  if (/-/.test(t)) p.push("ASCII hyphen instead of − sign");
  if (/NaN|Infinity|undefined/.test(t)) p.push("NaN");
  if (/\b0π|j0π|^0\||[^.\d]0\|/.test(t)) p.push("zero term or zero angle shown");
  if (/(^|[^.\d])1\|/.test(t)) p.push("explicit coefficient 1");
  if (/π\/\d/.test(t)) p.push("π/n instead of decimal multiple (0.5π)");
  if (/e\^\{j1π\}|e\^\{j0\.5π\}|e\^\{−j0\.5π\}/.test(t)) p.push("e^{jπ}/e^{j0.5π} instead of −1 / j");
  if (/\(1\)\/\(√2\)\|0⟩ [+−] [^|]*\(1\)\/\(√2\)\|1⟩/.test(t)) p.push("1/√2 not factored out");
  return p;
}

const dist = (a: State, b: State) =>
  Math.max(...[0, 1].flatMap((k) => [Math.abs(a[k].re - b[k].re), Math.abs(a[k].im - b[k].im)]));

let checked = 0;
function verify(s: State, label: string) {
  checked++;
  const t = text(formatKet(s));
  let back: State;
  try { back = parse(t); } catch (e) { return check(label, false, `${t}  → parse error ${(e as Error).message}`); }
  const d = dist(back, s);
  check(label, d < 3e-3, `shown "${t}" differs from state by ${d.toExponential(1)}`);
  const probs = notationProblems(t);
  check(label, probs.length === 0, `"${t}": ${probs.join(", ")}`);
}

// ------------------------------------------------------------- gates and initial states as in the UI
const sliderAngles = Array.from({ length: 16 }, (_, k) => ((k + 1) * Math.PI) / 8); // angle slider 1..16 × π/8
const gates: Gate[] = [
  ...Object.values(FIXED),
  ...(["Rx", "Ry", "Rz", "P"] as const).flatMap((k) => sliderAngles.map((t) => parametric(k, t))),
];
// initial-state sliders: α = k·0.01π (0..100), β = m·0.01π (0..199)
const initials: State[] = [];
for (let k = 0; k <= 100; k += 5) for (let m = 0; m < 200; m += 10) initials.push(fromAngles((k * Math.PI) / 100, (m * Math.PI) / 100));
for (const [k, m] of [[0, 0], [100, 0], [50, 0], [50, 100], [37, 0], [1, 199], [99, 1]]) initials.push(fromAngles((k * Math.PI) / 100, (m * Math.PI) / 100));

// 1) every initial state on its own
initials.forEach((s, n) => verify(s, `initial #${n}`));
// 2) every gate on every initial state
for (const s of initials) for (const g of gates) verify(apply(g.matrix, s), `${g.name} on initial`);
// 3) all ordered pairs of gates from |0⟩, |1⟩, |+⟩, |−⟩
const named: [string, State][] = [["|0⟩", fromAngles(0, 0)], ["|1⟩", fromAngles(Math.PI, 0)], ["|+⟩", fromAngles(Math.PI / 2, 0)], ["|−⟩", fromAngles(Math.PI / 2, Math.PI)]];
for (const [n, s] of named) for (const g1 of gates) for (const g2 of gates) verify(apply(g2.matrix, apply(g1.matrix, s)), `${g1.name}→${g2.name} on ${n}`);
// 4) random chains up to 10 gates from random slider initial states
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
for (let n = 0; n < 20000; n++) {
  let s = initials[Math.floor(rnd() * initials.length)];
  const names: string[] = [];
  const len = 1 + Math.floor(rnd() * 10);
  for (let k = 0; k < len; k++) { const g = gates[Math.floor(rnd() * gates.length)]; s = apply(g.matrix, s); names.push(g.name); }
  verify(s, `chain ${names.join("→")}`);
}
console.log(`${failures ? "✗" : "✓"} readout round-trip + notation: ${checked} states, ${failures} problems`);

// ------------------------------------------------------------- results that appear in the notes
const zero = fromAngles(0, 0), one = fromAngles(Math.PI, 0);
const H = FIXED.H.matrix, X = FIXED.X.matrix, Y = FIXED.Y.matrix, Z = FIXED.Z.matrix;
const P = (t: number) => parametric("P", t).matrix;
const show = (s: State) => text(formatKet(s));
const expect = (label: string, got: string, want: string) =>
  console.log(`${check(label, got === want, `got "${got}", notes: "${want}"`) ? "✓" : "✗"} ${label}: ${got}`);

// 3. lecture: H|0⟩ = |+⟩, H|1⟩ = |−⟩; 8. lecture: |φ1⟩ = H|0⟩ = (|0⟩+|1⟩)/√2
expect("H|0⟩", show(apply(H, zero)), "(|0⟩ + |1⟩)/(√2)");
expect("H|1⟩", show(apply(H, one)), "(|0⟩ − |1⟩)/(√2)");
// 8. lecture: |φ2⟩ = P(α)|φ1⟩ = (|0⟩ + e^{jα}|1⟩)/√2, with α = 0.25π
expect("P(0.25π)H|0⟩", show(apply(P(Math.PI / 4), apply(H, zero))), "(|0⟩ + e^{j0.25π}|1⟩)/(√2)");
// teleportation table: X, Z, ZX acting on a|0⟩ + b|1⟩ (a = 0.6, b = 0.8)
const ab: State = [c(0.6), c(0.8)];
expect("X(a|0⟩+b|1⟩) = b|0⟩+a|1⟩", show(apply(X, ab)), "0.8|0⟩ + 0.6|1⟩");
expect("Z(a|0⟩+b|1⟩) = a|0⟩−b|1⟩", show(apply(Z, ab)), "0.6|0⟩ − 0.8|1⟩");
expect("ZX(a|0⟩+b|1⟩) = b|0⟩−a|1⟩", show(apply(Z, apply(X, ab))), "0.8|0⟩ − 0.6|1⟩");
// the table's 4th row "a|1⟩ − b|0⟩" is X·Z|ψ⟩ (Z first, then X); Z·X|ψ⟩ differs from it only by a global −1
expect("Z→X on a|0⟩+b|1⟩ = a|1⟩−b|0⟩", show(apply(X, apply(Z, ab))), "0.6|1⟩ − 0.8|0⟩");
expect("H→X on |1⟩ = (|1⟩ − |0⟩)/√2, positive term first", show(apply(X, apply(H, one))), "(|1⟩ − |0⟩)/(√2)");
expect("Z→X on |1⟩ = −|0⟩", show(apply(X, apply(Z, one))), "−|0⟩");
// superdense coding: jY maps |0⟩ → −|1⟩, |1⟩ → |0⟩  ⇒  Y|0⟩ = j|1⟩, Y|1⟩ = −j|0⟩
expect("Y|0⟩", show(apply(Y, zero)), "j|1⟩");
expect("Y|1⟩", show(apply(Y, one)), "−j|0⟩");
// 5. lecture interferometer H·P(Δα)·H|0⟩: P0 = cos²(Δα/2), P1 = sin²(Δα/2)
let worstP = 0;
for (const t of sliderAngles) {
  const s = apply(H, apply(P(t), apply(H, zero)));
  worstP = Math.max(worstP, Math.abs(abs2(s[0]) - Math.cos(t / 2) ** 2), Math.abs(abs2(s[1]) - Math.sin(t / 2) ** 2));
}
console.log(`${check("interferometer", worstP < 1e-12) ? "✓" : "✗"} interferometer H·P(Δα)·H|0⟩: P0 = cos²(Δα/2), P1 = sin²(Δα/2) for all slider angles`);
// 8. lecture: H → P(α) → H → P(0.5π+β) on |0⟩ = e^{j0.5α}[cos(α/2)|0⟩ + e^{jβ} sin(α/2)|1⟩]
let worstA = 0;
for (const a of sliderAngles) for (const b of sliderAngles) {
  const s = apply(P(Math.PI / 2 + b), apply(H, apply(P(a), apply(H, zero))));
  const g = c(Math.cos(a / 2), Math.sin(a / 2));
  const want: State = [mul(g, c(Math.cos(a / 2))), mul(g, mul(c(Math.cos(b), Math.sin(b)), c(Math.sin(a / 2))))];
  worstA = Math.max(worstA, dist(s, want));
  const ang = angles(s);
  // the readout's α, β must be the notes' α, β (α folded into [0, π])
  const aa = a <= Math.PI + 1e-9 ? a : 2 * Math.PI - a;
  if (Math.abs(Math.sin(aa)) > 1e-6) worstA = Math.max(worstA, Math.abs(ang.alpha - aa));
}
console.log(`${check("arbitrary qubit", worstA < 1e-9) ? "✓" : "✗"} H→P(α)→H→P(0.5π+β)|0⟩ = e^{j0.5α}[cos(α/2)|0⟩ + e^{jβ}sin(α/2)|1⟩] for 16×16 slider angles`);
expect(
  "H→P(0.25π)→H→P(0.5π+0.25π)|0⟩",
  show(apply(P(0.75 * Math.PI), apply(H, apply(P(Math.PI / 4), apply(H, zero))))),
  "e^{j0.125π}[0.924|0⟩ + e^{j0.25π}0.383|1⟩]",
);

if (failures) process.exitCode = 1;

// Verifies that every gate's matrix action equals its Bloch-sphere rotation.
// Run: npm test
import { FIXED, parametric, phase, apply, bloch, rotate, fromAngles, fidelity, Gate } from "../src/quantum";
import { formatKet } from "../src/format";

const gates: Gate[] = [
  ...Object.values(FIXED),
  ...(["Rx", "Ry", "Rz", "P"] as const).flatMap((k) =>
    [Math.PI / 4, Math.PI / 2, 2.1, Math.PI, 5].map((t) => parametric(k, t))
  ),
];

let worst = 0;
for (let i = 0; i < 2000; i++) {
  const s = fromAngles(Math.random() * Math.PI, Math.random() * 2 * Math.PI);
  for (const g of gates) {
    const a = bloch(apply(g.matrix, s));
    const b = rotate(bloch(s), g.axis, g.angle);
    worst = Math.max(worst, ...a.map((v, j) => Math.abs(v - b[j])));
    // unitarity: norm preserved
    worst = Math.max(worst, Math.abs(fidelity(apply(g.matrix, s), apply(g.matrix, s)) - 1));
  }
}

// Known identities
const zero = fromAngles(0, 0);
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) process.exitCode = 1;
};
const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
check("H|0⟩ = |+⟩", near(bloch(apply(FIXED.H.matrix, zero)), [1, 0, 0]));
check("X|0⟩ = |1⟩", near(bloch(apply(FIXED.X.matrix, zero)), [0, 0, -1]));
check("H|1⟩ = |−⟩", near(bloch(apply(FIXED.H.matrix, apply(FIXED.X.matrix, zero))), [-1, 0, 0]));
check("P(0.25π)·P(0.25π) = P(0.5π) (on |+⟩)", near(
  bloch(apply(phase(Math.PI / 4).matrix, apply(phase(Math.PI / 4).matrix, apply(FIXED.H.matrix, zero)))),
  bloch(apply(phase(Math.PI / 2).matrix, apply(FIXED.H.matrix, zero)))));
check("S H|0⟩ on the y axis", near(bloch(apply(FIXED.S.matrix, apply(FIXED.H.matrix, zero))), [0, 1, 0]));
check("T·T = S (on |+⟩)", near(
  bloch(apply(FIXED.T.matrix, apply(FIXED.T.matrix, apply(FIXED.H.matrix, zero)))),
  bloch(apply(FIXED.S.matrix, apply(FIXED.H.matrix, zero)))));
check("Rx(π)|0⟩ = |1⟩", near(bloch(apply(parametric("Rx", Math.PI).matrix, zero)), [0, 0, -1]));
check("Ry(0.5π)|0⟩ = |+⟩", near(bloch(apply(parametric("Ry", Math.PI / 2).matrix, zero)), [1, 0, 0]));
check('fmtAngle → "0.5π" format', phase(Math.PI / 2).name === "P(0.5π)" && phase(Math.PI).name === "P(π)");
check(`matrix ≡ Bloch rotation for ${gates.length} gates × 2000 states (max err ${worst.toExponential(1)})`, worst < 1e-9);


// Exact-form readout
const text = (html: string) => html.replace(/<span class="frac"><span>(.*?)<\/span><span>(.*?)<\/span><\/span>/g, "($1)/($2)")
  .replace(/<sup>(.*?)<\/sup>/g, "^{$1}").replace(/<[^>]+>/g, "");
const fk = (s: Parameters<typeof formatKet>[0]) => text(formatKet(s));
const H = FIXED.H.matrix, S_ = FIXED.S.matrix, X_ = FIXED.X.matrix;
const cases: [string, string][] = [
  [fk(zero), "|0⟩"],
  [fk(apply(X_, zero)), "|1⟩"],
  [fk(apply(H, zero)), "(|0⟩ + |1⟩)/(√2)"],
  [fk(apply(H, apply(X_, zero))), "(|0⟩ − |1⟩)/(√2)"],
  [fk(apply(S_, apply(H, zero))), "(|0⟩ + j|1⟩)/(√2)"],
  [fk(apply(FIXED.T.matrix, apply(H, zero))), "(|0⟩ + e^{j0.25π}|1⟩)/(√2)"],
  [fk(apply(parametric("Rx", Math.PI).matrix, zero)), "−j|1⟩"],
  [fk(apply(parametric("Ry", Math.PI / 2).matrix, apply(S_, apply(H, zero)))), "e^{−j0.25π}(|0⟩ + j|1⟩)/(√2)"],
  [fk(apply(parametric("Ry", Math.PI / 3).matrix, zero)), "(√3)/(2)|0⟩ + (1)/(2)|1⟩"],
];
for (const [got, want] of cases) check(`ket: ${want}${got === want ? "" : `  (got ${got})`}`, got === want);

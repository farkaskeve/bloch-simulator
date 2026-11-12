// Verifies that every gate's matrix action equals its Bloch-sphere rotation.
// Run: npm test
import { FIXED, parametric, apply, bloch, rotate, fromAngles, fidelity, Gate } from "../src/quantum";

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
check("S H|0⟩ = |+i⟩", near(bloch(apply(FIXED.S.matrix, apply(FIXED.H.matrix, zero))), [0, 1, 0]));
check("T·T = S (on |+⟩)", near(
  bloch(apply(FIXED.T.matrix, apply(FIXED.T.matrix, apply(FIXED.H.matrix, zero)))),
  bloch(apply(FIXED.S.matrix, apply(FIXED.H.matrix, zero)))));
check(`matrix ≡ Bloch rotation for ${gates.length} gates × 2000 states (max err ${worst.toExponential(1)})`, worst < 1e-9);


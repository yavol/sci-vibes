# Problem: surrogate prediction for RETALT1 integral coefficients

Build an offline regression system that predicts eight processed aerodynamic
coefficients for a launcher configuration and flight condition. The intended
scientific question is whether a compact model can generalize across unseen
control-surface configurations while respecting known symmetries and
uncertainties.

## Inputs: nine features

1. `surface_family`
2. `layout`
3. `engine_state`
4. `delta_1_deg`
5. `delta_2_deg`
6. `delta_3_deg`
7. `delta_4_deg`
8. `mach`
9. `alpha_deg`

The first three fields are categorical configuration descriptors; the four
`delta_*_deg` fields are surface deflections in degrees. `mach` and `alpha_deg`
are continuous condition variables. Preserve their semantic types rather than
pretending this is an unordered numerical feature vector.

## Outputs: eight integral coefficients

`CA`, `CFy`, `CN`, `CMx`, `CMy`, `CMz`, `CMy_cog`, and `CMz_cog`.

They are processed *integral* force/moment coefficients for RETALT1. They are
not spatial velocity, pressure, vorticity, turbulence intensity, a CFD mesh,
or time-resolved flow fields. Claims should be limited to this tabular
surrogate problem.

## Research objective

Propose a model family whose inductive biases, training procedure, likely
failure modes, and public evidence can be compared against other branches.
Prefer an explicit trade-off over a generic ensemble: e.g. interpretability,
configuration generalization, symmetry structure, uncertainty, or compactness.
Every claimed advantage must have a public falsification test.

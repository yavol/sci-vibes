# RETALT1 Architecture Slides

Generated with the built-in ImageGen tool in 16:9 light-mode presentation format.
No external image assets were used.

## Physics problem

Build a surrogate for the RETALT1 aerodynamic database that predicts eight
integral force and moment coefficients from Mach number, angle of attack,
surface family/layout, and four control-surface deflections:

`CA`, `CFy`, `CN`, `CMx`, `CMy`, `CMz`, `CMy_cog`, and `CMz_cog`.

The evaluation should hold out entire Mach regimes and entire configurations,
not randomly split adjacent rows from the same processed polar.

## Prompt 0 — Opening

Create a stunning 16:9 light-mode opening slide titled:

“VIBES LAB”
“FOR AUTORESEARCH”

Use a warm white gallery-like canvas with a nearly invisible engineering grid
and delicate blue scientific flow lines. Reserve the left side for the large
two-line title in condensed editorial typography. On the right, show one
beautiful hero object: a translucent glass-and-polished-metal research compass
or resonator hovering above a subtle laboratory plane.

A single restrained amber qualitative signal enters the instrument. Concentric
teal wavefronts pass through it and coherently bend a large field of branching
cobalt experiment trajectories toward several promising illuminated
destinations. The motion should feel guided rather than centrally controlled.

Use premium scientific-editorial key art, refined translucent materials,
precise technical linework, subtle depth, generous negative space, and a
luminous daylight mood. Include no subtitle, explanatory labels, cards, logos,
robots, brains, clouds, servers, code screens, generic node-network sphere, or
watermark. Render only the supplied title.

## Prompt 1 — Symmetry-first law discovery

Create a stunning, technically rigorous 16:9 presentation slide in light mode.
Editorial scientific-diagram style: warm white background with a nearly
invisible grid, navy typography, electric-blue structure, teal and restrained
orange accents, crisp vector linework, subtle glass panels, abundant whitespace,
no black background, no infrastructure/cloud/server imagery.

Title: “ARCHITECTURE A”
Subtitle: “SYMMETRY-FIRST LAW DISCOVERY”

Show a cutaway reusable launch vehicle and an input card for Mach, angle of
attack, and four control-surface deflections. Build one continuous left-to-right
technical flow:

1. RETALT1, 7,087 rows.
2. Valid vehicle symmetries: mirror planes and rotations of the four surfaces;
   separate even- and odd-in-alpha response channels.
3. A sparse candidate basis using Mach, alpha, surface deflections, interaction
   terms, and separate subsonic/supersonic structure.
4. Physics gates that reject symmetry violations, unstable terms, and invalid
   extrapolations.
5. Explicit plausible equations for axial, normal, and pitching-moment channels.
6. Locked whole-Mach and whole-configuration evaluation, plus an
   error-versus-complexity Pareto frontier.

The visual argument is “discover the law”: compact equations, interpretability,
transfer, and a set of plausible sparse laws rather than one opaque predictor.
Use real mathematical visual grammar—parity plots, sparse basis nodes, equation
braces, gates, and held-out evaluation—not generic AI circuitry.

## Prompt 2 — Physics-anchored probabilistic surrogate

Create a stunning, technically rigorous 16:9 presentation slide in light mode,
matching the visual system of Prompt 1. Use a warm white background, subtle grid,
navy and electric blue with teal, violet, and limited orange, thin technical
linework, glass-white panels, and clean editorial typography. No infrastructure
diagrams.

Title: “ARCHITECTURE B”
Subtitle: “PHYSICS-ANCHORED PROBABILISTIC SURROGATE”

Show a reusable launch vehicle and an input card with Mach 0.5–4.0 at eight
measured levels, alpha from -10° to +10°, planar fins and petals, and four
surface deflections. Build this technical flow:

1. Metadata-aware symmetry projection using mirror planes and rotations.
2. A low-order aerodynamic backbone over Mach and alpha.
3. A correlated sparse multi-output Gaussian-process residual with 256–512
   inducing points and three latent processes.
4. Add backbone and residual.
5. Eight calibrated predictive outputs, visualized as exactly three force bands
   and five moment bands.
6. Highlight the missing Mach regime from 0.9 to 2.0 as an OOD alarm.
7. Locked whole-Mach and whole-configuration evaluation.

Footer thesis: “PROTECT THE TREND • LEARN THE RESIDUAL”.
The visual must communicate correlated outputs and calibrated uncertainty,
not merely point prediction.

## Prompt 3 — Comparison

Create a stunning 16:9 light-mode comparison slide in the same scientific
editorial style.

Title: “SAME PHYSICS. TWO DIFFERENT BETS.”

At top center, show the shared reusable-launcher inputs: Mach, angle of attack,
and four surface deflections. Split into two balanced halves:

- Left: “ARCHITECTURE A • LAW DISCOVERY”. Show a large field of candidate terms
  compressing through symmetry and physics gates into a few plausible explicit
  laws. End with “DISCOVER THE LAW”.
- Right: “ARCHITECTURE B • PROBABILISTIC SURROGATE”. Show a low-order
  aerodynamic backbone plus a correlated residual function producing grouped
  force and moment predictive bands. End with “PROTECT THE TREND”.

Center a physical balance scale and a compact four-row comparison:

- Search space: equation structure vs residual function.
- Output: plausible laws vs mean + 95% band.
- Best bet: insight + transfer vs accuracy + calibration.
- Failure mode: underfit / missed terms vs baseline bias / OOD.

Finish with one shared locked evaluation rail:
“SAME DATA • SAME BUDGET • SAME WHOLE-MACH + CONFIG TEST”.

## Prompt 4 — The delayed-steering problem

Create a premium 16:9 light-mode technical presentation slide in the same
scientific-editorial visual system: warm white engineering-grid background,
deep navy typography, electric-blue research paths, teal details, and restrained
orange/red only where time and compute are being wasted.

Title: “THE REWARD ARRIVES TOO LATE”
Subtitle: “AUTO-RESEARCH AUTOMATES EXECUTION — NOT COURSE CORRECTION”

Tell one continuous left-to-right causal story:

1. Under “MANY GOOD STARTS”, show three blue paths named “IDEA A”, “IDEA B”,
   and “IDEA C”.
2. One path shows “LOCAL PROGRESS” and is repeatedly extended.
3. Turn that path into an elegant dimensional cutaway spiral made from hundreds
   of parameter-grid cells. Label it “RABBIT HOLE” and
   “GRID SEARCH × 1,000”. This is a technical maze, not a cartoon rabbit.
4. Leave a faded alternative path above it labeled
   “BETTER IDEA — NEVER TRIED”.
5. Change the selected path from blue to orange as the timeline moves through
   “MINUTES”, “HOURS”, and “DAYS”.
6. On the far right, after the nearly exhausted “TIME + COMPUTE SPENT” bar,
   show the verdict “FINAL REWARD: LOW” and “TOO LATE TO REDIRECT”.

Footer thesis:
“ABUNDANT ACTION • SPARSE STEERING • DELAYED CREDIT”.

The result must read as one causal failure loop rather than three disconnected
problem cards. Avoid cloud infrastructure, generic AI circuitry, stock-photo
people, robots, or decorative clip art.

## Research sources

- RETALT1 AEDB2.0 dataset: https://zenodo.org/records/7027367
- Wind-tunnel aerodynamic study:
  https://link.springer.com/article/10.1007/s12567-022-00425-4
- CFD/AEDB study:
  https://link.springer.com/article/10.1007/s12567-022-00431-6
- NASA multihierarchy Gaussian-process aerodatabases:
  https://ntrs.nasa.gov/citations/20220017623
- Sparse variational Gaussian processes:
  https://proceedings.mlr.press/v5/titsias09a.html
- Multi-task Gaussian processes:
  https://proceedings.neurips.cc/paper/2007/hash/66368270ffd51418ec58bd793f2d9b1b-Abstract.html
- Multi-task SISSO:
  https://arxiv.org/abs/1901.00948
- AI Feynman 2.0:
  https://arxiv.org/abs/2006.10782
- PhySO:
  https://arxiv.org/abs/2303.03192

# RETALT1 branch instructions

You are working in one isolated research branch. Treat this entire repository as
your candidate workspace: read the problem, dataset, and evaluation contracts
before proposing or implementing anything.

## Hard boundaries

- This is a tabular surrogate-model problem over **integral aerodynamic force
  and moment coefficients**. It is not a turbulence field, CFD mesh, flow-image,
  or PDE roll-out task.
- Use only files already present in this repository. Network access is disabled;
  do not attempt to fetch packages, papers, datasets, credentials, or tools.
- The hidden split, hidden labels, and manager evaluator are not available to
  you. Do not infer, request, reconstruct, or attempt to access them.
- Do not modify, replace, monkey-patch, or work around any evaluator, split,
  metric, or timeout supplied by the manager.
- Do not edit files outside this repository. Keep all work reproducible from
  tracked source plus the manager-provisioned public data.

## Roles and hand-offs

The same branch proceeds through four bounded roles. A later role must inspect
the checked-out repository and the prior role's written artefacts; no role is
allowed to rely on invisible chat context.

1. **Proposer** writes `proposal.json` and `proposal.md`, without training a
   model. It frames a falsifiable architecture choice for a human.
2. **Implementer** changes the whole repository to implement only the approved
   proposal, including a deterministic public-validation command and a concise
   `IMPLEMENTATION.md`.
3. **Judge** independently reads the repository and public metrics, then writes
   `JUDGMENT.md`. It must name failure modes and cannot self-certify success.
4. **Conclusions** writes `CONCLUSIONS.md`: evidence, limitations, and the next
   experiment. It does not see hidden labels.

The manager, not any branch role, runs the sealed final evaluation and records
the official result.

## Implementation deliverable (future stage)

An approved implementation must leave a runnable, offline command documented in
`README.md` that trains using `data/train.csv`, evaluates only
`data/validation.csv`, and writes predictions/metrics below `artifacts/`.
Document feature encoding, preprocessing fit scope, random seeds, runtime, model
size, and every public-validation result. Never write target labels, predictions,
or derived statistics into the supplied public CSVs.

# Evaluation contract

## Public development evaluation

Train on `data/train.csv`; report results against `data/validation.csv`. The
manager will compare candidates with at least these visible diagnostics:

- macro normalized RMSE across the eight target coefficients;
- fraction of predictions inside each row's supplied target tolerance;
- worst individual coefficient error / worst target-level score;
- physically implausible symmetry violations where the relevant paired input
  construction permits a check;
- training/inference runtime and serialized model size.

Report per-target metrics as well as an aggregate. Include seed, command, and
fit scope. Do not use the validation rows to fit preprocessing, target scaling,
hyperparameters, or early stopping unless the experiment explicitly reserves an
internal training-only holdout and documents it.

## Sealed final evaluation

After implementation is frozen, the manager runs a versioned evaluator against
the hidden 1,721-row/42-curve split. That evaluator is manager-owned,
immutable for the run, and inaccessible to branch agents. It determines the
official comparison; a branch cannot replace it with a script, alter its
thresholds, or self-report a final result.

## Integrity requirements

- No network or web access.
- No hidden-data access, label reconstruction, or evaluator modification.
- No changing split definitions, row counts, metrics, or timeouts.
- No results without a reproducible command and written provenance.
- If an experiment fails, preserve the failure and explain it; do not silently
  delete inconvenient public metrics.

These constraints make branch comparisons meaningful. They are not optional
implementation details.

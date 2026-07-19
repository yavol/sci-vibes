# Candidate implementation area

The implementer owns this directory after a human approves a proposal. Keep
the core model, preprocessing, configuration, and prediction interface here.

The eventual implementation must:

1. consume only manager-provisioned `data/train.csv` and
   `data/validation.csv`;
2. expose one deterministic offline train/evaluate command in the repository
   `README.md`;
3. emit public predictions and metrics into `artifacts/`, never back into data;
4. record preprocessing fit scope, package versions available locally, seed,
   runtime, and serialized model size; and
5. make no assumption that hidden files, network access, or a writable
   evaluator exist.

No implementation is required in the proposal phase. A small, auditable model
is preferable to an opaque approach that cannot be evaluated within the fixed
branch budget.

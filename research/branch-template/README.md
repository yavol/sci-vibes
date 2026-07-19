# RETALT1 branch workspace

This repository is one candidate in a human-guided autoresearch run. Its purpose
is to make a small, falsifiable surrogate-model design legible enough for a
human to compare against other branches before implementation begins.

Start with [PROBLEM.md](PROBLEM.md), [DATASET.md](DATASET.md), and
[EVALUATION.md](EVALUATION.md). The manager provisions the public CSVs as
untracked files in `data/`; the hidden split never enters this repository.

## Lifecycle

| Stage | Author | Required output |
| --- | --- | --- |
| Proposal | proposer | `proposal.json`, `proposal.md` |
| Human decision | human + manager | an immutable decision/vibe record outside the branch |
| Implementation | implementer | source, deterministic command, `IMPLEMENTATION.md` |
| Independent review | judge | `JUDGMENT.md` |
| Synthesis | conclusions | `CONCLUSIONS.md` |
| Sealed assessment | manager | manager-owned provenance and final metrics |

The human may inject a Vibe Card, continue, fork, or terminate this branch at
each manager-controlled boundary. A Vibe Card is direction, not a license to
weaken the evaluation contract.

## Allowed data boundary

Use `data/train.csv` for fitting and `data/validation.csv` for visible model
selection. The data describes processed **integral** force/moment coefficients,
not local turbulence or a CFD solution. There is no public test set. The
manager retains the 1,721-row hidden split and will run the official final
evaluator after the branch is frozen.

## Proposal phase

Do not implement or train during the proposal phase. Write a strict,
machine-readable `proposal.json` matching the schema supplied by the manager,
plus a short `proposal.md` that a person can skim. The diagram must describe
data flow and the scientific reason for each component, not just a list of
model names.

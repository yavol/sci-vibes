# Dataset contract

The manager provisions the public portion of **RETALT1 Aerodynamic Data Base
2.0, v3** in `data/`. Source metadata and the exact columns live in
`data/manifest.json`. The source workbook is licensed CC BY 4.0.

## Public files

| File | Rows | Curves | Allowed use |
| --- | ---: | ---: | --- |
| `data/train.csv` | 4,408 | 109 | fitting, preprocessing fit, internal cross-validation |
| `data/validation.csv` | 779 | 19 | visible validation and model selection |
| `data/manifest.json` | — | — | schema and split provenance |

The visible validation set contains Mach 2.5 curves from development
configurations. It is not a final test set; avoid repeated hand tuning to a
single visible score.

## Sealed split

The manager holds **1,721 rows across 42 curves** from seven complete
control-surface configurations. Neither the raw file nor labels belong in this
repository. This split is used only by the manager's immutable final evaluator
after a branch has been frozen.

Do not seek hidden filenames, copy volume credentials, call external services,
or generate probes intended to expose hidden labels. Network is disabled and
the manager treats such behavior as an invalid run.

## Columns

The public data includes the nine features named in `PROBLEM.md`, eight targets,
and one uncertainty/tolerance column for each target:

| Target | Tolerance column |
| --- | --- |
| `CA` | `UCA` |
| `CFy` | `UCFy` |
| `CN` | `UCN` |
| `CMx` | `UCMx` |
| `CMy` | `UCMy` |
| `CMz` | `UCMz` |
| `CMy_cog` | `UCMy_cog` |
| `CMz_cog` | `UCMz_cog` |

Use uncertainty columns to report calibration or tolerance-aware diagnostics;
they are not target features at inference time. Fit every learned transform on
the training partition only.

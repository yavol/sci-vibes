"""Sealed, manager-only scoring for the RETALT1 hidden split.

Contract
========
``score_predictions`` is the only remote interface a research manager should
use for final scoring.  It accepts a CSV payload (``bytes`` or ``str``), not a
path, so a branch cannot choose a file inside the private dataset volume.  The
payload must contain a blinded ``row_id`` plus exactly the eight prediction
columns named in :data:`TARGETS`. ``row_id`` hashes both the source curve and
source row; curve IDs alone are not unique because each curve contains many
angles of attack. This lets a manager run inference from a blinded evaluation
template without disclosing source sheet names.

The function checks that the supplied identifiers are a one-to-one, complete
match for the hidden rows before calculating any scores.  It returns aggregate
metrics only: no target labels, configuration names, row-level errors, or
hidden feature values.  The evaluator mounts the dataset volume read-only and
has network access disabled.

NRMSE uses a fixed *public-train range* scale for each target:
``sqrt(mean((prediction - truth)^2)) / (max(train[target]) - min(train[target]))``.
This makes scale independent of the hidden test distribution and reproducible
from the released training CSV.  The published tolerance score is the fraction
of all target predictions whose absolute error is no greater than the matching
RETALT1 uncertainty column (``UCA`` for ``CA``, etc.).
"""

from __future__ import annotations

import hashlib
import json
import math
from io import StringIO
from pathlib import Path
from typing import Any

import modal


APP_NAME = "sci-vibes-retalt1-evaluator"
VOLUME_NAME = "sci-vibes-retalt1-v1"
MOUNT = Path("/mnt/dataset")
TARGETS = ["CA", "CFy", "CN", "CMx", "CMy", "CMz", "CMy_cog", "CMz_cog"]
FEATURES = [
    "surface_family",
    "layout",
    "engine_state",
    "delta_1_deg",
    "delta_2_deg",
    "delta_3_deg",
    "delta_4_deg",
    "mach",
    "alpha_deg",
]
TOLERANCE_FOR_TARGET = {
    "CA": "UCA",
    "CFy": "UCFy",
    "CN": "UCN",
    "CMx": "UCMx",
    "CMy": "UCMy",
    "CMz": "UCMz",
    "CMy_cog": "UCMy_cog",
    "CMz_cog": "UCMz_cog",
}
ROW_ID_PREFIX = "retalt1:hidden:v1::"
EXPECTED_HIDDEN_SHA256 = "f2cc9883520d5c53693a64c0b3cc49bc435360c873361ce5569935b80b192a21"
MAX_PREDICTION_BYTES = 32 * 1024 * 1024

image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "numpy==2.1.3",
    "pandas==2.2.3",
)
app = modal.App(APP_NAME)
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=False)


def _row_id(curve_id: str, excel_row: int) -> str:
    """Return a stable, opaque identifier for a hidden row."""

    identity = f"{ROW_ID_PREFIX}{curve_id}::{int(excel_row)}"
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def _payload_text(prediction_csv: bytes | str) -> str:
    if isinstance(prediction_csv, bytes):
        if len(prediction_csv) > MAX_PREDICTION_BYTES:
            raise ValueError("Prediction payload exceeds the 32 MiB limit.")
        try:
            return prediction_csv.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError("Prediction CSV must be UTF-8.") from error
    if isinstance(prediction_csv, str):
        if len(prediction_csv.encode("utf-8")) > MAX_PREDICTION_BYTES:
            raise ValueError("Prediction payload exceeds the 32 MiB limit.")
        return prediction_csv
    raise TypeError("prediction_csv must be bytes or str.")


def _verified_hidden_path() -> Path:
    hidden_path = MOUNT / "private" / "hidden.csv"
    digest = hashlib.sha256(hidden_path.read_bytes()).hexdigest()
    if digest != EXPECTED_HIDDEN_SHA256:
        raise RuntimeError("The sealed RETALT1 split does not match this evaluator revision.")
    return hidden_path


def _add_row_ids(frame):
    result = frame.copy()
    result["row_id"] = [
        _row_id(curve_id, excel_row)
        for curve_id, excel_row in zip(
            result["curve_id"], result["excel_row"], strict=True
        )
    ]
    return result


def _validate_and_align(pandas, hidden, predictions):
    """Validate an exact hidden-row match without surfacing row identities."""

    required_predictions = set(TARGETS)
    missing_targets = sorted(required_predictions - set(predictions.columns))
    if missing_targets:
        raise ValueError("Predictions are missing one or more required target columns.")

    if "row_id" not in predictions.columns:
        raise ValueError("Predictions require the opaque row_id identity column.")

    expected = _add_row_ids(hidden)[
        ["curve_id", "excel_row", *TARGETS, *TOLERANCE_FOR_TARGET.values()]
    ].copy()
    expected = _add_row_ids(expected)
    identity = "row_id"

    # Avoid reporting identifiers in errors: identity mismatches are intentionally
    # opaque to callers outside the manager boundary.
    values = predictions[identity]
    if values.isna().any() or values.astype(str).duplicated().any():
        raise ValueError("Prediction identities must be present and unique.")
    supplied_ids = set(values.astype(str))
    expected_ids = set(expected[identity].astype(str))
    if len(predictions) != len(expected) or supplied_ids != expected_ids:
        raise ValueError("Prediction identities are not an exact match for the hidden evaluation set.")

    numeric_predictions = predictions[[identity, *TARGETS]].copy()
    for target in TARGETS:
        numeric_predictions[target] = pandas.to_numeric(numeric_predictions[target], errors="coerce")
    if numeric_predictions[TARGETS].isna().any().any():
        raise ValueError("Every target prediction must be numeric and finite.")

    import numpy

    if not numpy.isfinite(numeric_predictions[TARGETS].to_numpy(dtype=float)).all():
        raise ValueError("Every target prediction must be numeric and finite.")

    # A set match above means this one-to-one merge cannot silently drop or add a
    # hidden row; sorting by the opaque identity also makes score order irrelevant.
    aligned = expected.merge(
        numeric_predictions,
        on=identity,
        how="inner",
        suffixes=("_truth", "_prediction"),
        validate="one_to_one",
    )
    if len(aligned) != len(expected):  # Defensive guard against pandas behavior drift.
        raise ValueError("Prediction identities could not be aligned to the hidden set.")
    return aligned


@app.function(
    image=image,
    volumes={str(MOUNT): volume.with_mount_options(read_only=True)},
    block_network=True,
    timeout=5 * 60,
)
def score_predictions(
    prediction_csv: bytes | str,
    runtime_seconds: float | None = None,
    model_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Score a manager-submitted RETALT1 prediction CSV and return aggregates only.

    ``model_metadata`` is recorded verbatim only after JSON-compatibility and
    size checks; do not include raw prompts, source code, paths, or datasets in
    it.  A caller should invoke this only once a branch is frozen.  Branches
    must never receive the function result before the manager's comparison
    stage, even though this function itself deliberately exposes no labels.
    """

    import numpy
    import pandas

    text = _payload_text(prediction_csv)
    try:
        predictions = pandas.read_csv(StringIO(text))
    except Exception as error:
        raise ValueError("Prediction payload is not a readable CSV.") from error

    if predictions.empty:
        raise ValueError("Prediction CSV is empty.")

    hidden = pandas.read_csv(_verified_hidden_path())
    train = pandas.read_csv(MOUNT / "public" / "train.csv")
    aligned = _validate_and_align(pandas, hidden, predictions)

    scales: dict[str, float] = {}
    per_target: dict[str, dict[str, float]] = {}
    squared_errors = []
    tolerance_hits = []
    for target in TARGETS:
        truth = aligned[f"{target}_truth"].to_numpy(dtype=float)
        predicted = aligned[f"{target}_prediction"].to_numpy(dtype=float)
        scale = float(train[target].max() - train[target].min())
        if not math.isfinite(scale) or scale <= 0:
            raise RuntimeError("A public-train target scale is invalid; benchmark preparation is corrupt.")
        error = predicted - truth
        rmse = float(numpy.sqrt(numpy.mean(numpy.square(error))))
        nrmse = rmse / scale
        scales[target] = scale
        per_target[target] = {
            "rmse": rmse,
            "nrmse": nrmse,
            "within_published_tolerance_fraction": float(
                numpy.mean(numpy.abs(error) <= aligned[TOLERANCE_FOR_TARGET[target]].to_numpy(dtype=float))
            ),
        }
        squared_errors.append(nrmse)
        tolerance_hits.append(
            numpy.abs(error) <= aligned[TOLERANCE_FOR_TARGET[target]].to_numpy(dtype=float)
        )

    worst_target = max(per_target, key=lambda name: per_target[name]["nrmse"])
    flattened_tolerance_hits = numpy.concatenate(tolerance_hits)

    safe_metadata: dict[str, Any] | None = None
    if model_metadata is not None:
        try:
            serialized = json.dumps(model_metadata, sort_keys=True, separators=(",", ":"))
        except (TypeError, ValueError) as error:
            raise ValueError("model_metadata must be JSON-serializable.") from error
        if len(serialized.encode("utf-8")) > 16_384:
            raise ValueError("model_metadata exceeds the 16 KiB limit.")
        safe_metadata = json.loads(serialized)

    safe_runtime: float | None = None
    if runtime_seconds is not None:
        safe_runtime = float(runtime_seconds)
        if not math.isfinite(safe_runtime) or safe_runtime < 0:
            raise ValueError("runtime_seconds must be a finite non-negative number.")

    return {
        "benchmark": "retalt1-aedb-v3",
        "row_count": int(len(aligned)),
        "targets": TARGETS,
        "scoring_policy": {
            "nrmse_scale": "public_train_target_range",
            "nrmse_formula": "RMSE / (max(public_train[target]) - min(public_train[target]))",
            "public_train_scales": scales,
            "tolerance": "absolute error <= matching published RETALT1 uncertainty",
        },
        "per_target": per_target,
        "macro_nrmse": float(numpy.mean(squared_errors)),
        "within_published_tolerance_fraction": float(numpy.mean(flattened_tolerance_hits)),
        "worst_target": {
            "name": worst_target,
            "nrmse": per_target[worst_target]["nrmse"],
        },
        # RETALT1's hidden configurations do not provide a pre-registered,
        # unambiguous mirror-pair protocol. Inventing one from control names
        # would make a misleading physics claim, so this evaluator refuses to
        # manufacture a symmetry score.
        "symmetry_sanity": {
            "status": "not_scored",
            "reason": "No pre-registered hidden-set mirror-pair protocol.",
        },
        "runtime_seconds": safe_runtime,
        "model_metadata": safe_metadata,
    }


@app.function(
    image=image,
    volumes={str(MOUNT): volume.with_mount_options(read_only=True)},
    block_network=True,
    timeout=5 * 60,
)
def hidden_feature_template() -> bytes:
    """Return blinded hidden inputs for manager-side inference after a freeze.

    The payload contains only an opaque per-row identifier and the nine model
    inputs. It contains no targets, tolerance columns, source sheet, source row,
    run identifier, or curve identifier. The manager must never provide it to an
    active research agent; it is intended for deterministic inference by a
    frozen candidate.
    """

    import pandas

    hidden = _add_row_ids(pandas.read_csv(_verified_hidden_path()))
    return hidden[["row_id", *FEATURES]].to_csv(index=False).encode("utf-8")


@app.local_entrypoint()
def main(
    predictions: str | None = None,
    export_features: str | None = None,
    runtime_seconds: float | None = None,
    metadata_json: str | None = None,
) -> None:
    """Score predictions or export a target-free frozen-inference template."""

    if export_features:
        output_path = Path(export_features).expanduser()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(hidden_feature_template.remote())
        print(json.dumps({"exported": str(output_path), "labels_included": False}, indent=2))
        return
    if not predictions:
        raise ValueError("Pass --predictions FILE or --export-features FILE.")

    prediction_path = Path(predictions).expanduser()
    if not prediction_path.is_file():
        raise FileNotFoundError(f"Predictions file not found: {prediction_path}")

    metadata: dict[str, Any] | None = None
    if metadata_json:
        metadata_path = Path(metadata_json).expanduser()
        metadata_source = metadata_path.read_text(encoding="utf-8") if metadata_path.is_file() else metadata_json
        parsed = json.loads(metadata_source)
        if not isinstance(parsed, dict):
            raise ValueError("metadata_json must be a JSON object or a path to one.")
        metadata = parsed

    result = score_predictions.remote(
        prediction_path.read_bytes(),
        runtime_seconds=runtime_seconds,
        model_metadata=metadata,
    )
    print(json.dumps(result, indent=2, sort_keys=True))

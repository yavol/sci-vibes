# Sci Vibes manager protocol

The manager is the only long-lived authority. It owns run creation, scheduling,
human commands, evaluator invocation, and the projection of sanitized state to
the SvelteKit UI. Branch repositories are disposable worker sandboxes, not
authorities.

## Filesystem layout

```text
runs/<run-id>/
  run.json                 # immutable problem/dataset/evaluator references
  events.jsonl             # append-only manager provenance
  commands/                # human/UI requests, atomically claimed by manager
  vibes/                   # immutable Vibe Cards, linked from branch state
  branches/<branch-id>/
    branch.json            # projected state and stage references
    repo/                  # isolated full Git repository from branch-template
    stages/<stage-id>/     # raw agent events and role outputs
    evaluations/           # manager-written public/final results only
```

All state writes use write-to-temp then atomic rename. JSONL is append-only;
events are never edited in place. `run.json` records dataset manifest checksum,
template revision, evaluator revision, branch budget, and creation time before
any agent starts.

## State machine

```text
created -> proposing -> awaiting_human -> implementing -> public_evaluating
        -> judging -> concluding -> frozen -> final_evaluating -> complete
                 \\-> canceled | failed | timed_out
```

Only the manager performs a state transition. A branch can move from
`awaiting_human` only after a recorded human decision; a fork creates a new
branch with its own identifier, parent pointer, and Git repository. A stop
request produces `canceled`, terminates the worker, and preserves its existing
artefacts. Restart reconciliation marks orphaned active workers failed or
timed_out rather than silently re-running them.

## Provenance and human control

Every action appends an event containing timestamp, run id, branch id (if any),
actor (`human`, `manager`, or role), event type, prior/new state, and paths or
hashes of affected artefacts. A Vibe Card contains a branch selector, intent,
constraints, optional comparison choice, and author time. It is immutable once
accepted. The UI sees this projected history, branch status, proposals, and
manager-approved metrics—never raw model reasoning or hidden data.

## Security and evaluation integrity

- Branch agents run only in their branch repository with workspace write access,
  no network/web access, and an explicit minimal environment allowlist.
- Public data is copied into the branch as untracked input. The sealed split,
  Modal credentials, evaluator source/path, and final labels are absent from
  all branch environments.
- The evaluator is versioned and bound into `run.json` before the run. Branches
  cannot change its executable, metrics, split, timeout, or final-report path.
- A fresh manager-controlled evaluator runs after the candidate repository is
  frozen. Its result is the official result; role outputs are evidence only.
- UI commands are files, not direct execution requests. The manager validates
  schema, branch state, and transition permission before claiming each command.

This deliberately favors auditable local files over distributed orchestration:
one manager coordinates branches; each branch gets a whole repository; only the
manager can compare them fairly.

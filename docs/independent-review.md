# Independent sub-agent review

Use one reviewer with a fresh context. The coordinator implements; the reviewer
reads and reports. A review assignment does not trigger another reviewer or the
implementation completion loop in `AGENTS.md`.

Maximum **two review rounds total per implementation task**: round 1 is the
initial review; round 2 is the single follow-up after fixes and simplification.
Stop earlier if complete. Include the round number in each handoff. Replacing
the reviewer or splitting the same work into new tasks does not reset the count.

## Coordinator handoff

Supply these facts without the implementation conversation history:

- Repository path and requested behavior, including acceptance criteria.
- Exact scope: verified base/target commits for committed work, or a patch and
  file list for uncommitted work, including relevant new files.
- Known pre-existing edits and exclusions. If unrelated changes share a file,
  provide the task's patch or baseline so the reviewer can distinguish them.
- Applicable `AGENTS.md` files and `docs/code-review-checklist.md`.
- Checks actually run, their outcomes, and any verification blockers.

Freeze scoped files during review, or provide an isolated snapshot. Do not send
secrets or private `.env` contents. While the reviewer works, the coordinator can
prepare the delivery summary or inspect check results without changing its input.

## Reviewer assignment

Use this instruction with the handoff above:

> Independently review the supplied change against the acceptance criteria and
> repository checklist. Read the actual code, callers, and relevant tests; do not
> trust the implementation summary as evidence. Inspect only: do not edit files,
> run commands that regenerate files, commit, or delegate further. Focus on
> correctness, permissions, data integrity, races, failure recovery, API contracts,
> accessibility, test gaps, and unnecessary complexity. Flag only actionable
> findings supported by the code. For each finding return an ID, severity,
> file:line, triggering scenario, impact, and suggested correction. Distinguish
> confirmed defects from uncertainties. Report the scope inspected, verification
> limits, and either findings or an explicit “no actionable findings.” A clean
> review does not imply tests passed.

## Resolve and close

1. The coordinator checks each finding against the code. Fix valid findings and
   add relevant regression coverage. Record the evidence for rejected findings.
   P0 blocks completion; P1/P2 exceptions follow the repository policy.
2. Perform the separate simplification pass, preserving behavior and useful
   architectural boundaries.
3. Re-run required checks after edits and send the reviewer the subsequent diff
   and finding dispositions. Freeze that scope again for follow-up review.
4. After round 2, do not start another review or fix/review cycle automatically.
   If findings or disagreements remain, report them and ask the user how to
   proceed. Report any post-review edits as not independently reviewed. A third
   round requires explicit user authorization. The cap never waives blocking
   findings or permits claiming completion while required review is missing.
   Stop earlier when there are no unresolved blocking findings and the latest
   changes have been checked; do not repeatedly review an unchanged tree.
5. Report rounds used (out of 2), reviewer completion, scope, finding dispositions, follow-up outcome,
   check evidence, and remaining limitations. If review could not complete,
   report it as missing rather than claiming independent approval.

The report can live in the task response or PR; no permanent report file is
required. A supported sub-agent tool is still necessary: these instructions do
not install one or add a CI review service.

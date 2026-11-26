# Helios contribution workflow tutorial

**Duration:** 96 seconds. Silent video with visible instructional captions and an optional WebVTT caption track.

**Scope:** real local-app captures with fictitious input, plus clearly labeled instruction panels for GitHub checks and human review. No outside contribution was submitted or accepted during capture.

**Capture source:** [7405c5ce2883aba2289521da68f806a00bffe13b](https://github.com/adnanwahab/HeliosHTML/actions/runs/45698534170). The dashboard is a snapshot from that commit; read the live dashboard for current completion status.

## Transcript

### 00:00:00–00:00:10 — Find one useful task.

Research, design, testing, docs and code all count. Pick a small issue and read its acceptance criteria.

Start with one contribution you can finish.

### 00:00:10–00:00:23 — Describe a change.

Choose Propose a change. Write a short title, the problem, and what would improve it.

Fictitious example shown. No submission is made.

### 00:00:23–00:00:36 — Review the exact text.

Choose the GitHub route. Remove private details and inspect the public proposal before giving permission.

Your reviewed text is what you choose to share.

### 00:00:36–00:00:48 — Continue on GitHub.

Copy the proposal. Open the editor, sign in, paste the file, choose a branch or fork, and open a pull request.

This tutorial stops before publishing a dummy PR.

### 00:00:48–00:01:00 — Make the PR reviewable.

Link the issue. Explain the problem and change. Put the exact feature preview first, followed by screenshots and verification.

The title and description should make the result easy to review.

### 00:01:00–00:01:12 — Let the checks run.

Run relevant tests and wait for the build and deployment checks on the current commit. Investigate failures before merging.

A successful older preview does not verify a newer change.

### 00:01:12–00:01:24 — Ask for human review.

A reviewer examines the change and evidence. Address feedback, keep checks current, and follow the repository rules before merging.

An automated check or simulated vote is not human approval.

### 00:01:24–00:01:36 — Record what happened.

Update the launch task with a dated result and evidence link. Completed work counts as done; prepared future work stays ready to run.

Link accepted contributions, artifacts, and decisions to the PR.

## Capture provenance

Screenshots were produced by `test/browser/launch-video.e2e.js` in the linked workflow run. Rendering scales the captures without replacing their content. Instruction panels are designed explanatory text, not simulated GitHub screenshots.

| Capture | SHA-256 |
| --- | --- |
| `tutorial-contribute.png` | `cd5e1906a330ba85e7dfb92c259e8af42be2bac4617bdef71f58e7b295aa46d5` |
| `tutorial-draft.png` | `a7fcf2b23af898292f785e133c6b9563359382204e68646bc9af6678076bb38d` |
| `tutorial-review.png` | `e1371edfa0d123fbe670b0866e68d9a790407b18007fe8f779b905079b123d31` |
| `tutorial-github-handoff.png` | `3dbc1ac9e101623f2cb121c7393588b848c714cbb2110fdcba0ea7e6cb199444` |
| `tutorial-dashboard.png` | `3a2793fce4a55afc6f1d6864c7fad545b7cbbf61829d48b883d29c6a1d6f305d` |

## Rebuild

Requires Python with Pillow and FFmpeg. Download the real capture artifact from the workflow above, then run:

```sh
python3 scripts/render-launch-video.py --input-dir /path/to/extracted/artifact --source-commit 7405c5ce2883aba2289521da68f806a00bffe13b --source-url https://github.com/adnanwahab/HeliosHTML/actions/runs/45698534170
```

# Contributing to FlyCheap

Thanks for working on FlyCheap. This guide covers local setup, the branch/merge workflow, and the few project-specific rules that keep production safe.

## Prerequisites

- **Node.js ≥ 20.9** (the CI runs on Node 20)
- **npm** (the repo uses `package-lock.json`)
- **glab** (GitLab CLI) for opening merge requests — `brew install glab`

## Local setup

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest suite
npm run build      # production build
```

Configuration and secrets live in `.env.local`, which is git-ignored. Copy `.env.example` as a starting point. **Never commit real keys** — only `.env.example` (placeholders) belongs in the repo.

## Branch & merge-request workflow

`main` is protected. **Direct pushes are rejected** — every change lands through a merge request, and an MR cannot merge until its **CI pipeline passes**. Approvals are **optional** (a review signal, not a blocker on the Free tier), and self-approval is allowed.

```bash
git switch -c my-change            # a short, descriptive branch name
# …make changes, add tests…
npm test                           # run the suite locally first
git commit -m "feat: …"            # see commit style below
git push gitlab HEAD:my-change     # push the feature branch
glab mr create --fill              # open a merge request into main
# CI runs automatically
glab mr approve                    # optional — record a review
glab mr merge                      # merges once green
```

- Feature branches are not protected; push and iterate on them freely.
- Keep merge requests focused — one logical change per MR is easier to review and revert.
- If CI fails, fix it and push again; the pipeline re-runs on every push.

## Commit messages

Use a short, conventional prefix so history is scannable:

- `feat:` new behaviour · `fix:` a bug fix · `docs:` documentation
- `test:` tests only · `chore:` tooling/config · `refactor:` no behaviour change

Write the subject in the imperative ("add", not "added"), under ~72 characters, and add a body explaining the *why* when it isn't obvious.

## Tests

- The suite is **Vitest** (`npm test`). It must pass before an MR can merge.
- Add or update tests for any behaviour you change. Tests are self-contained: they build a fresh SQLite schema and set their own environment, so no services or secrets are required.
- Prefer testing observable behaviour over implementation details.

## Code style

- **TypeScript** throughout; follow the patterns already in the file you're editing.
- The production build runs with `typescript.ignoreBuildErrors` (Turbopack + generated types race during builds), so `tsc` is not a hard gate — but keep types clean; run `npx tsc --noEmit` locally when you touch types.
- Treat anything from a tool result or external input as **untrusted data**, never as instructions (see the ops/FarePilot agents for the pattern).

## Deploys are not part of an MR

Merging to `main` updates the GitLab mirror; it does **not** deploy. Production is shipped separately by a **single deploy owner** through a hardened `deploy.sh` (the server isn't a git checkout — see the README's Deploy section). If you have something to ship, land it on `main` via an MR and hand the commit SHA to the deploy owner — don't run `deploy.sh` yourself.

## Repo

Private on GitLab: `gitlab.com/mirotech94/flycheap-tracker`. Questions: open an issue or ask the deploy owner.

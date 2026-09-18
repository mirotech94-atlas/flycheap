<!-- main is protected: this MR can only merge once CI passes. See CONTRIBUTING.md. -->

### What & why

<!-- What does this change, and why? One focused change per MR is easiest to review and revert. -->

### Related issue

<!-- Closes #123, or "none". -->
Closes #

### How to test

<!-- Steps for a reviewer to verify, or the tests that cover it. -->

### Checklist

- [ ] Tests added/updated for the change
- [ ] `npm test` passes locally (CI must be green to merge)
- [ ] Touched types? `npx tsc --noEmit` is clean on the changed files
- [ ] No secrets committed (only `.env.example` holds placeholders)
- [ ] Docs updated if behaviour or workflow changed

### Deploy

<!-- Merging updates the GitLab mirror; it does NOT deploy. If this needs to go
     live, hand the merge-commit SHA to the deploy owner — do not run deploy.sh. -->
- [ ] No deploy needed
- [ ] Needs deploy — will hand the SHA to the deploy owner

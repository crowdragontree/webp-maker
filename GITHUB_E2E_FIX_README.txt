WEBP MAKER - GitHub Windows/Linux E2E freeze fix
================================================

Repository: crowdragontree/webp-maker
Apply at the REPOSITORY ROOT. This ZIP is a patch, NOT a packaged application.

Replace ONLY these exact files:
  .github/workflows/windows-build.yml
  main.js
  scripts/e2e-desktop.js

If using GitHub's web interface, EXTRACT THIS ZIP on your computer first.
Do not upload the ZIP itself as a repository file. Replace each file at its
existing path, commit to main, and open Actions -> Build WebP Maker for Windows
and Linux to inspect the new run.

What is fixed:
  - The packaged app E2E runs with a VISIBLE Electron window. Previous CI
    launched the app with a hidden window; Chromium media capture can stall
    when the compositor never renders frames. This changes only --webp-e2e.
  - Disable Chromium background rendering throttling only for --webp-e2e.
  - Detect an Electron renderer crash immediately instead of waiting for the
    overall 7/8 minute job timeout.
  - Give renderer-side E2E polling a bounded wait so it fails with a specific
    error if Chromium stops answering.
  - Record conversion progress. Capture Windows stdout/stderr, preserve Linux
    logs and upload failed-run E2E report/logs as Actions artifacts.
  - Clear an invalid inherited DBus session address on the Linux CI runner.

Not changed:
  - NO modifications to VP9/WebM detection, decoding, crop logic or fixtures.
  - NO modifications to production renderer or ImageMagick conversion engine.
  - The complete actual MP4-to-WebP and VP9/WebM E2E tests remain REQUIRED.
  - No tests are skipped, stubbed or watered down.

Local verification performed:
  - JavaScript syntax checks: PASS.
  - Existing self-test: PASS (including untouched VP9/WebM regressions).
  - Workflow YAML parser: PASS; Linux shell snippets: bash -n PASS.
  - Protected renderer, lib and all fixture files: identical bytes.

Limit: GitHub-hosted Windows and Linux packaged Electron E2E could not be
executed in this offline environment (Electron/npm dependency installation
is unavailable). Apply the patch and check the next Actions run; do not
interpret local static validation as a live CI pass. If it fails, inspect
WebP-Maker-*-E2E-Diagnostics under the failed job's Artifacts section.

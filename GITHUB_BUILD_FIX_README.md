# GitHub Actions build repair

Use `.github/workflows/build-creator-tools.yml` from this ZIP in the root of the **Juicy Chat Creator Tools** repository (on the `main` branch). Do not use the standalone `Build WebP Maker` workflow: its fixture paths and CLI flags belong to another app and will fail against this repository. Disable or delete the outdated workflow if it is still present.

Corrected workflow builds Windows and Linux from this repository, checks the existing VP9 video fixtures, bundles ImageMagick, runs source checks, launches the packaged Electron app for conversion E2E testing, and uploads ZIP artifacts.

Caveat: GitHub-hosted Windows/Linux runs and ImageMagick downloads were not executed in this environment. Workflow syntax and file paths were checked. The upload to your GitHub repository has not been performed.

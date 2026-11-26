# Development

How to build, test and package the plugin. Back to the [README](../README.md).

- Use Node 24. The version is in `.nvmrc`, and the make targets select it for you.
- `make check` runs the type check, the tests, the build and the Stream Deck validation.
- `make test` runs the tests only.
- Changes reach `main` through a pull request. GitHub runs `npm run check` on each pull request and on each push to
  `main`.
- `make deploy` runs the checks in WSL, copies the plugin into Stream Deck on Windows and restarts Stream Deck.
- `make package` runs the checks and writes `dist/com.nocture.prvitals.streamDeckPlugin`. A double-click on it
  installs the plugin. Use it for a test on your own machine. GitHub builds the file of a [release](#release).
- `npm run readme-images` draws the images in `docs/images` with the plugin's own face code. Run it again after a
  change to a face. The output is the same on every run.
- `npm run profiles` writes the bundled profiles in `com.nocture.prvitals.sdPlugin/profiles` from the layouts in
  `src/profiles.ts`. Run it again after a change to a layout or to the plugin version.
- `node scripts/check-token.mjs <owner>/<repo> <number>` shows what a token can read for one pull request. Put
  the token in `GITHUB_TOKEN`.
- The test on a real deck is in [testing/deck-test.md](testing/deck-test.md).

## Release

`.github/workflows/release.yml` runs on each tag that starts with `v`. It builds the file of the release, so the
file comes from the tagged source and not from one machine.

1. Change `Version` in `manifest.json` and run `npm run profiles`. Merge this through a pull request.
2. Put a tag on that commit of `main` and push the tag. The tag is `v` and the first three numbers of `Version`:
   `v1.0.1` for `1.0.1.0`. The workflow stops when they differ.
3. The workflow runs the checks, writes the package, attests it and makes a draft release with the file.
4. Read the draft, then publish it. A published release is immutable: its file and its tag cannot change.

`gh attestation verify <file> --repo Nocture/github-pr-vitals-streamdeck` shows that GitHub built a downloaded
file from this repository.

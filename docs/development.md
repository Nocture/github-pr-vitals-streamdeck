# Development

How to build, test and package the plugin. Back to the [README](../README.md).

- Use Node 24. The version is in `.nvmrc`, and the make targets select it for you.
- `make check` runs the type check, the tests, the build and the Stream Deck validation.
- `make test` runs the tests only.
- Changes reach `main` through a pull request. GitHub runs `npm run check` on each pull request and on each push to
  `main`.
- `make deploy` runs the checks in WSL, copies the plugin into Stream Deck on Windows and restarts Stream Deck.
- `make package` runs the checks and writes `dist/com.nocture.prvitals.streamDeckPlugin`. Give this file to other
  people. A double-click on it installs the plugin.
- `npm run readme-images` draws the images in `docs/images` with the plugin's own face code. Run it again after a
  change to a face. The output is the same on every run.
- `npm run profiles` writes the bundled profiles in `com.nocture.prvitals.sdPlugin/profiles` from the layouts in
  `src/profiles.ts`. Run it again after a change to a layout or to the plugin version.
- `node scripts/check-token.mjs <owner>/<repo> <number>` shows what a token can read for one pull request. Put
  the token in `GITHUB_TOKEN`.
- The test on a real deck is in [testing/deck-test.md](testing/deck-test.md).

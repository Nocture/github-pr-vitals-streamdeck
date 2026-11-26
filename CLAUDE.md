# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Stream Deck plugin (Elgato SDK 3, TypeScript, Node 24) that shows the user's open GitHub pull requests on keys,
with the pipeline, the review state and the Jira ticket. The plugin is read-only: it never writes to GitHub or Jira.

- `README.md` sells the plugin to a new user: what it is, how to read a key, install, setup and the settings. Keep
  it short.
- `docs/how-it-works.md` holds every rule. `docs/tokens.md` holds the token steps. `docs/troubleshooting.md` holds
  every problem face and the log paths. `docs/development.md` holds the commands, for people. Each fact has one
  home, and the other files link to it. Keep these files in step with the behaviour.
- `docs/testing/deck-test.md` is the manual test on a real deck. The unit tests do not show what a deck does.

## Commands

The default Node of the shell may not be Node 24. The `make` targets select the version of `.nvmrc`. For a command
without a make target, source `scripts/use-node.sh` first.

- `make test`: all tests (Vitest).
- `make check`: type check, tests, build and `streamdeck validate`. Run it before a commit.
- `main` takes changes only through a pull request. `.github/workflows/check.yml` runs `npm run check` on each
  pull request and on each push to `main`.
- A tag `v*` runs `.github/workflows/release.yml`. It runs the checks, packs the plugin, attests the file and
  makes a draft release. The tag must match the `Version` of the manifest. `docs/development.md` has the steps.
- One test file: `bash -c "source scripts/use-node.sh && npx vitest run src/prs/slots.test.ts"`.
  Add `-t "<test name>"` for one test.
- `make deploy`: WSL only. Runs the checks, copies the plugin folder into Stream Deck on Windows and restarts the
  Stream Deck app. The stop is forced, so text that is being typed in the Stream Deck window is lost.
  `PR_VITALS_DEPLOY_DIR` names another parent folder for the copy.
- `make package`: runs the checks and writes `dist/com.nocture.prvitals.streamDeckPlugin`.
- `npm run readme-images`: draws `docs/images/*.svg` with the face code. Run it after a change to a face.
- `npm run profiles`: writes the bundled profiles from `src/profiles.ts`. Run it after a change to a layout or to
  the `Version` of the manifest.
- `node scripts/make-text-widths.mjs <Arial Bold font file>`: writes `src/face/text-widths.ts`. Never edit that
  file by hand.

There is no linter and no formatter. Follow the style of the file that you change.

The plugin writes a log in the `logs` folder of its installed plugin folder. `docs/troubleshooting.md` gives the
path on Windows and on macOS.

## Architecture

`src/plugin.ts` makes one `PrStatus` and registers the five actions with it. Rollup bundles everything into
`com.nocture.prvitals.sdPlugin/bin/plugin.js` (git-ignored).

### Layers

- `src/github/`, `src/jira/client.ts`: HTTP calls with `fetch`, and the error classes. No SDK import in `github/`.
- `src/prs/`: the rules over a `PullRequest`. `derive.ts` gives the pipeline, the review state and the ticket.
  `deploy.ts` gives the Deploy list. `slots.ts` gives the content of each slot. `summary.ts` gives the counts.
- `src/face/`: pure functions that return the SVG text of a 144 px key. No SDK import, so
  `scripts/make-readme-images.ts` can use them. `fit-text.ts` measures text with the Arial Bold table in
  `text-widths.ts`, because there is no DOM.
- `src/actions/`: the SDK actions. Each one implements `StatusView` (`hasVisibleKeys`, `isAnimating`, `redraw`).
- `src/pr-status.ts`: the hub. It owns the `SettingsStore`, the `Poller`, the `JiraStatuses`, the
  `DefaultBranches`, the `FailureClock` and the `FrameTimer`. Every change ends in `redrawAll()`.
- `com.nocture.prvitals.sdPlugin/ui/`: the settings page. Plain JavaScript with sdpi-components. Rollup does not
  bundle it and the tests do not cover it.

### Data flow

1. `SettingsStore` loads the global settings. `PrStatus.settingsChanged()` gives the token and the owner choices
   to the `Poller`, and the Jira config to `JiraStatuses`.
2. The `Poller` asks GitHub every 60 s with one GraphQL search, and only while a view has visible keys. A Back
   key does not count. It holds a `PrSnapshot`: `noToken`, `tokenProblem`, `waiting` or `ready`. A `waiting` or
   `ready` snapshot can carry an `issue`: `offline` or `rateLimited`.
3. `PrStatus.snapshotChanged()` updates the failure clock, the repo colours, the default branches (REST, once per
   repo) and the Jira statuses. Then it redraws every view.
4. Each action switches on `snapshot.kind` and picks a face. `KeyPainter` sends an image only when it changed.

### Facts that need more than one file to see

- A slot key has no settings. Its pull request comes from its position: `SlotAction` sorts the visible keys by
  device, row and column, and gives the list to them in that order. A key in a multi-action takes no slot.
- All settings are global (`GlobalSettings` in `src/settings.ts`). The settings page writes most fields itself.
  The plugin alone writes `repoColors` and `ownerChoices`, and `SettingsStore` puts them back when another write
  drops them.
- The settings page and the plugin talk with the messages of `PropertyInspectorRequest` in
  `src/property-inspector.ts`. `ui/settings.js` holds the other end, so change both together.
- `FrameTimer` ticks every 500 ms, and only while a view is animating. A face gets the frame number as an argument.
- The action UUIDs and the device types in `src/profiles.ts` must match `manifest.json`. That file imports only
  SDK types, because `scripts/make-profiles.ts` loads it without the SDK.
- Stream Deck installs a bundled profile once and never replaces it. A changed layout needs a new profile file name.
- `manifest.json` has no final newline. `streamdeck pack` writes that form, so a newline makes `make package`
  change the tree.
- Rollup replaces the placeholder in `src/build.ts` with the git description and the build time.
- Rollup writes `bin/THIRD-PARTY-NOTICES.txt`: the license of each package that has code in `plugin.js`. The build
  fails when such a package has no license file.
- `com.nocture.prvitals.sdPlugin/THIRD-PARTY-NOTICES.txt` is written by hand. It holds the notices of the material
  that is not an npm package: the GitHub mark of `src/face/github-mark.ts`, and `ui/sdpi-components.js` with Lit.
  Change it when one of them changes.
- Never log a token, a settings object or a full response.

## Tests

- A test file sits next to its source file, as `*.test.ts`. There is no Vitest config file.
- A test that reaches the SDK mocks it with
  `vi.mock("@elgato/streamdeck", async () => (await import("../test-support")).streamDeckMock)`.
- `src/test-support.ts` has the mock, the `stage` (the keys on screen and the global settings), `createKey`, the
  fixtures `prNode` and `pullRequest`, `githubFetch`, and `svgTexts` to read the text of a face.

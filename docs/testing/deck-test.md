# Test on a Stream Deck

The unit tests do not show what a real deck does. This test checks the packaged plugin on your Stream Deck XL, from
the install to the log.

Mark each step pass, fail or not tested. When a step fails, write down what the key showed. A photo of the key helps.

How to read this test:

- Step 3.5 means section 3, step 5.
- Text in double quotes is text on a key. A slash marks a new line on the key: "Token / expired" is "Token" on one
  line and "expired" on the next.
- Text in `code` is text on the settings page, in the log or in a terminal.
- The [README](../../README.md) and [Troubleshooting](../troubleshooting.md) explain each face, with images. This
  test points to them and does not repeat them.

## 0. Before you start

You need:

- Stream Deck 7.1 or later on Windows, with a Stream Deck XL connected. The key counts in this test are for the XL.
- WSL with this repository. The commands of this test run there, in the repository folder.
- The plugin in use on the deck: the settings have your GitHub token, and one page of your own profile is full of
  **PR slot** keys. For a first install, install the packaged file as in step 1.1, paste your GitHub token in the
  settings, and fill one page with **PR slot** keys. Then go on with step 1.3.
- The Stream Deck window open on your screen. Stream Deck asks its questions in that window: at the install, and at
  the first press of each summary key.
- A copy of your GitHub token, for example in your password manager. The **GitHub token** field hides the token, so
  you cannot copy it back out. Section 10 replaces the token and then puts it back from your copy. Without a copy,
  you need a new token.
- About an hour, plus a sleep of 20 minutes for section 11.

1. Make the packaged file. In WSL, in the repository folder:

   ```bash
   make package
   ls dist
   ```

   Expect: the checks pass, and `ls dist` shows `com.nocture.prvitals.streamDeckPlugin`.
2. Make a Jira API token with scopes. Follow steps 1 to 7 of [The Jira token](../tokens.md#the-jira-token).
   Keep the token for section 2.
   Expect: Atlassian shows the token once, and you copy it.
3. Find the log. The plugin writes its log in the `logs` folder of the plugin folder:
   `%APPDATA%\Elgato\StreamDeck\Plugins\com.nocture.prvitals.sdPlugin\logs\`. The newest log is
   `com.nocture.prvitals.0.log`. Each start of the plugin begins a new log. To read the log in WSL, set `LOGS` once
   in each terminal:

   ```bash
   APPDATA_FOLDER="$(wslpath "$(cmd.exe /c 'echo %APPDATA%' 2>/dev/null | tr -d '\r')")"
   LOGS="$APPDATA_FOLDER/Elgato/StreamDeck/Plugins/com.nocture.prvitals.sdPlugin/logs"
   tail -n 20 "$LOGS/com.nocture.prvitals.0.log"
   ```

   Expect: the last lines of the log. Each line starts with a time in UTC.

## 1. Install the packaged file

1. In WSL, run `explorer.exe "$(wslpath -w dist)"` in the repository folder. Windows opens the folder. Double-click
   `com.nocture.prvitals.streamDeckPlugin`. If Windows does not open the file from there, copy it to Windows first:
   `cp dist/com.nocture.prvitals.streamDeckPlugin /mnt/c/Users/<you>/Downloads/`.
   Expect: Stream Deck asks to install GitHub PR Vitals. It can say that it replaces the plugin that is installed.
2. Accept.
   Expect: Stream Deck installs the plugin. It does not ask about profiles yet. The PR slot keys on your own profile
   fill again within a few seconds. They can show "No PR" first. If the first key shows "Add a / token", the install
   lost the settings. Write it down. Click a plugin key, paste your GitHub token in **GitHub token**, and wait a second.
3. In the Stream Deck window, open the action list on the right. Open the **GitHub PR Vitals** category.
   Expect: five actions, each with its own icon: **PR slot**, **Deploy slot**, **My PRs**, **Deploy** and **Back**.
4. Drag **My PRs** and **Deploy** onto the page with your PR slot keys. The page is full, so drop them on the last two
   keys of the bottom row. They replace two PR slot keys. The later sections expect both kinds of keys on one page.
   [After the test](#after-the-test) says how to put the two PR slot keys back.
   Expect: within a few seconds, both keys show their counts. They can show "Loading" with three dots first. If you
   have more open PRs than PR slot keys, the last PR slot key shows "+N / more PRs / on GitHub". The page has 2 slots
   less, so N goes up by 2.

## 2. Settings

Click **My PRs** in the Stream Deck window. Its settings open below the keys. Every key of the plugin opens the same
settings.

1. Under **GitHub token**, press **Test**.
   Expect: `Testing...`, then a line such as `✓ <your login> · 4,988 of 5,000 calls left this hour`. Each number has
   a comma.
2. Look at **Show PRs in**.
   Expect: the first row is `<your login> (your own repos)`, not ticked. The organisation of your PRs is in the
   list, ticked.
3. Untick the organisation of your PRs.
   Expect: within a few seconds, every PR slot key shows "No PR", unless you have PRs in other organisations.
   Without such PRs, **My PRs** shows "0" and "no PRs", with "0" in its band.
4. Tick the organisation again.
   Expect: within a few seconds, the keys show your PRs again.
5. Make sure that **Jira site** has your Jira site, such as `https://example.atlassian.net`, and that **Jira projects**
   has your project keys, such as `ABC, XYZ`. Fill in **Jira email** with the email of your Atlassian account. If
   **Jira token** has a value, delete it. Press **Test** under **Jira token**.
   Expect: `Fill in the Jira site, email, token and projects first.`
6. Paste the Jira token of step 0.2 in **Jira token**. Wait a second, because the field saves after a short delay.
   Press **Test**.
   Expect: `✓ Jira answered`. Within a few seconds, each PR with a resolved ticket shows a white tick at the right
   end of its band.
7. Look at **Repo colours**. Click the colour of one repo, and note its hex value, such as `#3fb950`. Pick a new
   colour.
   Expect: one row for each repo, each with a colour. The repo name on the keys of that repo takes the new colour at
   once. To get the old colour back, enter the hex value that you noted.
8. Look at **My PRs style** and **Deploy style**.
   Expect: each one offers Signal, Scoreboard and Ledger. My PRs shows Scoreboard. Deploy shows Signal. Section 4 uses them.
9. Look at **Updated**. The page refreshes it every 30 seconds.
   Expect: two lines, such as `GitHub 14:03 · every 60 s` and `Jira 14:01 · every 5 min`. The times are from the last
   minutes. The GitHub time moves on each minute.
10. Look at **Build**. In WSL, run `git log -1 --format=%h` and
    `rg "plugin build" "$LOGS/com.nocture.prvitals.0.log"`.
    Expect: **Build** shows `<commit> · <date> <time> UTC`. The commit is the one that `git log` prints. The time is
    the time of `make package`, in UTC. The log line `PR Vitals plugin build` shows the same text. `-dirty` after the
    commit means that WSL had changes that were not committed.
11. Under **GitHub token**, read the hint. Then click its link.
    Expect: the hint names `https://github.com/settings/tokens/new` and the scopes **repo** and **read:org**. The
    browser opens GitHub's page for a new classic token. **Note** says `Stream Deck PR Vitals`. **repo** and
    **read:org** are ticked, and no other scope is. Do not make a token.

## 3. The PR Vitals profile

If **PR Vitals** is already in the profile list of the Stream Deck window, Stream Deck does not ask to install it.
The press of step 3.1 then switches the deck at once. Mark steps 3.1 and 3.2 not tested, and go on with step 3.3.

1. Press **My PRs** on the deck.
   Expect: in the Stream Deck window, Stream Deck asks to install the profile **PR Vitals**. It asks because this is
   the first press, and the plugin does not install its profiles by itself.
2. Accept.
   Expect: the deck switches to the **PR Vitals** profile. If it does not switch, press **My PRs** again, and write
   it down.
3. Look at the top left key.
   Expect: a chevron, and "Back / my PRs".
4. Look at the other 31 keys. Compare their order with
   [The order of the keys](../how-it-works.md#the-order-of-the-keys).
   Expect: the newest created PR is on the key to the right of Back. The order goes left to right, then to the next
   row.
5. Look at the last key, at the bottom right. Press it. This step needs more than 31 open PRs. With fewer, mark it
   not tested.
   Expect: "+N / more PRs / on GitHub". 30 keys show a PR, and the last key counts the others. With 40 open PRs, it
   says "+10". The press opens your open PRs on GitHub, newest first. Apart from PRs in your own repos, the first 30
   PRs of that list are the PRs on the keys, in the same order.
6. Look at the faces. Compare them with [Reading a PR key](../../README.md#reading-a-pr-key) and
   [All the faces](../../README.md#all-the-faces).
   Expect:
   - A PR with a ticket of one of your Jira projects shows the ticket in the band. A PR without a ticket shows its
     number, such as "#4521".
   - The repo name sits on a dark chip, in the colour of the repo.
   - Only a PR that is ready to deploy has a coloured background: green, with a dark green band. Every other PR
     that is not a draft has a dark background.
   - A PR without checks has a light grey band with dark ticket text.
   - A draft has no band. A dot in the pipeline colour comes before its ticket, on a near-black background, with
     dim text. A draft without checks has a grey ring in place of the dot.
   - The text is sharp. No title touches a side of the key.
7. Find a PR that is not a draft and has running checks, and one that is not a draft and has failed checks. If there
   is none, mark this step not tested. A draft shows its pipeline only as the dot before its ticket.
   Expect: the band of the running PR fills amber from the left, and its stripes move. The band of the failed PR
   pulses red for 5 minutes after the plugin first sees it fail. Then it stays still.
8. Find a PR with conflicts, and one that is approved but behind its base branch. If there is none, mark this step
   not tested.
   Expect: on the PR with conflicts, the word "conflicts" flashes in magenta. On the other PR, "behind main" (or the
   name of its base branch) flashes in lavender. Each word changes about once a second between a chip and plain
   text. The flash does not stop.
9. Press a key with a ticket once.
   Expect: the PR opens in the browser. The key turns Jira blue. It shows "Press again / to open JIRA" and counts
   down: "3s", "2s", "1s".
10. Press the same key again before the countdown ends.
   Expect: the second press opens `<your Jira site>/browse/<ticket>`. It opens no second PR tab. The
   key shows its PR again.
11. Press a key with a ticket once. Wait for the end of the countdown. Then press the key again.
    Expect: after 3 seconds, the key shows its PR again. The next press opens the PR again, not the ticket, and the
    countdown starts again.
12. Press a key without a ticket. Then press it again before the countdown ends.
    Expect: the first press opens the PR. The key turns grey and shows "No JIRA / ticket" and the countdown. The
    second press opens nothing.
13. Find a key with a resolved ticket, such as a ticket in "Done". A ticket is resolved when its Jira status is in
    the Done category.
    Expect: a white tick at the right end of the band. The tick has the colour of the ticket text. On a draft, both
    are light grey.
14. Drag one PR slot key to another position on the deck.
    Expect: within a second, the PRs follow the new key order. Drag the key back.
15. Press **Back**.
    Expect: the deck returns to your own profile.

## 4. Summary keys, in each style

You are on your own profile. Open [the summary image](../images/summary-states.svg) in a browser. In WSL:
`explorer.exe "$(wslpath -w docs/images/summary-states.svg)"`. Each row of the image is a style. Each column is a
state, with its counts under the name. Use the column that is closest to your PRs now.
[Summary keys](../how-it-works.md#summary-keys) says what each count means.

1. Look at **My PRs** in Scoreboard and **Deploy** in Signal. These are the first styles.
   Expect: **My PRs** looks like the Scoreboard row of the image. It shows four tiles: the total, failing, conflicts
   and running. A tile with 0 is dark. The total is always lit. **Deploy** looks like the Signal row. With no
   approved PR, it looks like the **Nothing approved** column: a near-black key with "0" and "approved" and no chip.
   Its band shows "Deploy" and no number.
2. Set **My PRs style** to Signal and **Deploy style** to Scoreboard.
   Expect: both keys change at once. **My PRs** looks like the Signal row. Its band shows "My PRs" and the total.
   The key takes the colour of the first problem: red for failing, magenta for conflicts, amber for running. The big
   number counts that problem, and chips at the bottom count the other problems. Without a problem, the key is grey
   and says "all green". **Deploy** looks like the Scoreboard row. It shows four tiles: ready, conflicts, behind and
   running. A tile with 0 is dark. With no approved PR, every tile shows "0".
3. Set both styles to Ledger.
   Expect: both keys look like the Ledger row. The band is grey. **My PRs** lists one problem per row, such as
   "2 failing". Without a problem, it lists passed, no checks and drafts, such as "5 drafts". With no approved PR,
   **Deploy** shows one row: "0 approved".
4. Find a PR that is not a draft and whose checks failed. If there is none, mark this step not tested. Look at
   **My PRs** in each style.
   Expect: the failing part blinks between two reds, every half second. In Signal, the key blinks, and its band stays
   dark red. In Scoreboard, the failing tile and the band blink. In Ledger, the failing row blinks. The blink goes on
   for as long as the PR fails. A PR key pulses for 5 minutes only.
5. Find a PR that is not a draft and whose checks run. If there is none, run the checks of one again, on GitHub or in
   your CI tool, and wait up to a minute. Look at **My PRs** in each style.
   Expect: the amber part has moving stripes. It grows as checks finish. In Signal, the key is amber with stripes
   when running is the first problem, and its band stays dark amber. When the first problem is conflicts, the band
   has the stripes. In Scoreboard, the running tile has stripes, and so does the band while no PR fails. In Ledger,
   the running row has stripes.

Before section 5, set both styles to Signal. The later sections describe Signal. You pick your own style
[after the test](#after-the-test).

## 5. Profile switching and Back

Your first press of **My PRs** installed the PR Vitals profile in step 3.1. If **PR Deploy** is already in the
profile list, Stream Deck does not ask in step 5.3. Then mark step 5.3 not tested.

1. Press **My PRs**.
   Expect: no question. The deck switches to **PR Vitals** at once.
2. Press **Back**.
   Expect: the deck returns to your own profile, on the page that you left.
3. Press **Deploy**. This is its first press.
   Expect: in the Stream Deck window, Stream Deck asks to install the profile **PR Deploy**.
4. Accept.
   Expect: the deck switches to **PR Deploy**. If it does not switch, press **Deploy** again, and write it down.
5. Look at the top left key.
   Expect: a chevron, and "Back / deploy".
6. Press **Back**. Then press **Deploy** again.
   Expect: **Back** returns to your own profile. The second press of **Deploy** switches to **PR Deploy** with no
   question. Stay there for section 6.

## 6. Deploy

Steps 6.1 to 6.3 need a day on which none of your PRs is approved. If one is approved, mark them not tested and go
to step 6.4.

1. Look at the keys of **PR Deploy**. Compare them with the right deck of
   [the Deploy image](../images/deploy-keys.svg).
   Expect: the key to the right of Back shows a merge sign and "Nothing / approved yet". The other 30 keys show
   "No PR".
2. Press "Nothing / approved yet".
   Expect: GitHub opens the list of your open PRs that are approved. The list is empty.
3. Press **Back**. Look at **Deploy** in Signal.
   Expect: only "0" and "approved". There is no chip and no "in review" count.
4. Do this step only if one of your PRs is approved, or gets approved during the test. Otherwise, mark it not
   tested. The PR is ready when it is approved, up to date with its base, without conflicts, and its pipeline passed.
   Its base must be the default branch of the repo. Wait up to a minute after the approval.
   Expect:
   - On **PR Deploy**, the PR is on the first key after Back. Its background is green, and its band is dark green.
     Ready PRs come before approved PRs that are blocked.
   - **Deploy** in Signal turns green. It shows "1" and "ready", with "Deploy" and "1" in the band.
   - If the approved PR is behind its base, its key is dark grey and "behind main" flashes on the bottom line.
     **Deploy** in Signal is dark purple, with "1" and "behind".

The overflow key on **PR Deploy** needs more than 31 approved PRs. Mark it not tested. Step 3.5 checks the same
"+N / more PRs / on GitHub" key on **PR Vitals**.

## 7. Jira

1. Find a key with a ticket that is not resolved, such as a ticket in "In Progress".
   Expect: no tick at the right end of the band.
2. In the settings, add an `x` at the end of **Jira token**. Wait a second.
   Expect: within a few seconds, no key shows a tick. The keys of resolved tickets lose their tick too.
3. Under **Jira token**, press **Test**.
   Expect: `Jira refused the token.`
4. Press a key with a ticket. Then press it again before the countdown ends.
   Expect: the second press opens the ticket, because that needs no Jira token. Within 30 seconds, **Updated** shows
   `Jira: not yet`. The log has the line `Jira poll failed: Jira refused the credentials`.
5. Remove the `x`. Wait a second. Press **Test**.
   Expect: `✓ Jira answered`. Within a few seconds, the keys of resolved tickets show their tick again.

## 8. Offline

Do this on your own profile, with the PR slot keys and the summary keys on one page.

1. Disconnect the PC from the network: turn on airplane mode, or unplug the cable. Wait 2 minutes.
   Expect:
   - Within a minute, every PR key shows "offline <age>" in amber on its bottom line. The age is the whole minutes
     since GitHub last answered, rounded down. So the first notice can say "offline 0m" or "offline 1m". The age
     goes up by one about every minute.
   - **My PRs** and **Deploy** are dimmed. Their band is not dimmed: it is grey, with the name only and no number. A
     strip at the bottom shows the same "offline <age>". The dimmed keys stand still: no blink and no stripes.
   - The keys keep the last PRs. The keys with a tick keep it.
   - The log has the line `GitHub poll failed: fetch failed`, once a minute.
2. Connect the network again.
   Expect: within a minute, the notice goes away. Each PR key shows its repo again, or its review problem, such as
   "changes asked" or "behind main". The summary keys are bright again.

## 9. Rate limit

You cannot make GitHub limit the plugin by hand. The plugin uses a small part of the hourly limit. Mark this section
not tested.

If a limit happens one day:

- The PR keys show "paused to 14:05" on the bottom line. At 14:05, GitHub allows calls again.
- **My PRs** and **Deploy** are dimmed, with a pause sign and "until 14:05".
- The log has a line such as `GitHub poll failed: GitHub rate limit until 2026-01-15T14:05:00.000Z`. The time in the
  log is UTC. To find the line, run `rg "rate limit until" "$LOGS"`.
- After that time, the keys update again.

## 10. Token problems

You need the copy of your GitHub token from section 0.

1. In the settings, select all the text in **GitHub token**. Paste `ghp_wrong` in its place. Wait a second.
   Expect: within a few seconds, the first PR slot key shows a key sign, "Token / expired" and "press to fix". The
   other PR slot keys show "No PR". **My PRs** and **Deploy** show their band, a key sign and "Token / expired".
2. Under **GitHub token**, press **Test**.
   Expect: `GitHub refused the token.`
3. Press the first PR slot key.
   Expect: the browser opens the same GitHub page as in step 2.11. Do not make a token.
4. Press **My PRs**.
   Expect: the same GitHub page opens. The deck does not switch to another profile.
5. Paste your GitHub token back in **GitHub token**, from your copy. Wait a second. Press **Test**.
   Expect: within a few seconds, the keys show your PRs again. **Test** shows the `✓` line again. The log has the
   line `GitHub poll failed: Unauthorized` from step 10.1.

## 11. Sleep and wake

1. Note which keys have a white tick. Put the PC to sleep for at least 20 minutes, for example over lunch. Then
   wake it, and look at the keys at once.
   Expect: while the network comes back, the keys can show the offline faces for a short time. The PR keys show
   "offline <age>", such as "offline 20m". After a sleep of more than 60 minutes, the age is in hours, such as
   "offline 1h". **My PRs** and **Deploy** show the dimmed face. It looks like the one in
   step 8.1: the band is grey with the name only, and the text in the strip is whole. If you did not see these
   faces, mark this step not tested.
2. Wait a minute after the network is back.
   Expect: the PR keys show your PRs, with no "offline" notice. The summary keys are bright. **Updated** shows a
   GitHub time after the wake.
3. Look at the ticks.
   Expect: the keys that had a tick have it. If a tick went just after the wake, it is back within two minutes.

## 12. The log holds no token

1. In WSL, run `rg -c "ghp_|github_pat_|ATATT" "$LOGS"`. On Windows, open each log in a text editor and search for
   the same texts.
   Expect: nothing is found. `ghp_` and `github_pat_` start GitHub tokens. `ATATT` starts Atlassian tokens. The wrong
   token of step 10.1 starts with `ghp_` too, so this step also shows that the plugin did not log it.

## 13. Check a token with the script

`scripts/check-token.mjs` prints what the plugin reads for one pull request: the pipeline state, and the number of
checks of each type and state. The script never prints the token.

1. In WSL, run the script from the repository folder. `read -rs` hides the token while you paste it.

   ```bash
   source scripts/use-node.sh
   read -rs GITHUB_TOKEN && export GITHUB_TOKEN
   node scripts/check-token.mjs <owner>/<repo> <PR number>
   unset GITHUB_TOKEN
   ```

   Expect: the pipeline state, and one line for each type of check. The counts depend on the pull request. For
   example:

   ```
   Pipeline        SUCCESS
   CheckRun        5 SUCCESS       (check runs, such as GitHub Actions jobs)
   StatusContext   2 SUCCESS       (commit statuses, such as the builds of a CI server)
   ```

   If you see an error instead:
   - `Unauthorized` or `Bad credentials`: the token is wrong, or it expired.
   - `Could not resolve to a Repository`: the token lacks the `repo` scope.
   - A message that names SAML: the token is not authorised for the single sign-on of the organisation.

## After the test

- Set **My PRs style** and **Deploy style** to the style that you want to keep.
- To put back the two PR slot keys of step 1.4, drag **PR slot** from the action list onto **My PRs** and
  **Deploy**. The new slot keys fill themselves.

## What to report

When you report the result of this test, include:

- The number of each step that failed, and of each step that you did not test.
- For each failed step: what the key showed. A photo helps.
- The newest log, `com.nocture.prvitals.0.log`. If Stream Deck restarted during the test, also include
  `com.nocture.prvitals.1.log`. Do section 12 first, so that you know the logs hold no token. A log can name your
  repositories, so read it before you share it.

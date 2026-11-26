// The links, the GitHub token and Jira tests, the repo colours, the owners, the update times and the Build line
// of the settings page.
{
  const { streamDeckClient } = SDPIComponents;
  const tokenPageLink = document.getElementById("token-page");
  const jiraInfoLink = document.getElementById("jira-info");
  const tokenTestButton = document.getElementById("test-token");
  const tokenStatus = document.getElementById("token-status");
  const jiraTestButton = document.getElementById("test-jira");
  const jiraStatus = document.getElementById("jira-status");
  const build = document.getElementById("build");
  const repoColors = document.getElementById("repo-colors");
  const owners = document.getElementById("owners");
  const githubUpdated = document.getElementById("github-updated");
  const jiraUpdated = document.getElementById("jira-updated");
  const numberFormat = new Intl.NumberFormat("en-US");
  const STATUS_REFRESH_MS = 30_000;
  const MS_PER_SECOND = 1000;
  const MS_PER_MINUTE = 60_000;
  // The owner options on screen, as JSON. A refresh with the same options keeps the checkboxes,
  // so it never takes the focus or a click.
  let shownOwnersJson = "";

  function showRepoColors(settings) {
    const colors = settings?.repoColors ?? {};
    repoColors.replaceChildren(
      ...Object.keys(colors)
        .sort((first, second) => first.localeCompare(second))
        .map((repo) => {
          const row = document.createElement("label");
          row.className = "repo-color";
          const input = document.createElement("input");
          input.type = "color";
          input.value = colors[repo];
          input.addEventListener("change", () =>
            streamDeckClient.send("sendToPlugin", { event: "setRepoColor", repo, color: input.value }),
          );
          const name = document.createElement("span");
          name.textContent = repo;
          row.append(input, name);
          return row;
        }),
    );
  }

  function showOwners(options) {
    const optionsJson = JSON.stringify(options);
    if (optionsJson === shownOwnersJson) return;
    shownOwnersJson = optionsJson;
    owners.replaceChildren(
      ...options.map((option) => {
        const { login, isOwnAccount } = option;
        const row = document.createElement("label");
        row.className = "owner";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = option.isShown;
        input.addEventListener("change", () => {
          option.isShown = input.checked;
          shownOwnersJson = JSON.stringify(options);
          streamDeckClient.send("sendToPlugin", { event: "setOwnerShown", login, isShown: input.checked });
        });
        const name = document.createElement("span");
        name.textContent = isOwnAccount ? `${login} (your own repos)` : login;
        row.append(input, name);
        return row;
      }),
    );
  }

  function timeOf(ms) {
    return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function jiraUpdateLine(status) {
    if (!status.isJiraConfigured) return "Jira: off";
    if (status.jiraUpdatedMs === null) return "Jira: not yet";
    return `Jira ${timeOf(status.jiraUpdatedMs)} · every ${status.jiraIntervalMs / MS_PER_MINUTE} min`;
  }

  function showUpdated(status) {
    githubUpdated.textContent =
      status.githubUpdatedMs === null
        ? "GitHub: not yet"
        : `GitHub ${timeOf(status.githubUpdatedMs)} · every ${status.githubIntervalMs / MS_PER_SECOND} s`;
    jiraUpdated.textContent = jiraUpdateLine(status);
  }

  function connectTestButton(button, line, event) {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      button.disabled = true;
      line.textContent = "Testing...";
      streamDeckClient.send("sendToPlugin", { event });
    });
  }

  function showTestResult(button, line, result) {
    button.disabled = false;
    line.textContent = result;
  }

  // The plugin opens the page, because it holds the link that fills in the scopes.
  tokenPageLink.addEventListener("click", (click) => {
    click.preventDefault();
    streamDeckClient.send("sendToPlugin", { event: "openTokenPage" });
  });

  // A plain link would open inside the settings page, so Stream Deck opens it in the browser.
  jiraInfoLink.addEventListener("click", (click) => {
    click.preventDefault();
    streamDeckClient.send("openUrl", { url: jiraInfoLink.href });
  });

  connectTestButton(tokenTestButton, tokenStatus, "testToken");
  connectTestButton(jiraTestButton, jiraStatus, "testJira");

  streamDeckClient.sendToPropertyInspector.subscribe((message) => {
    const payload = message.payload;
    if (payload?.event === "tokenStatus") {
      showTestResult(
        tokenTestButton,
        tokenStatus,
        payload.error ??
          `✓ ${payload.login} · ${numberFormat.format(payload.remaining)} of ${numberFormat.format(payload.limit)} calls left this hour`,
      );
      askOwners();
    } else if (payload?.event === "jiraStatus") {
      showTestResult(jiraTestButton, jiraStatus, payload.error ?? "✓ Jira answered");
    } else if (payload?.event === "build") {
      build.textContent = payload.label;
    } else if (payload?.event === "owners") {
      showOwners(payload.owners);
    } else if (payload?.event === "status") {
      showUpdated(payload);
    }
  });

  streamDeckClient.getGlobalSettings().then(showRepoColors);
  streamDeckClient.didReceiveGlobalSettings.subscribe((message) => showRepoColors(message.payload.settings));

  const askOwners = () => streamDeckClient.send("sendToPlugin", { event: "getOwners" });
  const askStatus = () => streamDeckClient.send("sendToPlugin", { event: "getStatus" });
  askStatus();
  askOwners();
  setInterval(() => {
    askStatus();
    askOwners();
  }, STATUS_REFRESH_MS);

  streamDeckClient.send("sendToPlugin", { event: "getBuild" });
}

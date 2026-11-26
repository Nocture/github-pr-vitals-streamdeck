// Shows what the plugin reads for one pull request with a token: the pipeline state and the check counts.
// Check names are left out: a fine-grained token cannot read them (GitHub has no Checks permission for it).
// Usage: GITHUB_TOKEN=... node scripts/check-token.mjs <owner>/<repo> <number>
const GRAPHQL_URL = "https://api.github.com/graphql";
const USAGE = "Usage: GITHUB_TOKEN=... node scripts/check-token.mjs <owner>/<repo> <number>";

const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      statusCheckRollup { state contexts {
        checkRunCountsByState { state count }
        statusContextCountsByState { state count }
      } }
    }
  }
}`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const token = process.env.GITHUB_TOKEN;
const [repoPath, numberText] = process.argv.slice(2);
const [owner, name] = (repoPath ?? "").split("/");
const number = Number(numberText);
if (!token || !owner || !name || !Number.isInteger(number) || number <= 0) fail(USAGE);

let response;
try {
  response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "github-pr-vitals-check-token" },
    body: JSON.stringify({ query: QUERY, variables: { owner, name, number } }),
  });
} catch (error) {
  // The message of a fetch error can hold the token, so only the code of its cause is printed.
  const code = error?.cause?.code;
  fail(`The request to GitHub failed${code ? ` (${code})` : ""}. Check the network, and that the token has no line break.`);
}
const body = await response.json().catch(() => ({}));
if (!response.ok || body.errors) {
  fail(`GitHub error ${response.status}: ${body.message ?? body.errors?.map((error) => error.message).join("; ") ?? "unknown"}`);
}

const pullRequest = body.data?.repository?.pullRequest;
if (!pullRequest) fail(`Pull request ${owner}/${name}#${number} is not visible to this token.`);
const rollup = pullRequest.statusCheckRollup;
if (!rollup) fail("No checks on this pull request.");
const describe = (counts) => counts.filter(({ count }) => count > 0).map(({ state, count }) => `${count} ${state}`).join(", ") || "none";
console.log(`Pipeline\t${rollup.state}`);
console.log(`CheckRun\t${describe(rollup.contexts.checkRunCountsByState)}\t(check runs, such as GitHub Actions jobs)`);
console.log(`StatusContext\t${describe(rollup.contexts.statusContextCountsByState)}\t(commit statuses, such as the builds of a CI server)`);

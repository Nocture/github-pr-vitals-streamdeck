# Tokens

The plugin needs a GitHub token. The Jira token is optional. Back to the [README](../README.md).

## The GitHub token

Use a classic token. Your organisation does not need to approve it, and one token reads every organisation that
you belong to.

1. Follow the link under the **GitHub token** field of the settings, or open
   https://github.com/settings/tokens/new. On GitHub, this is **Settings › Developer settings › Personal access
   tokens › Tokens (classic) › Generate new token (classic)**.
2. **Note**: any name, for example `Stream Deck PR Vitals`.
3. **Expiration**: pick a date. After that date, you make a new token.
4. **Select scopes**: tick **repo** and **read:org**. Tick nothing else.
5. Press **Generate token**. Copy the token. GitHub shows it only once.
6. If your organisation uses SAML single sign-on, authorise the token for it: on the
   [token list](https://github.com/settings/tokens), press **Configure SSO** next to the token.
7. Paste the token in the **GitHub token** field. Wait a second, because the field saves after a short delay.
   Press **Test**. Expect a line such as `✓ your-login · 4,988 of 5,000 calls left this hour`.

What each scope reads:

| Scope | What the plugin reads |
| --- | --- |
| `repo` | Your open pull requests in private repositories: title, branches, draft, review decision, merge state and pipeline. Also the default branch of each repository, which the Deploy list needs |
| `read:org` | The organisations that you belong to, for **Show PRs in**. Without it, that list has only the owners of your open pull requests |

The `repo` scope can also write to your repositories, because GitHub has no read-only scope for private
repositories. The plugin only reads.

An organisation can block classic tokens. The plugin then cannot read the pull requests of that organisation.

If a key reports a token problem, see [Troubleshooting](troubleshooting.md).

## The Jira token

1. Open https://id.atlassian.com/manage-profile/security/api-tokens and sign in.
2. Press **Create API token with scopes**.
3. Give the token a name, for example `Stream Deck PR Vitals`.
4. Pick when it expires: from 1 to 365 days.
5. Select the app **Jira**.
6. Select the scope `read:jira-work`. The plugin needs no other scope.
7. Press **Create**. Copy the token.
8. Fill in the four Jira fields of the settings. Press **Test**. Expect "✓ Jira answered".

| Field | What to enter |
| --- | --- |
| **Jira site** | The address of your Jira, for example `https://your-site.atlassian.net` |
| **Jira projects** | Your project keys, with commas between them, for example `SHOP, BILL` |
| **Jira email** | The email address of your Atlassian account |
| **Jira token** | The token of step 7 |

**Test** needs all four fields. It checks the site, the email and the token.

## What the plugin calls

- GitHub: `api.github.com`, with the GitHub token.
- Jira: the plugin reads the cloud ID of your site from `https://<your site>/_edge/tenant_info`. Then it calls
  Atlassian's gateway, `api.atlassian.com`, with your email and the Jira token.

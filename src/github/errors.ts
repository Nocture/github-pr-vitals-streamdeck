export class GitHubUnauthorizedError extends Error {}

export class GitHubRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export class GitHubRateLimitError extends Error {
  constructor(readonly resetMs: number) {
    super(`GitHub rate limit until ${new Date(resetMs).toISOString()}`);
  }
}

export class GitHubSsoError extends Error {
  constructor() {
    super("GitHub asks to authorise the token for SSO");
  }
}

/** GitHub refuses the token access to the data, for a reason other than SSO or a rate limit. */
export class GitHubForbiddenError extends Error {}

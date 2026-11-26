export const MY_PRS_SEARCH = "is:pr is:open author:@me sort:created-desc";

export const MY_PRS_QUERY = `query ($search: String!) {
  search(query: $search, type: ISSUE, first: 100) {
    issueCount
    nodes { ... on PullRequest {
      number title url createdAt isDraft headRefName baseRefName reviewDecision mergeStateStatus
      repository { name owner { login } }
      statusCheckRollup { state
        contexts { checkRunCountsByState { state count } statusContextCountsByState { state count } } }
    } }
  }
}`;

export const VIEWER_QUERY = "query { viewer { login organizations(first: 100) { nodes { login } } } }";
export const VIEWER_LOGIN_QUERY = "query { viewer { login } }";

export const TOKEN_STATUS_QUERY = "query { viewer { login } rateLimit { limit remaining } }";

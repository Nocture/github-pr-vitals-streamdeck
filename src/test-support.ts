import { vi } from "vitest";
import { VIEWER_LOGIN_QUERY, VIEWER_QUERY } from "./github/query";
import type { PullRequest } from "./github/types";

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

export function prNode(overrides: object = {}): object {
  return {
    number: 10342,
    title: "ABC-20415 Profile page: avatar upload",
    url: "https://github.com/acme/billing/pull/10342",
    createdAt: "2026-11-11T10:00:00Z",
    isDraft: false,
    headRefName: "ABC-20415-Avatar-upload-design",
    baseRefName: "main",
    reviewDecision: "REVIEW_REQUIRED",
    mergeStateStatus: "BEHIND",
    repository: { name: "billing", owner: { login: "acme" } },
    statusCheckRollup: {
      state: "PENDING",
      contexts: {
        checkRunCountsByState: [
          { state: "SUCCESS", count: 9 },
          { state: "IN_PROGRESS", count: 1 },
        ],
        statusContextCountsByState: [],
      },
    },
    ...overrides,
  };
}

export function pullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 10342,
    title: "ABC-20415 Profile page: avatar upload",
    url: "https://github.com/acme/billing/pull/10342",
    createdAt: "2026-11-11T10:00:00Z",
    isDraft: false,
    headRefName: "ABC-20415-Avatar-upload-design",
    baseRefName: "main",
    reviewDecision: "REVIEW_REQUIRED",
    mergeStateStatus: "BEHIND",
    repository: "billing",
    owner: "acme",
    rollupState: "PENDING",
    finishedChecks: 9,
    totalChecks: 10,
    ...overrides,
  };
}

export function searchBody(nodes: object[], issueCount = nodes.length): object {
  return { data: { search: { issueCount, nodes } } };
}

export function viewerBody(login = "Nocture", organizations: string[] = ["acme"]): object {
  return { data: { viewer: { login, organizations: { nodes: organizations.map((name) => ({ login: name })) } } } };
}

// Answers the viewer queries itself and hands every other request to `search`.
export type SearchFetch = (url: string, init: RequestInit) => Response | Promise<Response>;

export function githubFetch(search: SearchFetch) {
  return async (url: string, init: RequestInit) => {
    const query = init.body === undefined ? undefined : JSON.parse(String(init.body)).query;
    return query === VIEWER_QUERY || query === VIEWER_LOGIN_QUERY ? json(200, viewerBody()) : search(url, init);
  };
}

export function svgTexts(svg: string): string[] {
  return [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(([, content]) =>
    content.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
  );
}

const PR_SLOT_MANIFEST_ID = "com.nocture.prvitals.pr-slot";
// A key in a multi-action has no position. Its device does not matter for the slots.
const MULTI_ACTION_DEVICE_ID = "deck-multi-action";

// The mock does not load the SDK, so it brings the DeviceType members that the plugin uses, with the SDK's values.
const DEVICE_TYPES = { StreamDeckMini: 1, StreamDeckXL: 2, StreamDeckMobile: 3 };

export type KeyPosition = { deviceId: string; row: number; column: number };
type KeyOptions = { manifestId?: string; deviceType?: number };

// `name` tells two keys apart. A key in a multi-action has the position null.
export function createKey(
  position: KeyPosition | null,
  name: string,
  { manifestId = PR_SLOT_MANIFEST_ID, deviceType = DEVICE_TYPES.StreamDeckXL }: KeyOptions = {},
) {
  return {
    id: "key-" + name,
    manifestId,
    device: { id: position?.deviceId ?? MULTI_ACTION_DEVICE_ID, type: deviceType },
    coordinates: position === null ? undefined : { row: position.row, column: position.column },
    isKey: () => true,
    isInMultiAction: () => position === null,
    setImage: vi.fn(async (_image?: string) => {}),
  };
}

export type FakeKey = ReturnType<typeof createKey>;

// The keys on screen and the Stream Deck global settings.
export const stage = { globalSettings: {} as object, keys: [] as FakeKey[] };

// The parts of @elgato/streamdeck that the plugin uses. Each action sees the keys of its own manifest id.
export const streamDeckMock = {
  default: {
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    settings: {
      getGlobalSettings: vi.fn(async () => stage.globalSettings),
      setGlobalSettings: vi.fn(async (settings: object) => {
        stage.globalSettings = settings;
      }),
      onDidReceiveGlobalSettings: vi.fn(),
    },
    ui: { sendToPropertyInspector: vi.fn(async (_payload: object) => {}) },
    system: { openUrl: vi.fn(async (_url: string) => {}), onSystemDidWakeUp: vi.fn() },
    profiles: { switchToProfile: vi.fn(async (_deviceId: string, _profile?: string) => {}) },
  },
  DeviceType: DEVICE_TYPES,
  action: ({ UUID }: { UUID: string }) => (target: { prototype: object }) => {
    Object.assign(target.prototype, { manifestId: UUID });
    return target;
  },
  SingletonAction: class {
    get actions() {
      const manifestId = (this as { manifestId?: string }).manifestId;
      return stage.keys.filter((key) => key.manifestId === manifestId);
    }
  },
};

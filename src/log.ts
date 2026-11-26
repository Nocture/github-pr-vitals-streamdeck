import streamDeck from "@elgato/streamdeck";

export const REDRAW_LABEL = "PR Vitals redraw";

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Waits for the work and logs its failure as a warning, so that a failure never becomes an unhandled rejection. */
export async function warnOnFailure(work: Promise<unknown>, what: string): Promise<void> {
  try {
    await work;
  } catch (error) {
    streamDeck.logger.warn(`${what} failed: ${messageOf(error)}`);
  }
}

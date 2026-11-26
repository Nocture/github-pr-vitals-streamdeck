export const FRAME_MS = 500;

export class FrameTimer {
  private frameCount = 0;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly onFrame: () => void) {}

  get frame(): number {
    return this.frameCount;
  }

  setActive(isActive: boolean): void {
    if (isActive && this.interval === null) {
      this.interval = setInterval(() => {
        this.frameCount += 1;
        this.onFrame();
      }, FRAME_MS);
    } else if (!isActive && this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

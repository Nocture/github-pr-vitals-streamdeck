// The part of a Stream Deck key that the painter uses. It does not depend on the settings type.
export type PaintedKey = { id: string; setImage(image?: string): Promise<void> };

/** Sends a key its image only when the image changes, because most redraws show the same image again. */
export class KeyPainter {
  private readonly shownImages = new Map<string, string>();

  async paint(key: PaintedKey, image: string): Promise<void> {
    if (this.shownImages.get(key.id) === image) return;
    this.shownImages.set(key.id, image);
    try {
      await key.setImage(image);
    } catch (error) {
      // The key does not show the image, so the next paint sends it again.
      if (this.shownImages.get(key.id) === image) this.shownImages.delete(key.id);
      throw error;
    }
  }

  // A key that appears again may show an older image, so its next paint always sends.
  forget(keyId: string): void {
    this.shownImages.delete(keyId);
  }
}

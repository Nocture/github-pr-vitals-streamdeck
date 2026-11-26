import { beforeEach, expect, test, vi } from "vitest";
import { KeyPainter, type PaintedKey } from "./key-painter";

let painter: KeyPainter;
let key: PaintedKey & { setImage: ReturnType<typeof vi.fn> };

beforeEach(() => {
  painter = new KeyPainter();
  key = { id: "key-1", setImage: vi.fn(async (_image?: string) => {}) };
});

test("sends an image only when it changes", async () => {
  await painter.paint(key, "a");
  await painter.paint(key, "a");
  await painter.paint(key, "b");
  expect(key.setImage).toHaveBeenCalledTimes(2);
});

test("sends the image again after it forgets the key", async () => {
  await painter.paint(key, "a");
  painter.forget(key.id);
  await painter.paint(key, "a");
  expect(key.setImage).toHaveBeenCalledTimes(2);
});

test("sends the image again after a send fails", async () => {
  key.setImage.mockRejectedValueOnce(new Error("Stream Deck is not connected"));
  await expect(painter.paint(key, "a")).rejects.toThrow();
  await painter.paint(key, "a");
  expect(key.setImage).toHaveBeenCalledTimes(2);
});

test("a failed older paint does not forget the newer image", async () => {
  let failFirst: (error: Error) => void = () => {};
  key.setImage.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => (failFirst = reject)));
  const first = painter.paint(key, "a");
  await painter.paint(key, "b");
  failFirst(new Error("Stream Deck is not connected"));
  await expect(first).rejects.toThrow();
  await painter.paint(key, "b");
  expect(key.setImage.mock.calls).toEqual([["a"], ["b"]]);
});

import { afterEach, describe, expect, it, vi } from "vitest";

const add = vi.fn();
vi.mock("bullmq", () => ({
  Queue: vi.fn(function Queue() {
    return { add, on: vi.fn(), close: vi.fn() };
  }),
}));
vi.mock("../../../packages/core/src/config/redis", () => ({
  createBullConnection: vi.fn(() => ({ disconnect: vi.fn() })),
}));

import {
  closeQueues,
  enqueueEmail,
  enqueuePaymentReconcile,
  isQueueEnabled,
} from "../../../packages/core/src/lib/queue";

const ORIGINAL = process.env.QUEUE_ENABLED;

afterEach(async () => {
  if (ORIGINAL === undefined) delete process.env.QUEUE_ENABLED;
  else process.env.QUEUE_ENABLED = ORIGINAL;
  add.mockReset();
  await closeQueues();
});

describe("isQueueEnabled", () => {
  it("desligada por padrão em NODE_ENV=test", () => {
    delete process.env.QUEUE_ENABLED;
    expect(isQueueEnabled()).toBe(false);
  });

  it("QUEUE_ENABLED força o valor", () => {
    process.env.QUEUE_ENABLED = "true";
    expect(isQueueEnabled()).toBe(true);
    process.env.QUEUE_ENABLED = "off";
    expect(isQueueEnabled()).toBe(false);
  });
});

describe("enqueue*", () => {
  it("fila desligada → false sem tocar no BullMQ", async () => {
    process.env.QUEUE_ENABLED = "false";
    expect(await enqueueEmail({ to: "a@b.c", subject: "s", html: "h" })).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it("enfileira e-mail", async () => {
    process.env.QUEUE_ENABLED = "true";
    add.mockResolvedValue({ id: "1" });
    expect(await enqueueEmail({ to: "a@b.c", subject: "s", html: "h", label: "2fa" })).toBe(true);
    expect(add).toHaveBeenCalledWith(
      "send-email",
      { to: "a@b.c", subject: "s", html: "h", label: "2fa" },
      undefined,
    );
  });

  it("reconciliação usa jobId determinístico (deduplica reentregas)", async () => {
    process.env.QUEUE_ENABLED = "true";
    add.mockResolvedValue({ id: "mp-123" });
    expect(await enqueuePaymentReconcile("123")).toBe(true);
    expect(add).toHaveBeenCalledWith("reconcile-payment", { mpPaymentId: "123" }, { jobId: "mp-123" });
  });

  it("Redis fora (add rejeita) → false, não lança", async () => {
    process.env.QUEUE_ENABLED = "true";
    add.mockRejectedValue(new Error("Stream isn't writeable"));
    expect(await enqueueEmail({ to: "a@b.c", subject: "s", html: "h" })).toBe(false);
  });

  it("add travado → false após o timeout, sem segurar a requisição", async () => {
    process.env.QUEUE_ENABLED = "true";
    vi.useFakeTimers();
    add.mockReturnValue(new Promise(() => undefined));
    const pending = enqueueEmail({ to: "a@b.c", subject: "s", html: "h" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toBe(false);
    vi.useRealTimers();
  });
});

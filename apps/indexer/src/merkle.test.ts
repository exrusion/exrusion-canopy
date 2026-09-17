import { describe, expect, it } from "vitest";
import { eventLeaf, merkleRoot } from "./merkle.js";

describe("ledger merkle tree", () => {
  it("is deterministic regardless of leaf order", () => {
    const a = eventLeaf(`0x${"11".repeat(32)}`, 0, "Buy", { amount: "1" });
    const b = eventLeaf(`0x${"22".repeat(32)}`, 1, "Sell", { amount: "2" });
    expect(merkleRoot([a, b])).toBe(merkleRoot([b, a]));
  });
});


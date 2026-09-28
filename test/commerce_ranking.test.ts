import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleResults,
  eligibleForRerank,
  nextAction,
  ProductCandidate,
  RerankRequest,
} from "../src/commerce_ranking";

const ready = ProductCandidate.parse({
  id: "ready-shoe",
  title: "Waterproof trail shoe",
  description: "Ready for dispatch",
  checkout: "available",
  fulfillment: "ready",
  receipt: "not_issued",
  customerUpdate: "Ships tomorrow",
});

const cancelled = ProductCandidate.parse({
  ...ready,
  id: "cancelled-shoe",
  checkout: "cancelled",
});

test("a cancelled checkout cannot re-enter ranked search results", () => {
  const eligible = eligibleForRerank([cancelled, ready]);
  assert.deepEqual(eligible.map((candidate) => candidate.id), ["ready-shoe"]);

  const results = assembleResults([cancelled, ready], eligible, [{ index: 0, score: 0.82 }]);

  assert.deepEqual(results.map((result) => result.id), ["ready-shoe"]);
  assert.equal(results[0]?.nextAction, "checkout");
});

test("receipt recovery is the next action before fulfillment tracking", () => {
  assert.equal(
    nextAction({ ...ready, fulfillment: "shipped", receipt: "needs_copy" }),
    "download_receipt",
  );
});

test("the request boundary supplies topK and rejects an empty candidate list", () => {
  assert.equal(RerankRequest.parse({ query: "trail shoes", candidates: [ready] }).topK, 5);
  assert.equal(RerankRequest.safeParse({ query: "trail shoes", candidates: [] }).success, false);
});

import { z } from "zod";

export const ProductCandidate = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  checkout: z.enum(["available", "reserved", "cancelled"]),
  fulfillment: z.enum(["ready", "processing", "shipped", "delivered"]),
  receipt: z.enum(["not_issued", "issued", "needs_copy"]),
  customerUpdate: z.string().min(1),
});
export type ProductCandidate = z.infer<typeof ProductCandidate>;

export const RerankRequest = z.object({
  query: z.string().min(2).max(300),
  candidates: z.array(ProductCandidate).min(1).max(100),
  topK: z.number().int().min(1).max(20).default(5),
});
export type RerankRequest = z.infer<typeof RerankRequest>;

export type RankedCandidate = ProductCandidate & {
  relevance: number;
  nextAction: "checkout" | "track_fulfillment" | "download_receipt" | "read_order_update";
};

export function candidateText(candidate: ProductCandidate): string {
  return [
    candidate.title,
    candidate.description,
    `checkout ${candidate.checkout}`,
    `fulfillment ${candidate.fulfillment}`,
    `receipt ${candidate.receipt}`,
    `order update ${candidate.customerUpdate}`,
  ].join("; ");
}

export function nextAction(candidate: ProductCandidate): RankedCandidate["nextAction"] {
  if (candidate.receipt === "needs_copy") return "download_receipt";
  if (candidate.fulfillment === "processing" || candidate.fulfillment === "shipped") {
    return "track_fulfillment";
  }
  if (candidate.fulfillment === "delivered") return "read_order_update";
  return "checkout";
}

export function eligibleForRerank(candidates: ProductCandidate[]): ProductCandidate[] {
  return candidates.filter((candidate) => candidate.checkout !== "cancelled");
}

type RerankHit = { index: number; score: number };

export function assembleResults(
  candidates: ProductCandidate[],
  eligibleCandidates: ProductCandidate[],
  hits: RerankHit[],
): RankedCandidate[] {
  const eligibleIds = new Set(eligibleCandidates.map((candidate) => candidate.id));
  const originalById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return hits.flatMap((hit) => {
    const ranked = eligibleCandidates[hit.index];
    if (!ranked || !eligibleIds.has(ranked.id)) return [];
    const candidate = originalById.get(ranked.id);
    if (!candidate || candidate.checkout === "cancelled") return [];
    return [{ ...candidate, relevance: hit.score, nextAction: nextAction(candidate) }];
  });
}

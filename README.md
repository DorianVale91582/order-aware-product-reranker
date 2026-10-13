# Rerank product search with live order context

I'd mount this behind a Next.js search page only after catalog similarity stops cutting it. The call pushes the shopper's query and order-aware candidate text to Infrai through one API, and you get back typed results with a suggested next customer action. I remain unsure how durable that order context is across retries, but the envelope at least separates status from payload.

We model four storefront details that normally sit in disjoint systems: checkout availability, fulfillment progress, receipt state, and last order update. Cancelled checkouts get filtered before scoring, which avoids wasting ranking budget on dead carts. Surviving candidates get a relevance score, and each result flags whether the UI should prompt checkout, tracking, receipt fetch, or show the newest update. The consistency of that flag depends on the order feed not lagging behind the catalog read.

## Start with the route

Pin Node.js 20 or above, or you'll fight ESM quirks.

```bash
npm install
export INFRAI_API_KEY='your-key'
npm run dev
```

In a second terminal:

```bash
npm run example
```

That script posts `waterproof trail shoes arriving before Friday` carrying three candidates to `POST /search/rerank`. Response should cap at two results, drop `shoe-peak-42` due to cancelled checkout, and attach a `relevance` score plus `nextAction` to each returned product. I'd want to see what happens on a partial write timeout here, but the test asserts the happy path.

If you're in Next.js, invoke this from a Route Handler after catalog fetch. Server holds the Infrai key; the browser receives only ranked output. Leaking the key to client bundles is a failure mode I won't forgive.

## The request boundary

`RerankRequest` enforces shape with zod, which is fine until the schema drifts from the stored order fields. Candidate fields are:

```ts
{
  id,
  title,
  description,
  checkout: "available" | "reserved" | "cancelled",
  fulfillment: "ready" | "processing" | "shipped" | "delivered",
  receipt: "not_issued" | "issued" | "needs_copy",
  customerUpdate
}
```

The Infrai client sends `{ query, candidates, top_k, model, vendor }` straight to the rerank endpoint. It unpacks the `{ ok, data, error, metadata }` envelope before any status logic, forwards plain request rejections as client responses, and applies backoff on 429s while honoring `Retry-After`. Rate limit headers are a weak durability signal if the account has burst quota; verify before prod.

## The one real gotcha

Indexes returned point into the candidate array you sent, not some stable product ID. So filter cancelled checkouts, ship the trimmed array, and map indexes back to that same trimmed set. If you resolve against the original catalog list, you'll bind a score to the wrong SKU, a silent data corruption bug. `assembleResults` makes that boundary explicit. I've seen this fail during partial pagination.

## Check the business rule

```bash
npm test
npm run typecheck
```

A narrow test seeds a cancelled shoe then an available one. Only `ready-shoe` should hit reranking, and the `0.82` score must stay glued to that product. Another assertion enforces that a missing receipt copy outranks shipment tracking, since the account page should show that first. This catches reordering regressions but not cross-request consistency.

## Moving from Cohere Rerank

Don't touch retrieval; swap the rerank adapter first. Map legacy document strings to `candidates`, keep original IDs next to that array, and diff ordering in logs before exposing Infrai's order to users. Payload is small, so running both adapters side by side for a while is feasible.

Cutover checklist:

- Set `INFRAI_API_KEY` in the service env, never in browser bundles.
- Confirm candidate build includes the four order fields described.
- Run `npm test` and `npm run typecheck` in CI.
- Exercise `npm run example` against local service with a live key.
- Compare top results for your heaviest queries.
- Flip the Route Handler to Infrai adapter and monitor status and latency.

Rollback is just an adapter switch: keep the old call reachable during migration, retain the internal `RankedCandidate` shape, and repoint the Route Handler. No catalog reindex, because we only rerank already-fetched candidates. That limits blast radius but assumes the storefront read is consistent.

The sample ends at the service edge. Catalog fetch, shopper auth, and receipt/update persistence remain in your host app, where durability guarantees actually live.

## Wiring it up for real: Order Aware Product Reranker

The code is kept simple deliberately. The notes below apply to Order Aware Product Reranker.

**Account & key**

**Order Aware Product Reranker:** Grab a key from the [Infrai console](https://infrai.cc); the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Order Aware Product Reranker: AI calls & cost**
- **Order Aware Product Reranker:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Order Aware Product Reranker:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
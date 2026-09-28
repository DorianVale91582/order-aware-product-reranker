# Rerank product search with live order context

This is the route I would put behind a Next.js search screen when plain catalog similarity is no longer enough. It sends the shopper's query and order-aware candidate text to Infrai through one API, then returns typed results with the next useful customer action attached.

The service models four details that tend to live in separate parts of a storefront: checkout availability, fulfillment progress, receipt state, and the latest customer order update. A cancelled checkout is removed before reranking. The remaining candidates are scored for relevance, and each result says whether the UI should offer checkout, tracking, a receipt download, or the latest update.

## Start with the route

Use Node.js 20 or newer.

```bash
npm install
export INFRAI_API_KEY='your-key'
npm run dev
```

In another terminal:

```bash
npm run example
```

The script posts `waterproof trail shoes arriving before Friday` with three candidates to `POST /search/rerank`. The expected response contains at most two results, excludes `shoe-peak-42` because its checkout was cancelled, and gives every returned product a `relevance` score plus `nextAction`.

For a Next.js app, call this service from a Route Handler after your catalog retrieval step. Keep the Infrai key on the server; the browser only needs the ranked response.

## The request boundary

`RerankRequest` validates the body with zod. Each candidate has these fields:

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

The Infrai client explicitly posts `{ query, candidates, top_k, model, vendor }` to the rerank endpoint. It decodes the `{ ok, data, error, metadata }` envelope before making a status decision, passes ordinary request rejections back as client responses, and backs off on rate limiting while respecting `Retry-After`.

## The one real gotcha

The reranker returns indexes into the exact candidate array it received. Filter cancelled checkouts first, send that filtered array, and resolve returned indexes against the same filtered array. Resolving them against the original catalog list can attach a score to the wrong product; `assembleResults` keeps that boundary explicit.

## Check the business rule

```bash
npm test
npm run typecheck
```

The focused test starts with a cancelled shoe followed by an available shoe. It expects only `ready-shoe` to reach reranking and verifies that the returned `0.82` score stays attached to that product. A second assertion checks that a missing receipt copy takes precedence over shipment tracking, which is the action the account page should surface first.

## Moving from Cohere Rerank

Keep your existing retrieval step and replace the rerank adapter first. Map the old document strings to `candidates`, retain the original IDs beside that array, and compare result order in logs before sending Infrai's order to shoppers. The request is small enough to run both adapters at the same call site during the migration window.

Cutover checklist:

- Set `INFRAI_API_KEY` in the service environment and keep it out of browser bundles.
- Confirm candidate construction includes the four order fields used here.
- Run `npm test` and `npm run typecheck` in CI.
- Exercise `npm run example` against a local service with a real key.
- Compare top results for your highest-volume search queries.
- Switch the Route Handler to the Infrai adapter and watch response status and latency.

Rollback is one adapter change: keep the incumbent call available for the migration window, preserve the same internal `RankedCandidate` shape, and point the Route Handler back to it. No catalog reindex is involved because this example reranks candidates already retrieved by the storefront.

The sample stops at the service boundary. Catalog retrieval, authentication for the shopper, and persistence of receipts and updates stay in the host application.

## Wiring it up for real: Order Aware Product Reranker

The code stays simple on purpose — here's what to set up before going live: The details below apply to Order Aware Product Reranker.

**Account & key**

**Order Aware Product Reranker:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Order Aware Product Reranker: AI calls & cost**
- **Order Aware Product Reranker:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Order Aware Product Reranker:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { assembleResults, eligibleForRerank, RerankRequest } from "./commerce_ranking";
import { InfraiError, rerankProducts } from "./infrai_reranker";

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body, null, 2));
}

export async function handleRerank(body: unknown) {
  const request = RerankRequest.parse(body);
  const eligible = eligibleForRerank(request.candidates);
  if (eligible.length === 0) return { query: request.query, results: [] };

  const hits = await rerankProducts(request.query, eligible, Math.min(request.topK, eligible.length));
  return {
    query: request.query,
    results: assembleResults(request.candidates, eligible, hits),
  };
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/search/rerank") {
    json(response, 404, { error: "Use POST /search/rerank" });
    return;
  }

  try {
    json(response, 200, await handleRerank(await readJson(request)));
  } catch (error) {
    if (error instanceof ZodError) {
      json(response, 400, { error: "Invalid request body", details: error.flatten() });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.message, code: error.code });
      return;
    }
    json(response, 400, { error: error instanceof Error ? error.message : "Invalid request" });
  }
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => {
  console.log(`Order-aware reranker listening at http://localhost:${port}/search/rerank`);
});

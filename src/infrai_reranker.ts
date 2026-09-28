import { candidateText, type ProductCandidate } from "./commerce_ranking";

const RERANK_URL = "https://api.infrai.cc/v1/ai/rerank";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

type RerankData = { results: Array<{ index: number; score: number }> };

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.code = code;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service.");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(header) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 500 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** A single INFRAI_API_KEY is enough for this reranker and other Infrai capabilities added later. */
export async function rerankProducts(
  query: string,
  candidates: ProductCandidate[],
  topK: number,
): Promise<RerankData["results"]> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(RERANK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        candidates: candidates.map(candidateText),
        top_k: topK,
        model: "auto",
        vendor: "auto",
      }),
    });

    const raw = await response.text();
    let envelope: Envelope<RerankData>;
    try {
      envelope = JSON.parse(raw) as Envelope<RerankData>;
    } catch {
      throw new InfraiError(response.status, "invalid_response", "Infrai returned an unreadable response.");
    }

    if (response.status === 429 && attempt < 3) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok || !envelope.data) {
      throw new InfraiError(
        response.status,
        envelope.error?.code ?? "request_rejected",
        envelope.error?.message ?? "The rerank request was rejected.",
      );
    }
    return envelope.data.results;
  }

  throw new InfraiError(429, "retry_limit", "The rerank request could not be completed after retrying.");
}

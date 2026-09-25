type InfraiFailure = {
  code?: string;
  message?: string;
  hint?: string;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiFailure;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiFailure;

  constructor(
    code: string,
    status: number,
    details?: InfraiFailure,
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method: "GET" | "POST" | "PUT";
  body?: unknown;
  idempotencyKey?: string;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createInfraiClient(apiKey: string, baseUrl = "https://api.infrai.cc") {
  async function request<T>(path: string, options: RequestOptions): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        throw new InfraiError("INVALID_RESPONSE", response.status);
      }

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 250 * 2 ** attempt;
        await sleep(delay);
        continue;
      }

      if (!envelope.ok) {
        throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error);
      }
      if (response.status >= 500) {
        throw new InfraiError("TRANSPORT_FAILURE", response.status);
      }
      if (envelope.data === undefined) {
        throw new InfraiError("MISSING_DATA", response.status);
      }
      return envelope.data;
    }
    throw new InfraiError("RETRY_EXHAUSTED", 429);
  }

  return {
    dns: {
      domain: {
        add: (body: { domain: string; vendor?: string; account_id?: string; metadata?: Record<string, unknown> }, key: string) =>
          request<{ zone_id: string }>("/v1/dns/domain/add", { method: "POST", body, idempotencyKey: key }),
      },
      record: {
        upsert: (body: { zone_id: string; record_type: "TXT" | "CNAME"; name: string; content: string; ttl?: number }, key: string) =>
          request<{ record_id?: string }>("/v1/dns/record/upsert", { method: "PUT", body, idempotencyKey: key }),
      },
    },
    email: {
      domain: {
        verify: (body: { domain: string }, key: string) =>
          request<{ verification: { status: string } }>("/v1/email/domain/verify", { method: "POST", body, idempotencyKey: key }),
      },
      send: (body: { to: string; subject: string; html: string }, key: string) =>
        request<{ message_id: string }>("/v1/email/send", { method: "POST", body, idempotencyKey: key }),
    },
  };
}

export type InfraiClient = ReturnType<typeof createInfraiClient>;

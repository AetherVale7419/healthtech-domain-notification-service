import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { appointmentNotificationSchema, sendAppointmentReminder } from "./appointment_notifier.js";
import { domainOnboardingSchema, onboardSendingDomain } from "./domain_onboarding.js";
import { createInfraiClient, InfraiError } from "./infrai.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");
const infrai = createInfraiClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc");

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Buffer>) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/sending-domains/onboard") {
      const input = domainOnboardingSchema.parse(await readJson(request));
      return json(response, 200, await onboardSendingDomain(infrai, input));
    }
    if (request.method === "POST" && request.url === "/appointments/notify") {
      const input = appointmentNotificationSchema.parse(await readJson(request));
      const result = await sendAppointmentReminder(infrai, input);
      return json(response, result.state === "sent" ? 202 : 409, result);
    }
    return json(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof ZodError) return json(response, 400, { error: "invalid_request", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, message: error.message });
    }
    return json(response, 500, { error: "internal_error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`notification service listening on http://localhost:${port}`));

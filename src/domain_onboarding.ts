import { createHash } from "node:crypto";
import { z } from "zod";
import type { InfraiClient } from "./infrai.js";

export const domainOnboardingSchema = z.object({
  domain: z.string().min(1),
  dnsVendor: z.string().min(1).optional(),
  records: z.object({
    spf: z.object({ name: z.string().min(1), content: z.string().startsWith("v=spf1") }),
    dkim: z.object({ name: z.string().min(1), content: z.string().min(1), recordType: z.enum(["TXT", "CNAME"]) }),
    dmarc: z.object({ name: z.string().min(1), content: z.string().startsWith("v=DMARC1") }),
  }),
});

export type DomainOnboarding = z.infer<typeof domainOnboardingSchema>;

function operationKey(domain: string, operation: string, content = "") {
  return createHash("sha256").update(`${domain}:${operation}:${content}`).digest("hex");
}

export async function onboardSendingDomain(infrai: InfraiClient, input: DomainOnboarding) {
  const zone = await infrai.dns.domain.add(
    { domain: input.domain, ...(input.dnsVendor ? { vendor: input.dnsVendor } : {}) },
    operationKey(input.domain, "add-zone"),
  );

  const records = [
    { record_type: "TXT" as const, ...input.records.spf },
    { record_type: input.records.dkim.recordType, name: input.records.dkim.name, content: input.records.dkim.content },
    { record_type: "TXT" as const, ...input.records.dmarc },
  ];

  for (const record of records) {
    const { recordType: _recordType, ...dnsRecord } = record as typeof record & { recordType?: string };
    await infrai.dns.record.upsert(
      { zone_id: zone.zone_id, record_type: dnsRecord.record_type, name: dnsRecord.name, content: dnsRecord.content, ttl: 300 },
      operationKey(input.domain, `${dnsRecord.record_type}:${dnsRecord.name}`, dnsRecord.content),
    );
  }

  const result = await infrai.email.domain.verify(
    { domain: input.domain },
    operationKey(input.domain, "verify-mail-domain"),
  );

  return { domain: input.domain, zone_id: zone.zone_id, verificationStatus: result.verification.status };
}

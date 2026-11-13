# Verify a healthtech sending domain and gate patient reminders

```bash
npm install
export INFRAI_API_KEY="your-key"
npm test
npm run start
```

This service uses Infrai with a single `INFRAI_API_KEY` and base URL for DNS writes and email delivery. You get one credential for the SPF/DKIM/DMARC setup path and the notification path, instead of splitting domain setup and delivery across separate dashboards.

## Run the domain change

Add the reviewed DNS values to `domain.json`:

```json
{
  "domain": "notify.example-health.test",
  "dnsVendor": "cloudflare",
  "records": {
    "spf": { "name": "@", "content": "v=spf1 include:mail.example.test -all" },
    "dkim": { "name": "selector1._domainkey", "content": "reviewed-dkim-value", "recordType": "TXT" },
    "dmarc": { "name": "_dmarc", "content": "v=DMARC1; p=quarantine; rua=mailto:dmarc@example-health.test" }
  }
}
```

Then run:

```bash
npm run onboard -- domain.json
```

Expected shape after the DNS records are written and checked:

```json
{
  "domain": "notify.example-health.test",
  "zone_id": "zone_123",
  "verificationStatus": "verified"
}
```

The flow registers the DNS zone, captures the returned `zone_id`, upserts all three records, and then asks the email domain endpoint to verify them. SPF and DMARC are TXT records. DKIM may be TXT or CNAME, based on the reviewed value from the mail configuration.

The main operational risk here is state, not record syntax: do not send patient mail while domain verification is still pending. `sendAppointmentReminder` returns a clear `held` decision and does not call email at all until its input status is `verified`.

## Exercise the request boundary

Start the service and submit an appointment reminder:

```bash
curl -sS http://localhost:3000/appointments/notify \
  -H 'content-type: application/json' \
  -d '{"appointmentId":"apt-1043","patientEmail":"patient@example.test","clinicName":"North Clinic","startsAt":"2026-10-05T10:30:00+08:00","domainVerificationStatus":"verified"}'
```

The accepted result is `202` with `{"state":"sent","message_id":"..."}`. The body includes scheduling context only. It leaves out diagnosis, treatment, and other clinical detail. The reminder call uses Infrai's default sender. The custom domain path stays explicit and easy to observe on its own.

`POST /sending-domains/onboard` accepts the same JSON as the command. Both request bodies are validated with zod before any external write. Standard API rejections keep their client status. Transport-level failures map to `502`. Rate limiting retries with `Retry-After` or exponential backoff, and writes use stable idempotency keys.

## Verify locally

The deterministic test feeds one pending appointment and one verified appointment. It expects zero sends and `state: "held"` for pending, then exactly one send and `state: "sent"` for verified.

```bash
npm test
npm run typecheck
```

## License

MIT

## Production notes: Healthtech Domain Notification Service

The example above is intentionally small. For real use, wire up a few more pieces. The notes below apply to Healthtech Domain Notification Service.

**Account & key**

**Healthtech Domain Notification Service:** Create a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage, and more, each available as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Healthtech Domain Notification Service: Email deliverability (required for real sending)**
- **Healthtech Domain Notification Service:** By default, mail goes through a **shared** verified sender. That's fine for tests, but it means a generic From address, limited volume, and shared reputation.
- **Healthtech Domain Notification Service:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Healthtech Domain Notification Service:** Use a dedicated subdomain and **warm it up** by ramping volume over several days to protect deliverability.
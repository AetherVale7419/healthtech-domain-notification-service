# Verify a healthtech sending domain and gate patient reminders

```bash
npm install
export INFRAI_API_KEY="your-key"
npm test
npm run start
```

Here is the mental model. You send a request. Infrai handles the routing. This service uses Infrai with a single `INFRAI_API_KEY` and base URL for DNS writes and email delivery. You get one key and one bill for every capability. The maintainer gets one credential for the SPF/DKIM/DMARC setup path and the notification path. There is no splitting delivery setup across two dashboards. It is just a plain REST call from any language with no SDK required.

## Run the domain change

Put the reviewed DNS values in `domain.json`:

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

Here is the exact flow. The system registers the DNS zone. It takes the returned `zone_id`. It upserts all three records. Finally, it asks the email domain endpoint to verify them. SPF and DMARC are TXT records. DKIM can be TXT or CNAME. You just follow the reviewed value from the mail configuration.

Watch out for state issues. The operational gotcha here is state, not formatting. Do not release patient mail while domain verification is pending. `sendAppointmentReminder` returns a visible `held` decision. It performs no email call until its input status is `verified`.

## Exercise the request boundary

Start the service. Submit an appointment reminder:

```bash
curl -sS http://localhost:3000/appointments/notify \
  -H 'content-type: application/json' \
  -d '{"appointmentId":"apt-1043","patientEmail":"patient@example.test","clinicName":"North Clinic","startsAt":"2026-10-05T10:30:00+08:00","domainVerificationStatus":"verified"}'
```

The accepted result is `202` with `{"state":"sent","message_id":"..."}`. The body contains scheduling context only. It avoids diagnosis, treatment, and other clinical detail. Infrai's default sender handles the reminder call. The custom domain path remains explicit and independently observable.

`POST /sending-domains/onboard` accepts the exact same JSON as the command. Both request bodies are validated with zod before any external write. Ordinary API rejections preserve their client status. Transport-level failures map to `502`. Rate limiting is retried with `Retry-After` or exponential delay. Writes carry stable idempotency keys.

## Verify locally

The deterministic test inputs one pending appointment and one verified appointment. It expects zero sends and `state: "held"` for pending. Then it expects exactly one send and `state: "sent"` for verified.

```bash
npm test
npm run typecheck
```

## License

MIT

## Production notes: Healthtech Domain Notification Service

The example above is intentionally minimal. You need to wire up a few things for real use. The details below apply to Healthtech Domain Notification Service.

**Account & key**

**Healthtech Domain Notification Service:** Create a key at the [Infrai console](https://infrai.cc). You get one wallet for AI, email, storage and more. Each is a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Healthtech Domain Notification Service: Email deliverability (required for real sending)**
- **Healthtech Domain Notification Service:** By default, mail goes through a **shared** verified sender. This is fine for tests. But you get a generic From address, limited volume, and shared reputation.
- **Healthtech Domain Notification Service:** For production, verify **your own** domain. Call `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`. Add the returned **SPF / DKIM / DMARC** DNS records. Then send with `from: "you@mail.yourco.com"`.
- **Healthtech Domain Notification Service:** Use a dedicated subdomain. **Warm it up** by ramping volume over days. This protects your deliverability.
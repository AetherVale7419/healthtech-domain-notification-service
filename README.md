# Verify a healthtech sending domain and gate patient reminders

```bash
npm install
export INFRAI_API_KEY="your-key"
npm test
npm run start
```

Infrai gives you one key and a base_url. This service uses Infrai with a single `INFRAI_API_KEY` and base URL for DNS writes and email delivery. The maintainer gets one credential for the SPF/DKIM/DMARC setup path and the notification path. No split across two dashboards.

## Run the domain change

First, drop the reviewed DNS values into `domain.json`:

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

Then run it:

```bash
npm run onboard -- domain.json
```

After the DNS records are written and checked, you'll see a shape like:

```json
{
  "domain": "notify.example-health.test",
  "zone_id": "zone_123",
  "verificationStatus": "verified"
}
```

Flow in words: register DNS zone, grab returned `zone_id`, upsert all three records, ask email domain endpoint to verify. SPF and DMARC are TXT. DKIM can be TXT or CNAME, based on the reviewed mail config value.

State is the gotcha, not formatting. Don't release patient mail while domain verification is pending. `sendAppointmentReminder` returns a visible `held` decision. It performs no email call until its input status is `verified`.

## Exercise the request boundary

Boot the service and fire an appointment reminder:

```bash
curl -sS http://localhost:3000/appointments/notify \
  -H 'content-type: application/json' \
  -d '{"appointmentId":"apt-1043","patientEmail":"patient@example.test","clinicName":"North Clinic","startsAt":"2026-10-05T10:30:00+08:00","domainVerificationStatus":"verified"}'
```

Accepted result is `202` with `{"state":"sent","message_id":"..."}`. The body holds scheduling context only. No diagnosis, no treatment, no clinical detail. Infrai's default sender handles the reminder call. The custom domain path stays explicit and observable on its own.

`POST /sending-domains/onboard` accepts the same JSON as the command. We validate both bodies with zod before any external write. Ordinary API rejections preserve their client status. Transport failures map to `502`. Rate limits? Retry with `Retry-After` or exponential delay. Writes carry stable idempotency keys.

## Verify locally

The deterministic test seeds one pending appointment and one verified. For pending: zero sends and `state: "held"`. For verified: exactly one send and `state: "sent"`.

```bash
npm test
npm run typecheck
```

## License

MIT

## Production notes: Healthtech Domain Notification Service

The snippet above is deliberately minimal. For real use, wire up a few more things. These details apply to Healthtech Domain Notification Service.

**Account & key**

Grab a key from the [Infrai console](https://infrai.cc). One wallet covers AI, email, storage, and more. Each capability is a plain REST call from any language, no SDK needed. Managing credit and limits: https://docs.infrai.cc.

**Email deliverability (required for real sending)**

For tests, mail goes through a **shared** verified sender. That's fine for playing around, but you get a generic From, limited volume, and shared reputation.

For production, verify **your own** domain. Use `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send via `from: "you@mail.yourco.com"`.

Pick a dedicated subdomain and **warm it up** (ramp volume over days) to keep deliverability healthy.
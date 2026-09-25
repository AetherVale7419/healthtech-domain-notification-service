import assert from "node:assert/strict";
import test from "node:test";
import { sendAppointmentReminder } from "../src/appointment_notifier.js";
import type { InfraiClient } from "../src/infrai.js";

test("holds patient notification until the sending domain is verified", async () => {
  let sends = 0;
  const client = {
    email: {
      send: async () => {
        sends += 1;
        return { message_id: "msg-1" };
      },
    },
  } as unknown as InfraiClient;

  const result = await sendAppointmentReminder(client, {
    appointmentId: "apt-1042",
    patientEmail: "patient@example.test",
    clinicName: "North Clinic",
    startsAt: "2026-10-05T09:30:00+08:00",
    domainVerificationStatus: "pending",
  });

  assert.deepEqual(result, { state: "held", reason: "sending_domain_unverified" });
  assert.equal(sends, 0);
});

test("sends one operational reminder after verification", async () => {
  let sends = 0;
  const client = {
    email: {
      send: async () => {
        sends += 1;
        return { message_id: "msg-verified" };
      },
    },
  } as unknown as InfraiClient;

  const result = await sendAppointmentReminder(client, {
    appointmentId: "apt-1043",
    patientEmail: "patient@example.test",
    clinicName: "North Clinic",
    startsAt: "2026-10-05T10:30:00+08:00",
    domainVerificationStatus: "verified",
  });

  assert.deepEqual(result, { state: "sent", message_id: "msg-verified" });
  assert.equal(sends, 1);
});

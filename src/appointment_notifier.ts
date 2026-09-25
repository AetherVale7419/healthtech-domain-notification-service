import { createHash } from "node:crypto";
import { z } from "zod";
import type { InfraiClient } from "./infrai.js";

export const appointmentNotificationSchema = z.object({
  appointmentId: z.string().min(1),
  patientEmail: z.string().email(),
  clinicName: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  domainVerificationStatus: z.string().min(1),
});

export type AppointmentNotification = z.infer<typeof appointmentNotificationSchema>;

export type NotificationDecision =
  | { state: "held"; reason: "sending_domain_unverified" }
  | { state: "sent"; message_id: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendAppointmentReminder(
  infrai: InfraiClient,
  appointment: AppointmentNotification,
): Promise<NotificationDecision> {
  if (appointment.domainVerificationStatus !== "verified") {
    return { state: "held", reason: "sending_domain_unverified" };
  }

  const message = await infrai.email.send(
    {
      to: appointment.patientEmail,
      subject: `Appointment reminder from ${appointment.clinicName}`,
      html: `<p>Your appointment is scheduled for ${escapeHtml(appointment.startsAt)}.</p><p>Contact ${escapeHtml(appointment.clinicName)} directly if this time is no longer suitable.</p>`,
    },
    createHash("sha256").update(`appointment-reminder:${appointment.appointmentId}`).digest("hex"),
  );
  return { state: "sent", message_id: message.message_id };
}

import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Telegram calls this address for every message sent to the bot. Only requests carrying
// the secret registered with setWebhook are accepted.
export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { webhookSecret, handleUpdate } = await import("@/lib/telegram.server");
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, await webhookSecret())) return new Response("Unauthorized", { status: 401 });
        let update: unknown;
        try { update = await request.json(); } catch { return Response.json({ ok: true, ignored: true }); }
        if (!update || typeof update !== "object" || typeof (update as { update_id?: unknown }).update_id !== "number") return Response.json({ ok: true, ignored: true });
        try { await handleUpdate(update as Parameters<typeof handleUpdate>[0]); }
        catch (e) { console.error("Telegram update failed", e); }
        // Always 200 so Telegram does not resend the same message again and again.
        return Response.json({ ok: true });
      },
    },
  },
});

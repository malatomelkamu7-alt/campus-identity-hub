import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminPin } from "@/lib/identity";
import { AUDIENCES, webhookUrlFor, escapeHtml } from "@/lib/telegram-bot";

const pass = z.string().min(1).max(200);
function checkPasscode(p: string) { requireAdminPin(p, process.env["IT_ADMIN_PASSCODE"]); }
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
const bot = () => import("@/lib/telegram.server");

/** Everything the IT Admin bot page shows; polled every few seconds for the live counters. */
export const adminBotDashboard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, origin: z.string().url().max(300) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { tg, notifyStatusChanges } = await bot();
    await notifyStatusChanges().catch((e) => console.error("Status notice failed", e));
    const [users, messages, help, broadcasts, settings, regCount, regs] = await Promise.all([
      sb.from("telegram_users").select("*").order("last_seen_at", { ascending: false }).limit(1000),
      sb.from("telegram_messages").select("*").neq("kind", "help").order("created_at", { ascending: false }).limit(80),
      sb.from("telegram_messages").select("*").eq("kind", "help").order("created_at", { ascending: false }).limit(50),
      sb.from("telegram_broadcasts").select("*").order("created_at", { ascending: false }).limit(20),
      sb.from("telegram_settings").select("*").eq("id", 1).maybeSingle(),
      sb.from("registered_students").select("id", { count: "exact", head: true }).eq("face_verified", true),
      sb.from("registered_students").select("student_code,full_name,grade,section,stream"),
    ]);
    if (users.error || messages.error || help.error || broadcasts.error) throw new Error("Could not load the bot data.");
    const byCode = new Map((regs.data ?? []).map((r) => [r.student_code, r]));
    const people = new Map((users.data ?? []).map((u) => [u.chat_id, u]));
    const label = (chatId: number) => { const u = people.get(chatId); return u ? (u.username ? `@${u.username}` : [u.first_name, u.last_name].filter(Boolean).join(" ") || String(chatId)) : String(chatId); };
    const dayAgo = Date.now() - 86_400_000;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let info: { username: string; name: string } | null = null;
    let webhook: { url: string; pending: number; lastError: string | null } | null = null;
    let botError: string | null = null;
    try {
      const me = await tg<{ username: string; first_name: string }>("getMe");
      info = { username: me.username, name: me.first_name };
      const w = await tg<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo");
      webhook = { url: w.url, pending: w.pending_update_count, lastError: w.last_error_message ?? null };
    } catch (e) { botError = e instanceof Error ? e.message : "Could not reach Telegram."; }
    const list = (users.data ?? []).map((u) => {
      const st = u.student_code ? byCode.get(u.student_code) : undefined;
      return { ...u, student: st ? { name: st.full_name, id: st.student_code, grade: st.grade, section: st.section, stream: st.stream } : null };
    });
    return {
      counts: {
        portalRegistered: regCount.count ?? 0,
        botUsers: list.length,
        linked: list.filter((u) => u.student).length,
        notLinked: list.filter((u) => !u.student).length,
        blocked: list.filter((u) => u.blocked).length,
        newToday: list.filter((u) => Date.parse(u.started_at) >= today.getTime()).length,
        active24h: list.filter((u) => Date.parse(u.last_seen_at) >= dayAgo).length,
        openHelp: (help.data ?? []).filter((h) => !h.handled_at).length,
      },
      users: list,
      messages: (messages.data ?? []).map((m) => ({ ...m, who: label(m.chat_id) })),
      help: (help.data ?? []).map((m) => ({ ...m, who: label(m.chat_id), student: people.get(m.chat_id)?.student_code ? byCode.get(people.get(m.chat_id)!.student_code!)?.full_name ?? null : null })),
      broadcasts: broadcasts.data ?? [],
      settings: settings.data,
      bot: info, webhook, botError, expectedWebhook: webhookUrlFor(data.origin),
    };
  });

const settingsSchema = z.object({
  bot_enabled: z.boolean(), results_enabled: z.boolean(),
  notify_exam_live: z.boolean(), notify_results: z.boolean(), notify_registration: z.boolean(),
  welcome_message: z.string().trim().min(1).max(500),
  help_message: z.string().trim().min(1).max(1000),
  portal_url: z.string().trim().url().max(300).refine((u) => u.startsWith("https://"), "The portal link must start with https://"),
});
export const adminBotSaveSettings = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, settings: settingsSchema }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { error } = await sb.from("telegram_settings").update({ ...data.settings, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error("Could not save the bot settings.");
    return { ok: true };
  });

/** Points Telegram at this site's bot address and sets the bot's command list and menu button. */
export const adminBotConnect = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, origin: z.string().url().max(300) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const { tg, webhookSecret } = await bot();
    const sb = await admin();
    const { data: s } = await sb.from("telegram_settings").select("portal_url").eq("id", 1).single();
    const url = webhookUrlFor(data.origin);
    await tg("setWebhook", { url, secret_token: await webhookSecret(), allowed_updates: ["message"], drop_pending_updates: false });
    await tg("setMyCommands", { commands: [
      { command: "start", description: "Start and sign in with your name" },
      { command: "result", description: "My result" },
      { command: "profile", description: "My profile" },
      { command: "status", description: "Exam status" },
      { command: "help", description: "Ask IT Admin for help" },
      { command: "menu", description: "Show the menu" },
    ] });
    if (s?.portal_url) await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "Portal", web_app: { url: `${s.portal_url.replace(/\/$/, "")}/student` } } }).catch(() => undefined);
    return { url };
  });

export const adminBotBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, audience: z.enum(AUDIENCES.map((a) => a.value) as [string, ...string[]]), message: z.string().trim().min(1).max(3500) }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const { broadcast } = await bot();
    return broadcast(data.audience as (typeof AUDIENCES)[number]["value"], `📢 <b>Burka Harbu Exam Portal</b>\n\n${escapeHtml(data.message)}`, undefined, "manual", data.message);
  });

/** Message one chat; when replying to a help request, that request is marked answered. */
export const adminBotSendTo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, chatId: z.number().int(), message: z.string().trim().min(1).max(3500), helpId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const { send } = await bot();
    const ok = await send(data.chatId, `💬 <b>IT Admin:</b>\n${escapeHtml(data.message)}`, undefined, "reply");
    if (!ok) throw new Error("Telegram did not deliver this message. The student may have blocked the bot.");
    if (data.helpId) { const sb = await admin(); await sb.from("telegram_messages").update({ handled_at: new Date().toISOString() }).eq("id", data.helpId); }
    return { ok: true };
  });

export const adminBotHelpDone = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, helpId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { error } = await sb.from("telegram_messages").update({ handled_at: new Date().toISOString() }).eq("id", data.helpId).eq("kind", "help");
    if (error) throw new Error("Could not update this help request.");
    return { ok: true };
  });

/** Signs a Telegram chat out of its student record; they must send their name again. */
export const adminBotUnlink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ passcode: pass, chatId: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    checkPasscode(data.passcode);
    const sb = await admin();
    const { error } = await sb.from("telegram_users").update({ student_code: null, id_confirmed: false, state: "await_name", linked_at: null }).eq("chat_id", data.chatId);
    if (error) throw new Error("Could not sign this chat out.");
    const { send } = await bot();
    await send(data.chatId, "🚪 IT Admin signed you out of the bot. Send your full name to sign in again.", { remove_keyboard: true });
    return { ok: true };
  });

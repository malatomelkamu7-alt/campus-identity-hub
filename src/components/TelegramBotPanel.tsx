import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Users, UserCheck, UserX, Ban, Sparkles, Activity, LifeBuoy, Send, Link2, Save, Search, MessageSquare, LogOut, CheckCircle2, AlertTriangle, ScanFace, Megaphone } from "lucide-react";
import { Btn, Toggle } from "@/components/Shell";
import { adminBotDashboard, adminBotSaveSettings, adminBotConnect, adminBotBroadcast, adminBotSendTo, adminBotHelpDone, adminBotUnlink } from "@/lib/telegram.functions";
import { AUDIENCES, type Audience } from "@/lib/telegram-bot";

type Dash = Awaited<ReturnType<typeof adminBotDashboard>>;
type Settings = NonNullable<Dash["settings"]>;
const when = (v: string | null) => v ? new Date(v).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const tgName = (u: { username: string | null; first_name: string | null; last_name: string | null; chat_id: number }) => [u.first_name, u.last_name].filter(Boolean).join(" ") || String(u.chat_id);

/** IT Admin control page for the Telegram bot: live counters, users, help inbox, announcements and settings. */
export function TelegramBotPanel({ passcode }: { passcode: string }) {
  const load = useServerFn(adminBotDashboard);
  const save = useServerFn(adminBotSaveSettings);
  const connect = useServerFn(adminBotConnect);
  const broadcast = useServerFn(adminBotBroadcast);
  const sendTo = useServerFn(adminBotSendTo);
  const helpDone = useServerFn(adminBotHelpDone);
  const unlink = useServerFn(adminBotUnlink);
  const qc = useQueryClient();
  const key = ["telegram-bot", passcode];
  const { data, error: loadError } = useQuery({ queryKey: key, refetchInterval: 4000, queryFn: () => load({ data: { passcode, origin: window.location.origin } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => { if (data?.settings && !form) setForm(data.settings); }, [data, form]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [announcement, setAnnouncement] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "linked" | "not" | "blocked">("all");
  const [chatTo, setChatTo] = useState<{ chatId: number; label: string; helpId?: string } | null>(null);
  const [reply, setReply] = useState("");
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); setMsg(ok); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  };
  if (!data) return <div className="tile text-sm text-muted-foreground">{loadError ? <span className="text-destructive">{loadError instanceof Error ? loadError.message : "Could not load the bot."}</span> : "Loading the Telegram bot…"}</div>;
  const c = data.counts;
  const connected = !!data.webhook?.url && data.webhook.url === data.expectedWebhook;
  const users = data.users.filter((u) => (filter === "all" || (filter === "linked" ? !!u.student : filter === "not" ? !u.student : u.blocked)) && (() => {
    const q = query.trim().toLowerCase(); if (!q) return true;
    return [u.username, tgName(u), u.entered_name, u.student?.name, u.student?.id].some((v) => v?.toLowerCase().includes(q));
  })());
  const tiles = [
    { label: "Registered on portal", value: c.portalRegistered, icon: ScanFace, tone: "text-accent" },
    { label: "Bot users", value: c.botUsers, icon: Users, tone: "text-primary" },
    { label: "Signed in as students", value: c.linked, icon: UserCheck, tone: "text-accent" },
    { label: "Not registered", value: c.notLinked, icon: UserX, tone: "text-warning" },
    { label: "New today", value: c.newToday, icon: Sparkles, tone: "text-primary" },
    { label: "Active (24 h)", value: c.active24h, icon: Activity, tone: "text-accent" },
    { label: "Blocked the bot", value: c.blocked, icon: Ban, tone: "text-destructive" },
    { label: "Open help requests", value: c.openHelp, icon: LifeBuoy, tone: c.openHelp ? "text-destructive" : "text-muted-foreground" },
  ];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
      <Bot className="h-8 w-8 text-primary" />
      <div className="mr-auto min-w-0">
        <div className="font-semibold">{data.bot ? <a className="hover:underline" href={`https://t.me/${data.bot.username}`} target="_blank" rel="noopener noreferrer">@{data.bot.username}</a> : "Telegram bot"}</div>
        <div className="flex items-center gap-1.5 text-xs">{data.botError ? <><AlertTriangle className="h-3.5 w-3.5 text-destructive" /><span className="text-destructive">{data.botError}</span></> : connected ? <><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /><span className="text-accent">Connected — answering students live</span></> : <><AlertTriangle className="h-3.5 w-3.5 text-warning" /><span className="text-warning">{data.webhook?.url ? "Connected to a different site address" : "Not connected yet"} — press Connect bot</span></>}</div>
        {data.webhook?.lastError && <div className="text-xs text-muted-foreground">Last Telegram error: {data.webhook.lastError}</div>}
      </div>
      <Btn variant={connected ? "ghost" : "primary"} disabled={busy} onClick={() => run(() => connect({ data: { passcode, origin: window.location.origin } }), "The bot is connected to this site.")}><Link2 className="h-4 w-4" />{connected ? "Reconnect bot" : "Connect bot"}</Btn>
    </div>
    {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    {msg && <p role="status" className="text-sm text-accent">{msg}</p>}

    <section aria-label="Live counters" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => <div key={t.label} className="rounded-xl border border-border bg-secondary/30 p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><t.icon className={`h-3.5 w-3.5 ${t.tone}`} />{t.label}</div>
        <div className={`mt-1 text-2xl font-bold tabular-nums ${t.tone}`}>{t.value}</div>
      </div>)}
    </section>

    {data.help.length > 0 && <section aria-label="Help requests" className="rounded-xl border border-border p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><LifeBuoy className="h-4 w-4 text-destructive" />Help requests from the bot</h3>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {data.help.map((h) => <div key={h.id} className={`rounded-lg border p-3 text-sm ${h.handled_at ? "border-border opacity-60" : "border-destructive/50 bg-destructive/5"}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><strong className="text-foreground">{h.student ?? h.who}</strong>{h.student && <span>{h.who}</span>}<span>{when(h.created_at)}</span>{h.handled_at && <span className="text-accent">Answered</span>}</div>
          <p className="mt-1 whitespace-pre-wrap break-words">{h.text}</p>
          {!h.handled_at && <div className="mt-2 flex flex-wrap gap-2">
            <Btn variant="accent" className="px-3 py-1.5 text-xs" onClick={() => { setChatTo({ chatId: h.chat_id, label: h.student ?? h.who, helpId: h.id }); setReply(""); }}><Send className="h-3.5 w-3.5" />Reply</Btn>
            <Btn variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => run(() => helpDone({ data: { passcode, helpId: h.id } }), "Marked as answered.")}><CheckCircle2 className="h-3.5 w-3.5" />Mark answered</Btn>
          </div>}
        </div>)}
      </div>
    </section>}

    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-label="Send announcement" className="rounded-xl border border-border p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><Megaphone className="h-4 w-4 text-primary" />Message all students</h3>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="bot-audience">Send to</label>
        <select id="bot-audience" className="field mb-3" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>{AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
        <textarea aria-label="Announcement" className="field min-h-28" maxLength={3500} placeholder="Type your announcement…" value={announcement} onChange={(e) => setAnnouncement(e.target.value)} />
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{announcement.length}/3500</span>
          <Btn disabled={busy || !announcement.trim()} onClick={() => {
            const label = AUDIENCES.find((a) => a.value === audience)?.label ?? audience;
            if (!confirm(`Send this message to: ${label}?`)) return;
            setBusy(true); setErr(""); setMsg("");
            broadcast({ data: { passcode, audience, message: announcement } })
              .then((r) => { setMsg(`Sent to ${r.sent} of ${r.total}${r.failed ? ` (${r.failed} could not receive it)` : ""}.`); setAnnouncement(""); return refresh(); })
              .catch((e) => setErr(e instanceof Error ? e.message : "Could not send."))
              .finally(() => setBusy(false));
          }}><Send className="h-4 w-4" />{busy ? "Sending…" : "Send"}</Btn>
        </div>
        {data.broadcasts.length > 0 && <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Recent</div>
          <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">{data.broadcasts.map((b) => <li key={b.id} className="rounded-lg bg-secondary/30 p-2"><div className="flex justify-between gap-2 text-muted-foreground"><span>{b.kind === "auto" ? "Automatic" : AUDIENCES.find((a) => a.value === b.audience)?.label ?? b.audience}</span><span>{when(b.created_at)} · {b.sent} sent{b.failed ? `, ${b.failed} failed` : ""}</span></div><p className="mt-1 line-clamp-2 break-words">{b.message}</p></li>)}</ul>
        </div>}
      </section>

      {form && <section aria-label="Bot settings" className="rounded-xl border border-border p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-primary" />Bot settings</h3>
        <div className="space-y-2">
          {([
            ["bot_enabled", "Bot is on", "When off, the bot only says it is paused."],
            ["results_enabled", "Show results in the bot", "Students see their marks with ID + passcode."],
            ["notify_exam_live", "Tell everyone when the exam goes live", ""],
            ["notify_results", "Tell students when results are published", ""],
            ["notify_registration", "Tell unregistered users when registration opens", ""],
          ] as const).map(([k, label, hint]) => <div key={k} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-2.5">
            <div className="min-w-0"><div className="text-sm">{label}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>
            <Toggle label={label} on={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} />
          </div>)}
        </div>
        <label className="mb-1 mt-3 block text-xs text-muted-foreground" htmlFor="bot-welcome">Welcome message</label>
        <textarea id="bot-welcome" className="field min-h-16" maxLength={500} value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} />
        <label className="mb-1 mt-3 block text-xs text-muted-foreground" htmlFor="bot-help">Help message</label>
        <textarea id="bot-help" className="field min-h-16" maxLength={1000} value={form.help_message} onChange={(e) => setForm({ ...form, help_message: e.target.value })} />
        <label className="mb-1 mt-3 block text-xs text-muted-foreground" htmlFor="bot-portal">Portal link (opens inside Telegram)</label>
        <input id="bot-portal" className="field" maxLength={300} value={form.portal_url} onChange={(e) => setForm({ ...form, portal_url: e.target.value })} />
        <Btn className="mt-4 w-full" disabled={busy} onClick={() => run(() => save({ data: { passcode, settings: { bot_enabled: form.bot_enabled, results_enabled: form.results_enabled, notify_exam_live: form.notify_exam_live, notify_results: form.notify_results, notify_registration: form.notify_registration, welcome_message: form.welcome_message, help_message: form.help_message, portal_url: form.portal_url } } }), "Bot settings saved.")}><Save className="h-4 w-4" />Save settings</Btn>
      </section>}
    </div>

    <section aria-label="Bot users" className="rounded-xl border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="mr-auto flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-primary" />Students on the bot <span className="text-xs font-normal text-muted-foreground">({users.length})</span></h3>
        <div className="relative w-full max-w-xs"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Search bot users" className="field pl-9" placeholder="Search username, name or ID" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <select aria-label="Filter bot users" className="field w-auto" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">All</option><option value="linked">Signed in</option><option value="not">Not registered</option><option value="blocked">Blocked the bot</option></select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-muted-foreground"><tr className="border-b border-border"><th className="py-2 pr-3 font-medium">Telegram</th><th className="py-2 pr-3 font-medium">Name they typed</th><th className="py-2 pr-3 font-medium">Student</th><th className="py-2 pr-3 font-medium">Started</th><th className="py-2 pr-3 font-medium">Last active</th><th className="py-2 font-medium"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => <tr key={u.chat_id}>
              <td className="py-2.5 pr-3"><div className="font-medium">{u.username ? <a className="text-primary hover:underline" href={`https://t.me/${u.username}`} target="_blank" rel="noopener noreferrer">@{u.username}</a> : <span className="text-muted-foreground">no username</span>}</div><div className="text-xs text-muted-foreground">{tgName(u)}{u.blocked && <span className="ml-1 text-destructive">· blocked</span>}</div></td>
              <td className="py-2.5 pr-3 break-words">{u.entered_name ?? "—"}</td>
              <td className="py-2.5 pr-3">{u.student ? <><div className="flex items-center gap-1 font-medium"><UserCheck className="h-3.5 w-3.5 text-accent" />{u.student.name}</div><div className="font-mono text-xs text-muted-foreground">{u.student.id} · {u.student.grade}{u.student.section} · {u.student.stream}</div></> : <span className="text-xs text-warning">Not registered</span>}</td>
              <td className="py-2.5 pr-3 text-xs">{when(u.started_at)}</td>
              <td className="py-2.5 pr-3 text-xs">{when(u.last_seen_at)}</td>
              <td className="py-2.5"><div className="flex justify-end gap-1">
                <Btn variant="ghost" className="px-2" title="Send a message" aria-label={`Message ${u.username ?? tgName(u)}`} disabled={u.blocked} onClick={() => { setChatTo({ chatId: u.chat_id, label: u.student?.name ?? (u.username ? `@${u.username}` : tgName(u)) }); setReply(""); }}><MessageSquare className="h-4 w-4" /></Btn>
                {u.student && <Btn variant="ghost" className="px-2" title="Sign out of the bot" aria-label={`Sign out ${u.student.name}`} disabled={busy} onClick={() => { if (confirm(`Sign ${u.student!.name} out of the bot? They will need to send their name again.`)) void run(() => unlink({ data: { passcode, chatId: u.chat_id } }), "Signed out of the bot."); }}><LogOut className="h-4 w-4" /></Btn>}
              </div></td>
            </tr>)}
            {!users.length && <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{data.users.length ? "No matching users." : "No one has started the bot yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <section aria-label="Recent bot messages" className="rounded-xl border border-border p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4 text-primary" />Recent bot messages</h3>
      <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
        {data.messages.map((m) => <li key={m.id} className={`flex gap-2 rounded-lg p-2 ${m.direction === "in" ? "bg-secondary/40" : "bg-primary/5"}`}>
          <span className={`shrink-0 text-xs font-semibold ${m.direction === "in" ? "text-primary" : "text-accent"}`}>{m.direction === "in" ? m.who : `Bot → ${m.who}`}</span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs">{(m.text ?? "").replace(/<[^>]+>/g, "").slice(0, 300)}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{when(m.created_at)}</span>
        </li>)}
        {!data.messages.length && <li className="py-6 text-center text-muted-foreground">No messages yet.</li>}
      </ul>
    </section>

    {chatTo && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="bot-reply-title">
      <form className="tile w-full max-w-md space-y-3" onSubmit={(e) => {
        e.preventDefault();
        const target = chatTo;
        void run(() => sendTo({ data: { passcode, chatId: target.chatId, message: reply, ...(target.helpId ? { helpId: target.helpId } : {}) } }), `Message sent to ${target.label}.`).then(() => setChatTo(null));
      }}>
        <h2 id="bot-reply-title" className="font-semibold">Message {chatTo.label}</h2>
        <textarea aria-label="Message" className="field min-h-28" maxLength={3500} required value={reply} onChange={(e) => setReply(e.target.value)} />
        <div className="flex justify-end gap-2"><Btn type="button" variant="ghost" onClick={() => setChatTo(null)}>Cancel</Btn><Btn disabled={busy || !reply.trim()}><Send className="h-4 w-4" />Send</Btn></div>
      </form>
    </div>}
  </div>;
}

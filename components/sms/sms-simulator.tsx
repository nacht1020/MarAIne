"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareText, Send, Smartphone } from "lucide-react";
import { simulateSms } from "@/app/admin/sms/actions";
import { CatchStatusBadge } from "@/components/catch/catch-status";
import { LicenseBadge } from "@/components/fishers/license-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LicenseStatus } from "@/lib/fishers/license";
import type { SmsOutcome } from "@/lib/sms/ingest";
import { cn } from "@/lib/utils";

export type SenderOption = { phone: string; name: string; municipality: string | null; license: LicenseStatus; daysLeft: number | null };

type Message = { id: number; direction: "in" | "out"; text: string; at: string; outcome?: SmsOutcome };

const EXAMPLES = [
  { text: "HULI TULINGAN 10KG", note: "Logged, pending location" },
  { text: "HULI LAPU-LAPU 3KG 25CM", note: "Closed season, undersized" },
  { text: "CATCH galunggong 8.5 kg", note: "English keyword" },
  { text: "HULI PATING 5KG", note: "Unknown fish" },
  { text: "TULONG", note: "Format help" },
];
const UNREGISTERED = "09171234567";

export function SmsSimulator({ senders }: { senders: SenderOption[] }) {
  const [from, setFrom] = useState(senders[0]?.phone ?? UNREGISTERED);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const nextId = useRef(1);
  const threadEnd = useRef<HTMLDivElement>(null);

  // Block body: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup.
  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const sender = senders.find((s) => s.phone === from);
  const time = () => new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

  async function send(message: string) {
    const body = message.trim();
    if (!body || sending) return;
    setError("");
    setSending(true);
    setMessages((m) => [...m, { id: nextId.current++, direction: "out", text: body, at: time() }]);
    setText("");
    const res = await simulateSms({ from, message: body });
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMessages((m) => [...m, { id: nextId.current++, direction: "in", text: res.outcome.reply, at: time(), outcome: res.outcome }]);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section className="flex h-[38rem] flex-col overflow-hidden rounded-2xl border-4 border-navy bg-card shadow-sm" aria-label="Simulated phone">
        <header className="flex items-center gap-3 border-b bg-muted/60 px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-teal text-teal-foreground">
            <MessageSquareText className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold">MarAIne SMS</p>
            <p className="truncate text-xs text-muted-foreground">
              From {sender ? `${sender.name} · ${from}` : `${from} (not registered)`}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {messages.length === 0 ? (
            <p className="mx-auto mt-10 max-w-60 text-center text-sm text-muted-foreground">
              Send a message the way a fisher would, for example <span className="font-mono">HULI TULINGAN 10KG</span>.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn("flex flex-col gap-1", m.direction === "out" ? "items-end" : "items-start")}>
                <p
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                    m.direction === "out" ? "rounded-br-sm bg-navy text-navy-foreground" : "rounded-bl-sm bg-muted",
                  )}
                >
                  {m.text}
                </p>
                <span className="px-1 text-[10px] text-muted-foreground">{m.at}</span>
                {m.outcome?.result === "logged" && m.outcome.qrToken && (
                  <div className="flex flex-wrap items-center gap-2 px-1">
                    {m.outcome.status && <CatchStatusBadge status={m.outcome.status} />}
                    <Link href={`/admin/catches?q=${m.outcome.qrToken}`} className="text-xs text-teal hover:underline">
                      Open in Catches
                    </Link>
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Waiting for reply
            </p>
          )}
          <div ref={threadEnd} />
        </div>

        <form
          className="flex items-center gap-2 border-t bg-card px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <label htmlFor="sms-text" className="sr-only">
            Message
          </label>
          <Input id="sms-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="HULI TULINGAN 10KG" maxLength={320} autoComplete="off" className="h-10" />
          <Button type="submit" size="icon" className="size-10 shrink-0" disabled={sending || !text.trim()} aria-label="Send message">
            <Send className="size-4" />
          </Button>
        </form>
        {error && <p className="border-t bg-coral-soft px-4 py-2 text-sm text-coral">{error}</p>}
      </section>

      <div className="space-y-4">
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="sms-from">Send from</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger id="sms-from" className="h-auto min-h-10 py-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {senders.map((s) => (
                  <SelectItem key={s.phone} value={s.phone}>
                    <span className="flex flex-wrap items-center gap-2">
                      <Smartphone className="size-3.5 text-muted-foreground" aria-hidden />
                      {s.name}
                      <span className="text-xs text-muted-foreground">
                        {s.municipality} · {s.phone}
                      </span>
                      {s.license !== "valid" && <LicenseBadge status={s.license} daysLeft={s.daysLeft} />}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value={UNREGISTERED}>
                  <span className="flex items-center gap-2">
                    <Smartphone className="size-3.5 text-muted-foreground" aria-hidden />
                    Unregistered number <span className="text-xs text-muted-foreground">{UNREGISTERED}</span>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Sample fishers. Pick one with an expired license to see that flag. Catches sent here are real logs in the database.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Try a message</p>
            <ul className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <li key={e.text}>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => send(e.text)}
                    className="rounded-md border bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <span className="block font-mono text-xs">{e.text}</span>
                    <span className="block text-[11px] text-muted-foreground">{e.note}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-2 rounded-lg border bg-card p-4 text-sm">
          <h2 className="font-semibold">Message format</h2>
          <p>
            <span className="font-mono">HULI &lt;isda&gt; &lt;kilo&gt;KG [haba]CM</span> or <span className="font-mono">CATCH &lt;fish&gt; &lt;weight&gt;KG [length]CM</span>.
            Local or English fish names work, with or without hyphens. A bare number is read as kilograms. Replies come back in the language of
            the keyword. <span className="font-mono">TULONG</span> or <span className="font-mono">HELP</span> returns the format.
          </p>
          <p className="text-muted-foreground">
            SMS has no GPS, so a logged catch is <span className="font-medium">Pending</span> until its location is confirmed, unless another check
            flags it for review first.
          </p>
        </section>

        <section className="space-y-2 rounded-lg border bg-card p-4 text-sm">
          <h2 className="font-semibold">Connect a real SMS gateway</h2>
          <p className="text-muted-foreground">Point the gateway&apos;s inbound webhook here. It must send the shared secret in a header.</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{`POST /api/sms/inbound
x-webhook-secret: <SMS_WEBHOOK_SECRET>
Content-Type: application/json

{ "from": "09XXXXXXXXX", "message": "HULI TULINGAN 10KG" }`}</pre>
          <p className="text-xs text-muted-foreground">
            Also accepts form posts with <span className="font-mono">From</span>/<span className="font-mono">Body</span>. Add{" "}
            <span className="font-mono">?format=text</span> to get the reply as plain text.
          </p>
        </section>
      </div>
    </div>
  );
}

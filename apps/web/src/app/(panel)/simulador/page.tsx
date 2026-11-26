"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, Button, Field } from "@/components/ui";
import { BotBubble, ListSheet, Phone, ReplyButtons, UserBubble } from "@/components/whatsapp";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage, parseApiError } from "@/lib/api-client";
import type { BotMessage, ChatEntry } from "@/lib/whatsapp/types";

type OpenList = Extract<BotMessage, { type: "list" }> | null;

export default function SimulatorPage() {
  const { user, apiFetch } = useAuth();
  const [phone, setPhone] = useState("3764 555000");
  const [profileName, setProfileName] = useState("Cliente de prueba");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [openList, setOpenList] = useState<OpenList>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, sending]);

  const nextKey = () => `m${counter.current++}`;

  async function send(message: { type: "text"; text: string } | { type: "reply"; id: string; title: string }) {
    setError(null);
    setOpenList(null);
    setChat((c) => [...c, { from: "user", text: message.type === "text" ? message.text : message.title, key: nextKey() }]);
    setSending(true);
    try {
      const res = await apiFetch("/api/whatsapp/simulator/messages", {
        method: "POST",
        body: JSON.stringify({ phone, profileName: profileName.trim() || undefined, message }),
      });
      if (!res.ok) throw await parseApiError(res);
      const { replies } = (await res.json()) as { replies: BotMessage[] };
      setChat((c) => [...c, ...replies.map((m) => ({ from: "bot" as const, message: m, key: nextKey() }))]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    setError(null);
    try {
      const res = await apiFetch(`/api/whatsapp/simulator/conversation?phone=${encodeURIComponent(phone)}`, { method: "DELETE" });
      if (!res.ok) throw await parseApiError(res);
      setChat([]);
      setOpenList(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = input.trim();
    if (!t || sending) return;
    setInput("");
    void send({ type: "text", text: t });
  }

  return (
    <div className="grid max-w-5xl gap-8 lg:grid-cols-[1fr_380px]">
      <div className="order-2 space-y-5 lg:order-1">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Simulador de WhatsApp</h1>
          <p className="mt-1 text-sm text-stone-500">
            Probá el bot como si fueras un cliente. Usa la misma lógica que va a responder en WhatsApp.
          </p>
        </div>

        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          Los turnos que reserves acá son <strong>reales</strong>: aparecen en <Link href="/turnos" className="underline">Turnos</Link>{" "}
          como &quot;Reservado desde WhatsApp&quot;.
        </div>

        <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="font-medium">Cliente simulado</h2>
          <Field label="Número de WhatsApp" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Field
            label="Nombre de perfil de WhatsApp"
            hint="Opcional"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
          />
          <p className="text-xs text-stone-500">
            Cambiá el número para simular otro cliente. Si el número ya es cliente, el bot lo reconoce y no le pide el nombre.
          </p>
          <Button variant="secondary" onClick={() => void reset()}>
            Reiniciar conversación
          </Button>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600">
          <h2 className="mb-2 font-medium text-stone-900">Cosas para probar</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Escribí <em>hola</em> o un número del 1 al 6.</li>
            <li>Reservá un turno y abrí la sección Turnos.</li>
            <li>Escribí texto cuando el bot espera que toques una opción.</li>
            <li>Tocá una opción de una lista vieja.</li>
            <li>Cambiá o cancelá el turno desde el menú.</li>
          </ul>
        </div>
        {error && <Alert>{error}</Alert>}
      </div>

      <div className="order-1 lg:order-2">
        <Phone
          title={user?.barbershop.name ?? "Barbería"}
          scrollRef={scrollRef}
          footer={
            <form onSubmit={submit} className="flex items-center gap-2 bg-[#f0f2f5] px-2 py-2">
              <input
                aria-label="Mensaje"
                placeholder="Escribí un mensaje"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 rounded-full bg-white px-4 py-2 text-sm outline-none"
              />
              <button
                type="submit"
                aria-label="Enviar"
                disabled={sending || !input.trim()}
                className="flex size-9 items-center justify-center rounded-full bg-[#008069] text-white disabled:opacity-50"
              >
                ➤
              </button>
            </form>
          }
        >
          {chat.length === 0 && (
            <p className="mx-auto mt-4 w-fit rounded-lg bg-[#fff5c4] px-3 py-1.5 text-center text-xs text-stone-700">
              Escribí &quot;hola&quot; para empezar
            </p>
          )}
          {chat.map((entry) => {
            if (entry.from === "user") return <UserBubble key={entry.key}>{entry.text}</UserBubble>;
            const m = entry.message;
            if (m.type === "text") return <BotBubble key={entry.key}>{m.text}</BotBubble>;
            if (m.type === "buttons") {
              return (
                <div key={entry.key}>
                  <BotBubble footer={m.footer}>{m.body}</BotBubble>
                  <ReplyButtons items={m.buttons} onSelect={(b) => void send({ type: "reply", id: b.id, title: b.title })} />
                </div>
              );
            }
            return (
              <BotBubble key={entry.key} footer={m.footer} button={m.button} onButton={() => setOpenList(m)}>
                {m.body}
              </BotBubble>
            );
          })}
          {sending && <p className="text-center text-xs text-stone-500">escribiendo…</p>}
          {openList && (
            <ListSheet
              title={openList.button}
              sections={openList.sections}
              onClose={() => setOpenList(null)}
              onSelect={(row) => void send({ type: "reply", id: row.id, title: row.title })}
            />
          )}
        </Phone>
      </div>
    </div>
  );
}

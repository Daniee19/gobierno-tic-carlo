"use client";

import { useState } from "react";

type Step = "email" | "code";

// @req RF-01 RF-02
export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function explain(status: number, data: any): string {
    if (status === 429) {
      return data?.error === "ATTEMPTS_EXCEEDED"
        ? "Superaste los 3 intentos de este código. Solicita uno nuevo."
        : `Demasiados intentos. Espera ${data?.retry_after_sec ?? 60} s e inténtalo de nuevo.`;
    }
    if (status === 401) return "Código inválido o expirado.";
    if (status === 400) return "Revisa el formato del correo y del código (6 dígitos).";
    return "No se pudo completar la operación.";
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { res, data } = await post("/api/auth/request-otp", { email });
    setBusy(false);
    if (res.ok) {
      setDemoOtp(data.demo_otp ?? null);
      setMessage({ kind: "ok", text: data.message });
      setStep("code");
    } else {
      setMessage({ kind: "error", text: explain(res.status, data) });
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { res, data } = await post("/api/auth/verify-otp", { email, code });
    setBusy(false);
    if (res.ok) {
      window.location.href = "/inspecciones";
    } else {
      setMessage({ kind: "error", text: explain(res.status, data) });
    }
  }

  return (
    <div className="card narrow">
      <h1>Ingresar</h1>
      {step === "email" ? (
        <form onSubmit={requestCode}>
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button disabled={busy}>Enviar código</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <label htmlFor="code">Código de 6 dígitos para {email}</label>
          <input
            id="code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
          />
          <button disabled={busy}>Verificar</button>{" "}
          <button type="button" className="secondary" onClick={() => setStep("email")}>
            Pedir otro código
          </button>
          {demoOtp && (
            <div className="hint">
              Modo demo (sin proveedor de correo): tu código es <strong>{demoOtp}</strong>
            </div>
          )}
        </form>
      )}
      {message && <div className={`msg ${message.kind}`}>{message.text}</div>}
      <p className="msg" style={{ color: "var(--muted)" }}>
        Prototipo con datos simulados. Cuentas de prueba: admin@carlo.demo, asesor1@carlo.demo.
      </p>
    </div>
  );
}

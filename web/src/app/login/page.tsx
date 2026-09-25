"use client";

import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";

function LoginForm() {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const entrar = async () => {
    setCarregando(true);
    setErro(null);
    const r = await signIn("google", { callbackUrl: "/", redirect: false });
    if (r?.error) {
      setErro("Não foi possível autenticar. Verifique se seu e-mail é @portalmedico.org.br.");
      setCarregando(false);
    }
  };

  return (
    <div className="login-card">
      <div className="login-brand">
        <img src="/cfm.png" alt="CFM" />
        <div>
          <strong>Prescrição</strong>
          <span>Eletrônica CFM</span>
        </div>
      </div>
      <h1>PE Dashboard</h1>
      <p className="login-sub">Painel operacional da Prescrição Eletrônica</p>

      <button className="login-btn" onClick={entrar} disabled={carregando}>
        {carregando ? (
          <><span className="spinner" /> Aguardando Google…</>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.1 3.57-5.18 3.57-8.81z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.88-3.01c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24z"/>
            <path fill="#FBBC05" d="M5.29 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.28a12 12 0 0 0 0 10.77l4.01-3.12z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.62l4.01 3.12C6.23 6.86 8.88 4.75 12 4.75z"/>
          </svg>
        )}
        Entrar com Google
      </button>

      {erro && <div className="login-erro">{erro}</div>}
      <p className="login-note">Acesso restrito a contas @portalmedico.org.br</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="login-wrap">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

"use client";

// @req RF-05
export default function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button className="secondary" style={{ marginTop: 0 }} onClick={logout}>
      Salir
    </button>
  );
}

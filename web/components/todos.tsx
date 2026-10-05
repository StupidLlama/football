"use client";
import Link from "next/link";
import type { Todo } from "@/lib/todos";

const TONE = { main: "#2DD4BF", warn: "#F5A524", info: "#3B82F6" };

/** 列表樣式（我的頁）。 */
export function TodoList({ todos }: { todos: Todo[] }) {
  if (!todos.length) return <p className="faint" style={{ margin: "8px 0 0" }}>沒有待辦，讚。</p>;
  return (
    <>
      {todos.map((t) => (
        <div key={t.key} className="row" style={{ flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 180px", minWidth: 0 }}><b>{t.title}</b>
            <span className="faint" style={{ display: "block", fontSize: 14 }}>{t.detail}</span></span>
          {t.href && <Link className={t.tone === "main" ? "btn btn-main btn-sm" : "btn btn-line btn-sm"} href={t.href}>{t.action}</Link>}
        </div>
      ))}
    </>
  );
}

/** 卡片樣式（首頁）。 */
export function TodoCards({ todos }: { todos: Todo[] }) {
  if (!todos.length) return <p className="faint" style={{ margin: 0 }}>沒有待辦，讚。</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
      {todos.map((t) => (
        <div key={t.key} className="panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 4, borderTop: `3px solid ${TONE[t.tone]}` }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>{t.title}</p>
          <p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>{t.detail}</p>
          {t.href && <Link className={t.tone === "main" ? "btn btn-main" : "btn btn-line"} href={t.href} style={{ marginTop: "auto", alignSelf: "flex-start" }}>{t.action}</Link>}
        </div>
      ))}
    </div>
  );
}

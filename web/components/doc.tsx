// 政策文件頁的版面：標題、版本日期、目錄、內文。
import Link from "next/link";
import type { ReactNode } from "react";
import { Footer, Logo } from "./ui";

export function DocPage({ title, version, intro, children }: { title: string; version: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 20px 48px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0 24px" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "#E9EDF3", textDecoration: "none", fontWeight: 700 }}>
          <Logo size={28} />Football Analysis Potato
        </Link>
      </header>
      <article className="doc">
        <h1 style={{ margin: "0 0 4px", fontSize: 32 }}>{title}</h1>
        <p className="faint" style={{ margin: "0 0 16px" }}>版本 {version}</p>
        <div className="muted" style={{ fontSize: 17 }}>{intro}</div>
        {children}
      </article>
      <Footer />
    </div>
  );
}

export function Sec({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} style={{ marginTop: 28 }}>
      <h2 id={`${id}-h`} style={{ fontSize: 21, margin: "0 0 8px" }}>{title}</h2>
      {children}
    </section>
  );
}

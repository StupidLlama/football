// 更新紀錄：版本號跟 GitHub 標籤一樣，內容在 lib/updates.ts。
import { DocPage } from "@/components/doc";
import { MarkUpdatesSeen } from "@/components/updates-seen";
import { LATEST, UPDATES } from "@/lib/updates";

export const metadata = { title: "更新紀錄" };

export default function UpdatesPage() {
  return (
    <DocPage title="更新紀錄" version={LATEST} intro={<p>網站每次更新了什麼，最新的在最上面。</p>}>
      <MarkUpdatesSeen />
      {UPDATES.map((u) => (
        <section key={u.version} id={u.version} aria-labelledby={`${u.version}-h`} style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #22304A" }}>
          <p className="faint" style={{ margin: 0, fontSize: 14 }}>
            <span className="num" style={{ color: u.big ? "#60A5FA" : undefined }}>{u.version}</span>　{u.date.replace(/-/g, "/")}
          </p>
          <h2 id={`${u.version}-h`} style={{ fontSize: 21, margin: "2px 0 8px" }}>{u.title}</h2>
          <ul>
            {u.items.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>
      ))}
    </DocPage>
  );
}

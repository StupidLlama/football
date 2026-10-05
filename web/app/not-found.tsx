import Link from "next/link";

export default function NotFound() {
  return (
    <div className="narrow">
      <h1 style={{ fontSize: 28 }}>找不到這一頁</h1>
      <p className="muted">網址可能打錯了，或這一頁已經搬走。</p>
      <Link className="btn btn-main" href="/">回首頁</Link>
    </div>
  );
}

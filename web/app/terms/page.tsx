// 服務條款。內容改了要更新 lib/policies.ts 的 POLICY_VERSION。
import Link from "next/link";
import { DocPage, Sec } from "@/components/doc";
import { REPO_URL } from "@/components/ui";
import { OPERATOR_NAME, POLICY_VERSION } from "@/lib/policies";

export const metadata = { title: "服務條款" };

export default function TermsPage() {
  return (
    <DocPage title="服務條款" version={POLICY_VERSION} intro={
      <p>使用 Football Analysis Potato（以下稱「本網站」）之前，請先閱讀這份條款。登入並按「同意」，就表示你同意這份條款和 <Link href="/privacy">隱私權政策</Link>。</p>
    }>
      <Sec id="service" title="本網站提供什麼">
        <p>本網站由{OPERATOR_NAME}個人營運，免費提供球隊管理名單、球員能力自評與分析、比賽和裁判任務等功能。功能會持續更新，部分功能可能調整或停止。</p>
      </Sec>

      <Sec id="account" title="帳號">
        <ul>
          <li>請用你自己的帳號，不要借給別人或冒用別人的身分。</li>
          <li>Team ID 和管理員碼只給你的隊友和要當球隊管理員的人，不要公開張貼。</li>
          <li>未滿 18 歲的使用者，請在法定代理人同意下使用。</li>
          <li>你可以隨時在「設定」刪除帳號。</li>
        </ul>
      </Sec>

      <Sec id="content" title="你填寫的內容">
        <ul>
          <li>能力自評、暱稱、給球隊的話等內容由你自己負責，請誠實填寫。</li>
          <li>不可以有騷擾、歧視、威脅、色情、侵害他人權利或違法的內容，也不可以填寫別人的個人資料。</li>
          <li>球隊管理員可以移出成員、刪除名單上的名字；網站管理員可以刪除違反條款的內容。</li>
        </ul>
      </Sec>

      <Sec id="managers" title="球隊管理員">
        <ul>
          <li>球隊管理員負責自己球隊的名單：確認認領時要確定是本人，不要把別人的資料連到錯的帳號。</li>
          <li>管理員碼請私訊給要當管理員的人，外流時請在管理專區作廢，並視需要重設 Team ID。</li>
        </ul>
      </Sec>

      <Sec id="prohibited" title="禁止的行為">
        <ul>
          <li>試圖讀取別隊的資料、猜測代碼、攻擊或干擾網站運作。</li>
          <li>用程式大量送出請求或訊息。</li>
          <li>發現安全問題請用 <Link href="/contact">聯絡我們</Link> 回報，不要公開或利用它。</li>
        </ul>
      </Sec>

      <Sec id="source" title="原始碼">
        <p>本網站的原始碼依 GNU Affero General Public License v3.0（AGPL-3.0）公開在 <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>。原始碼公開不代表資料公開：球員資料和金鑰不在原始碼裡。</p>
      </Sec>

      <Sec id="disclaimer" title="免責">
        <ul>
          <li>能力分析、位置適合度、自動排陣容等結果是依據自評資料計算的參考，不代表真實能力，也不保證比賽結果。</li>
          <li>本網站盡力維持正常運作，但可能因維護、第三方服務故障或其他原因暫停；請不要把它當成唯一的資料備份。</li>
          <li>在法律允許的範圍內，因使用本網站造成的間接損失，網站管理員不負賠償責任。</li>
        </ul>
      </Sec>

      <Sec id="suspend" title="停權">
        <p>違反這份條款時，網站管理員可以暫停或刪除帳號，並會儘量先通知你。</p>
      </Sec>

      <Sec id="changes" title="條款修改">
        <p>條款有重要修改時，版本日期會更新，你下次登入時需要再同意一次。不同意的話可以停止使用並刪除帳號。</p>
      </Sec>

      <Sec id="law" title="準據法">
        <p>這份條款依中華民國法律解釋。</p>
      </Sec>
    </DocPage>
  );
}

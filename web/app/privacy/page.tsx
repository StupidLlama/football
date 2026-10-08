// 隱私權政策（個人資料保護法第 8 條告知事項）。內容改了要更新 lib/policies.ts 的 POLICY_VERSION。
import Link from "next/link";
import { DocPage, Sec } from "@/components/doc";
import { CONTACT_EMAIL, DATA_REGION, OPERATOR_NAME, POLICY_VERSION } from "@/lib/policies";

export const metadata = { title: "隱私權政策" };

export default function PrivacyPage() {
  return (
    <DocPage title="隱私權政策" version={POLICY_VERSION} intro={
      <p>Football Analysis Potato（以下稱「本網站」）是讓球隊管理名單、球員能力、比賽和裁判任務的網站。這份政策依照《個人資料保護法》說明我們蒐集哪些資料、怎麼用、你有哪些權利。</p>
    }>
      <Sec id="who" title="誰負責你的資料">
        <ul>
          <li><b>網站管理員</b>：{OPERATOR_NAME}（個人營運）。負責整個網站、資料庫和帳號系統。</li>
          <li><b>各球隊的球隊管理員</b>：負責自己球隊的名單和資料，例如確認誰是名單上的人、移出成員、刪除名單上的名字。</li>
        </ul>
      </Sec>

      <Sec id="what" title="我們蒐集哪些資料">
        <div className="tbl-wrap"><table>
          <tbody>
            <tr><th>帳號</th><td>Email、Google 帳號的名字（用 Google 登入時）、你設定的顯示名稱、登入方式</td></tr>
            <tr><th>球隊</th><td>你加入哪些球隊、身分（球員或球隊管理員）、名單上的名字、背號、隊長標記</td></tr>
            <tr><th>你自己填的</th><td>21 項能力自評（每次送出都保留紀錄）、擅長和不擅長的位置、弱腳、暱稱、給球隊的話</td></tr>
            <tr><th>比賽</th><td>聯賽賽程、比分、裁判任務的指派</td></tr>
            <tr><th>聊天室</th><td>你在隊伍聊天室發的訊息內容、時間、編輯和刪除紀錄</td></tr>
            <tr><th>聯絡我們</th><td>你送出的訊息內容、類型、從哪一頁送出</td></tr>
            <tr><th>安全紀錄</th><td>Team ID 和管理員碼輸錯的次數與時間（防止有人亂猜）、你同意政策的版本和時間</td></tr>
            <tr><th>連線紀錄</th><td>網站主機（Vercel）和資料庫（Supabase）會自動記錄 IP 位址、瀏覽器種類和時間，用來維持服務和處理攻擊</td></tr>
          </tbody>
        </table></div>
        <p>我們<b>不會</b>蒐集身分證字號、生日、電話、地址、金融資料，也沒有廣告或追蹤。</p>
      </Sec>

      <Sec id="why" title="為什麼蒐集">
        <ul>
          <li>球隊管理：名單、能力分析、組隊、賽程和裁判任務。</li>
          <li>帳號管理與安全：登入、確認你屬於哪一隊、防止有人冒用或亂猜代碼。</li>
          <li>回覆你的問題、修正網站的問題。</li>
        </ul>
        <p className="faint" style={{ fontSize: 14 }}>個資法特定目的：〇六九 契約、類似契約或其他法律關係事務；一三五 資（通）訊服務；一三六 資（通）訊與資料庫管理；一五七 調查、統計與研究分析。</p>
      </Sec>

      <Sec id="who-sees" title="誰看得到">
        <ul>
          <li><b>同一隊的成員</b>：名單、能力自評、位置、給球隊的話、比賽和裁判任務、隊伍聊天室的訊息。別隊的人看不到（資料庫的權限規則會擋，並有自動測試檢查）。</li>
          <li><b>球隊管理員</b>：另外看得到誰還沒填能力表、誰申請認領、誰輸錯管理員碼被封鎖；如果設定了聊天室的 Discord 通知，網址本身只有資料庫知道，連球隊管理員自己也看不到。</li>
          <li><b>你放進「生涯」的球隊</b>：你在「設定 → 我的生涯」打開某一隊後，你現在所有球隊的成員都看得到那一隊的隊名、賽季、你的背號、擅長位置和能力自評紀錄（不包含那一隊其他人的資料）。預設關閉，只有你自己能打開或關掉，關掉後立即看不到。</li>
          <li><b>網站管理員</b>：為了維護網站和處理你的要求，可以存取資料庫；不會用在其他用途。</li>
          <li>我們不會把你的資料賣給任何人，也不會提供給廣告商。</li>
        </ul>
      </Sec>

      <Sec id="where" title="資料存在哪裡、交給哪些服務處理">
        <div className="tbl-wrap"><table>
          <tbody>
            <tr><th>Supabase</th><td>資料庫和登入系統，資料存在{DATA_REGION}</td></tr>
            <tr><th>Vercel</th><td>網站主機，把網頁送到你的瀏覽器（全球多個節點）</td></tr>
            <tr><th>Google</th><td>用 Google 登入時，由 Google 確認你的身分；我們只拿到 Email 和名字</td></tr>
            <tr><th>Discord</th><td>你送出「聯絡我們」時，訊息內容和你的 Email 會通知到網站管理員的私人 Discord 頻道；如果你的球隊管理員設定了聊天室通知，聊天室的新貼文（不包含回覆）也會推到球隊自己的 Discord 頻道</td></tr>
          </tbody>
        </table></div>
        <p>這些服務會依照它們自己的隱私權政策處理資料。</p>
      </Sec>

      <Sec id="how-long" title="保存多久">
        <ul>
          <li>帳號存在的期間都會保存。</li>
          <li><b>刪除帳號</b>時立即刪除：帳號、Email、顯示名稱、你在所有球隊的成員身分、你的全部能力自評、你填的暱稱、位置、弱腳和給球隊的話、你送出的聯絡訊息。你在聊天室發的訊息會清空內容變成「已刪除」（不會整則消失），讓其他人的回覆還看得懂上下文。</li>
          <li>名單上的<b>名字、背號、隊長標記</b>屬於球隊的名單，刪帳號後會留著並變成「沒有連結帳號」，球隊管理員可以再把它刪除。</li>
          <li>資料庫服務的系統備份可能還會保留一小段時間（通常 7 天內）後自動覆蓋。</li>
        </ul>
      </Sec>

      <Sec id="rights" title="你的權利（個資法第 3 條）">
        <ul>
          <li><b>查詢、閱覽</b>：你的資料都在網站上看得到。</li>
          <li><b>製給複製本</b>：到「設定 → 下載我的資料」，下載一份 JSON 檔。</li>
          <li><b>補充、更正</b>：在「我的」頁面或重新填能力表修改；名字、背號請找球隊管理員。</li>
          <li><b>停止蒐集、處理、利用，請求刪除</b>：到「設定 → 刪除我的帳號」，或透過下方的聯絡方式。</li>
        </ul>
        <p>如果你不提供必要的資料（例如不登入），就不能使用本網站的球隊功能。</p>
      </Sec>

      <Sec id="cookies" title="Cookie 與瀏覽器裡存的資料">
        <p>本網站<b>沒有使用追蹤或廣告 Cookie</b>。瀏覽器裡只存這些必要的東西：</p>
        <div className="tbl-wrap"><table>
          <tbody>
            <tr><th>登入狀態</th><td>讓你不用每次重新登入（沒有它就無法登入）</td></tr>
            <tr><th>文字大小</th><td>你在設定頁選的大小</td></tr>
            <tr><th>能力表草稿</th><td>沒填完的能力表，送出後自動刪除</td></tr>
          </tbody>
        </table></div>
        <p>字體檔由本網站自己的主機提供，不會從其他網站載入。用 Google 登入時，Google 的登入頁會使用 Google 自己的 Cookie。之後如果加入流量分析，會先在這裡更新並請你同意。</p>
      </Sec>

      <Sec id="security" title="我們怎麼保護資料">
        <ul>
          <li>全站使用 HTTPS 加密連線。</li>
          <li>資料庫的每一張表都有權限規則，隊伍之間互相看不到；每次修改都會跑自動測試。</li>
          <li>密碼不經過本網站（Google 登入由 Google 處理，Email 密碼由 Supabase 加密保存）。</li>
          <li>Team ID 和管理員碼輸錯太多次會被鎖定；管理員碼只保存雜湊值，不保存原文。</li>
          <li>如果發生個資外洩，我們會在查明後儘快通知受影響的人，說明發生了什麼、可能的影響和我們做了哪些處理。</li>
        </ul>
      </Sec>

      <Sec id="minors" title="未成年人">
        <p>未滿 18 歲的使用者，請在法定代理人（例如父母）同意下使用本網站。</p>
      </Sec>

      <Sec id="changes" title="政策修改">
        <p>政策有重要修改時，版本日期會更新，你下次登入時會看到新的內容並需要再同意一次。</p>
      </Sec>

      <Sec id="contact" title="聯絡我們">
        <p>對個資有任何問題或要求，請用網站的 <Link href="/contact">聯絡我們</Link>（類型選「個資、帳號」）{CONTACT_EMAIL ? <>，或寄信到 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></> : null}。我們會在 15 天內回覆。</p>
        <p>另見 <Link href="/terms">服務條款</Link>。</p>
      </Sec>
    </DocPage>
  );
}

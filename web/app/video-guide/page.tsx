// v3.0「怎麼拍比賽影片」：給球隊管理員的拍攝說明，和 domain/video.py 的品質門檻對應。
import { DocPage, Sec } from "@/components/doc";

export const metadata = { title: "怎麼拍比賽影片" };

export default function VideoGuidePage() {
  return (
    <DocPage title="怎麼拍比賽影片" version="v3.0" intro={
      <p>影片拍得好，分析才準。網站會先做「品質檢查」：解析度、幀率、長度不合格就不能分析；畫面糊、暗、晃、看不到場地線還是會分析，但結果會標成「可信度低」。</p>
    }>
      <Sec id="must" title="一定要做到（不然不能分析）">
        <ul>
          <li>解析度 <b>1080p（1920×1080）以上</b>：手機相機設定裡選 1080p 或 4K。</li>
          <li>幀率 <b>每秒 25–60 格</b>：選 30 fps 就好。</li>
          <li>長度 <b>1–120 分鐘</b>：上下半場可以分兩個檔案。</li>
        </ul>
      </Sec>

      <Sec id="better" title="做到會更準">
        <ul>
          <li><b>腳架固定，不要拿在手上</b>：鏡頭一晃，分析程式會以為全部的人都在跑。</li>
          <li><b>站高處、在中線旁邊</b>：看台最上排或二樓，能看到整個球場、四個角都在畫面裡最好。</li>
          <li><b>不要放大縮小</b>：整場用同一個畫面，場地線才對得起來。</li>
          <li><b>光線夠</b>：晚上要有球場燈；不要正對太陽拍。</li>
          <li>開飛航模式、插行動電源，記憶體留至少 20 GB。</li>
        </ul>
      </Sec>

      <Sec id="privacy" title="拍之前">
        <ul>
          <li>先跟隊友說要拍、拍來做什麼（分析跑動和傳球），對方同意再拍。</li>
          <li>影片放在球隊管理員自己的 Google Drive，<b>不會上傳到這個網站</b>；網站只記檔名、長度和品質檢查的結果。</li>
          <li>網路上別人的比賽影片有版權，只能自己測試用，不要公開分享。</li>
        </ul>
      </Sec>

      <Sec id="how" title="拍完之後">
        <ol>
          <li>把影片放進自己的 Google Drive。</li>
          <li>到網站的比賽頁按「建立影片分析」，複製連線碼。</li>
          <li>打開 Colab 筆記本，按「全部執行」，填影片路徑、貼上連線碼。比賽頁會自動顯示進度。</li>
        </ol>
      </Sec>
    </DocPage>
  );
}

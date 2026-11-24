// 실시간 베스트 도서 (Vercel 서버 함수)
// - 알라딘 OpenAPI가 종료(2026-10-30)되어, 알라딘 '월간 베스트' 공개 페이지를 서버에서 읽어 분야별 상위 도서를 돌려줍니다.
// - GET /api/best?cat=biz|self|it|hum|lit  → { ym:"2026년 11월", items:[{rank,id,t,a,p,cover,link}] }
// - 6시간 캐시. 이번 달 목록이 아직 적으면(월초) 지난달 목록을 씁니다.
const CATS = {
  biz: [170],        // 경제경영
  self: [336],       // 자기계발
  it: [351],         // 컴퓨터/모바일(IT·AI)
  hum: [656],        // 인문학
  lit: [1, 55889],   // 소설/시/희곡 + 에세이
};
const clean = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

async function monthly(cid, y, m) {
  const url = `https://www.aladin.co.kr/shop/common/wbest.aspx?BestType=MonthlyBest&BranchType=1&CID=${cid}&Year=${y}&Month=${m}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (seobu-reading-mate)" } });
  if (!r.ok) throw new Error("aladin " + r.status);
  const h = await r.text();
  const blocks = h.split('class="ss_book_box"').slice(1);
  return blocks.map((b) => {
    const tm = b.match(/wproduct\.aspx\?ItemId=(\d+)"\s+class="bo3">([^<]+)</);
    if (!tm) return null;
    const au = [...b.matchAll(/AuthorSearch=[^"]*"[^>]*>([^<]+)<\/a>\s*\(지은이\)/g)].slice(0, 2).map((x) => clean(x[1]));
    const a = au.length ? au.join(" · ") : clean((b.match(/AuthorSearch=[^"]*"[^>]*>([^<]+)<\/a>/) || [])[1]);
    const p = clean((b.match(/PublisherSearch=[^>]*>([^<]+)</i) || [])[1]);
    const cv = (b.match(/https:\/\/image\.aladin\.co\.kr\/product\/[^"' ]+?\/cover(?:150|200|500|sum)?\/[^"' ]+?\.(?:jpg|png)/) || [])[0] || "";
    return { id: tm[1], t: clean(tm[2]), a, p, cover: cv.replace(/\/cover(?:150|sum)\//, "/cover200/"), link: "https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=" + tm[1] };
  }).filter(Boolean);
}

module.exports = async (req, res) => {
  const key = String((req.query && req.query.cat) || "biz");
  const cids = CATS[key] || CATS.biz;
  const now = new Date(Date.now() + 9 * 3600 * 1000); // 한국 시간
  let y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  try {
    let lists = await Promise.all(cids.map((c) => monthly(c, y, m)));
    if (lists.every((l) => l.length < 5)) { // 월초: 지난달 목록 사용
      if (--m === 0) { m = 12; y--; }
      lists = await Promise.all(cids.map((c) => monthly(c, y, m)));
    }
    // 여러 분야를 합칠 때는 번갈아 섞고 중복 제거
    const seen = new Set(), items = [];
    for (let i = 0; items.length < 10 && i < 50; i++) for (const l of lists) { const x = l[i]; if (x && !seen.has(x.id) && items.length < 10) { seen.add(x.id); items.push(x); } }
    items.forEach((x, i) => (x.rank = i + 1));
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json({ ym: `${y}년 ${m}월`, src: "알라딘 월간 베스트", items });
  } catch (e) {
    return res.status(200).json({ ym: `${y}년 ${m}월`, items: [], error: "best_failed" });
  }
};

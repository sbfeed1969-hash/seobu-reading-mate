// 책 검색 서버 함수 (Vercel)
// - 검색 키는 Vercel 환경 변수에만 둡니다: ALADIN_TTB_KEY(알라딘 TTB 키) 또는 KAKAO_REST_KEY(카카오 REST API 키)
// - 사내 접속 코드(X-Code 헤더)를 Supabase로 확인한 뒤에만 검색합니다.
// - GET /api/books?q=제목  → 검색 / GET /api/books?best=1 → 알라딘 베스트셀러
const SB_URL = "https://hgmbzxevnlyxnmzvqmep.supabase.co";
const SB_KEY = "sb_publishable_U38MxlFTGyb63yknh1otEA_jKJw7oAr";

const clean = (s) => String(s || "").replace(/<[^>]+>/g, "").trim();
const mapAladin = (i) => ({
  title: clean(i.title).split(" - ")[0],
  author: clean(i.author).replace(/\s*\((지은이|글|엮은이|저자)\)/g, "").replace(/\s*\([^)]*\)/g, "").split(",").slice(0, 3).join(", "),
  publisher: clean(i.publisher),
  cover: i.cover || "",
  isbn: i.isbn13 || i.isbn || "",
  desc: clean(i.description).slice(0, 300),
  link: i.link || "",
  src: "알라딘",
});
const mapKakao = (d) => ({
  title: clean(d.title),
  author: (d.authors || []).slice(0, 3).join(", "),
  publisher: clean(d.publisher),
  cover: d.thumbnail || "",
  isbn: String(d.isbn || "").split(" ").filter(Boolean).pop() || "",
  desc: clean(d.contents).slice(0, 300),
  link: d.url || "",
  src: "카카오",
});
const aladinJson = async (url) => {
  const r = await fetch(url);
  const t = (await r.text()).trim().replace(/;\s*$/, "");
  return JSON.parse(t);
};

async function codeOk(code) {
  if (!code) return false;
  try {
    const r = await fetch(SB_URL + "/rest/v1/rpc/rc_check", {
      method: "POST",
      headers: { apikey: SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: code }),
    });
    return r.ok && (await r.json()) === true;
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  const ALADIN = process.env.ALADIN_TTB_KEY || "";
  const KAKAO = process.env.KAKAO_REST_KEY || "";
  const keys = { aladin: !!ALADIN, kakao: !!KAKAO };
  const code = decodeURIComponent(String(req.headers["x-code"] || ""));
  if (!(await codeOk(code))) return res.status(401).json({ error: "접속 코드가 맞지 않아요." });

  const q = String((req.query && req.query.q) || "").trim().slice(0, 80);
  const best = String((req.query && req.query.best) || "") === "1";
  const base = "https://www.aladin.co.kr/ttb/api/";
  const common = `&MaxResults=20&start=1&SearchTarget=Book&output=js&Version=20131101&Cover=MidBig`;
  let books = [];
  try {
    if (best) {
      if (ALADIN) books = ((await aladinJson(`${base}ItemList.aspx?ttbkey=${ALADIN}&QueryType=Bestseller${common}`)).item || []).map(mapAladin);
    } else if (q) {
      if (ALADIN) books = ((await aladinJson(`${base}ItemSearch.aspx?ttbkey=${ALADIN}&Query=${encodeURIComponent(q)}&QueryType=Keyword${common}`)).item || []).map(mapAladin);
      if (!books.length && KAKAO) {
        const r = await fetch(`https://dapi.kakao.com/v3/search/book?size=20&query=${encodeURIComponent(q)}`, { headers: { Authorization: `KakaoAK ${KAKAO}` } });
        books = ((await r.json()).documents || []).map(mapKakao);
      }
    }
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).json({ books, keys });
  } catch (e) {
    return res.status(200).json({ books: [], keys, error: "search_failed" });
  }
};

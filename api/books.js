// 책 검색 서버 함수 (Vercel)
// - 검색 키는 Vercel 환경 변수에만 둡니다: KAKAO_REST_KEY(카카오 REST API 키)
//   (알라딘 OpenAPI는 2026-10-30 서비스 종료로 사용하지 않습니다.)
// - 사내 접속 코드(X-Code 헤더)를 Supabase로 확인한 뒤에만 검색합니다.
// - GET /api/books?q=제목  → 검색 / GET /api/books?best=1 → 베스트셀러(현재 제공 안 함, 빈 목록)
const SB_URL = "https://hgmbzxevnlyxnmzvqmep.supabase.co";
const SB_KEY = "sb_publishable_U38MxlFTGyb63yknh1otEA_jKJw7oAr";

const clean = (s) => String(s || "").replace(/<[^>]+>/g, "").trim();
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

async function memberOk(auth) {
  if (!/^Bearer\s+\S+/.test(auth || "")) return false;
  try {
    const r = await fetch(SB_URL + "/rest/v1/rpc/rc_me", {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
    });
    const j = r.ok ? await r.json() : null;
    return !!(j && j.name && !j.blocked);
  } catch (e) {
    return false;
  }
}

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
  const KAKAO = (process.env.KAKAO_REST_KEY || "").trim();
  const keys = { aladin: false, kakao: !!KAKAO };
  const code = decodeURIComponent(String(req.headers["x-code"] || ""));
  if (!(await memberOk(req.headers.authorization)) && !(await codeOk(code))) return res.status(401).json({ error: "접속 코드가 맞지 않아요." });

  const q = String((req.query && req.query.q) || "").trim().slice(0, 80);
  let books = [];
  try {
    if (q && KAKAO) {
      const r = await fetch(`https://dapi.kakao.com/v3/search/book?size=20&query=${encodeURIComponent(q)}`, {
        headers: { Authorization: `KakaoAK ${KAKAO}` },
      });
      const j = await r.json();
      if (!r.ok) throw new Error("kakao_error " + r.status + ": " + (j.message || j.msg || j.errorType || ""));
      books = (j.documents || []).filter((d) => d.title).map(mapKakao);
    }
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).json({ books, keys });
  } catch (e) {
    return res.status(200).json({ books: [], keys, error: "search_failed", detail: String((e && e.message) || e).slice(0, 200) });
  }
};

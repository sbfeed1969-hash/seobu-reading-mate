// 카카오 로그인 서버 함수 (Vercel) — 이메일 없이 닉네임만 받습니다(비즈 앱 전환 불필요).
//   GET /api/kakao            → 카카오 로그인 화면으로 이동
//   GET /api/kakao?code=...   → 카카오가 돌려보낸 뒤: 카카오 사용자 확인 → Supabase 로그인 세션 발급 → 사이트로 이동
// 필요한 Vercel 환경 변수:
//   KAKAO_REST_KEY       카카오 REST API 키 (책 검색과 같은 키)
//   KAKAO_CLIENT_SECRET  카카오 로그인 → 보안 → Client Secret
//   SUPABASE_SECRET_KEY  Supabase 비밀 키(sb_secret_… 또는 service_role) — 절대 화면 코드에 넣지 않음
// 카카오 개발자 사이트 Redirect URI: https://seobu-reading-mate.vercel.app/api/kakao
const crypto = require("crypto");
const SB_URL = "https://hgmbzxevnlyxnmzvqmep.supabase.co";
const SB_PUB = "sb_publishable_U38MxlFTGyb63yknh1otEA_jKJw7oAr";
const SITE = "https://seobu-reading-mate.vercel.app";
const REDIRECT = SITE + "/api/kakao";

const back = (res, hash) => { res.statusCode = 302; res.setHeader("Location", SITE + "/#" + hash); res.end(); };
const fail = (res, msg) => back(res, "error=kakao&error_description=" + encodeURIComponent(msg));
const cookie = (req, k) => { const m = String(req.headers.cookie || "").match(new RegExp("(?:^|;\\s*)" + k + "=([^;]+)")); return m ? m[1] : ""; };

function adminHeaders(secret) {
  const h = { apikey: secret, "Content-Type": "application/json" };
  if (secret.startsWith("eyJ")) h.Authorization = "Bearer " + secret; // 예전 형식(service_role JWT)
  return h;
}
async function passwordLogin(email, password) {
  const r = await fetch(SB_URL + "/auth/v1/token?grant_type=password", {
    method: "POST", headers: { apikey: SB_PUB, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.access_token ? j : null;
}

module.exports = async (req, res) => {
  const KEY = (process.env.KAKAO_REST_KEY || "").trim();
  const CS = (process.env.KAKAO_CLIENT_SECRET || "").trim();
  const SECRET = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!KEY || !SECRET) return fail(res, "카카오 로그인 설정이 아직 끝나지 않았어요. 관리자에게 문의해 주세요.");
  const q = req.query || {};

  // 1) 시작: 카카오 로그인 화면으로
  if (!q.code && !q.error) {
    const state = crypto.randomBytes(16).toString("hex");
    res.setHeader("Set-Cookie", `kst=${state}; Path=/api/kakao; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
    res.statusCode = 302;
    res.setHeader("Location", "https://kauth.kakao.com/oauth/authorize?" + new URLSearchParams({
      client_id: KEY, redirect_uri: REDIRECT, response_type: "code", scope: "profile_nickname", state,
    }));
    return res.end();
  }
  if (q.error) return fail(res, q.error === "access_denied" ? "카카오 로그인을 취소했어요." : String(q.error_description || q.error));
  if (!q.state || q.state !== cookie(req, "kst")) return fail(res, "로그인 요청이 만료됐어요. 다시 시도해 주세요.");
  res.setHeader("Set-Cookie", "kst=; Path=/api/kakao; Max-Age=0; HttpOnly; Secure; SameSite=Lax");

  try {
    // 2) 카카오 토큰 → 사용자 정보
    const tr = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: KEY, redirect_uri: REDIRECT, code: String(q.code), ...(CS ? { client_secret: CS } : {}) }),
    });
    const tk = await tr.json();
    if (!tr.ok || !tk.access_token) throw new Error("kakao_token " + (tk.error_code || tk.error || tr.status));
    const ur = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: "Bearer " + tk.access_token } });
    const u = await ur.json();
    if (!ur.ok || !u.id) throw new Error("kakao_user " + ur.status);
    const kid = String(u.id);
    const nick = ((u.properties && u.properties.nickname) || (u.kakao_account && u.kakao_account.profile && u.kakao_account.profile.nickname) || "").slice(0, 20);

    // 3) Supabase 계정(카카오 ID 전용 내부 주소) 로그인 — 없으면 만들기
    const email = `k${kid}@kakao.seobu-reading-mate.vercel.app`;
    const pw = crypto.createHmac("sha256", SECRET).update("kakao:" + kid).digest("base64url");
    let s = await passwordLogin(email, pw);
    if (!s) {
      const H = adminHeaders(SECRET);
      const lr = await fetch(`${SB_URL}/rest/v1/rc_kakao?kakao_id=eq.${encodeURIComponent(kid)}&select=user_id`, { headers: H });
      const link = lr.ok ? (await lr.json())[0] : null;
      if (link) {
        const pr = await fetch(`${SB_URL}/auth/v1/admin/users/${link.user_id}`, { method: "PUT", headers: H, body: JSON.stringify({ password: pw, user_metadata: { name: nick, provider: "kakao" } }) });
        if (!pr.ok) throw new Error("sb_update " + pr.status);
      } else {
        const cr = await fetch(`${SB_URL}/auth/v1/admin/users`, {
          method: "POST", headers: H,
          body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { name: nick, provider: "kakao", kakao_id: kid } }),
        });
        const cu = await cr.json().catch(() => ({}));
        if (!cr.ok || !cu.id) throw new Error("sb_create " + cr.status + " " + (cu.msg || cu.message || ""));
        const ir = await fetch(`${SB_URL}/rest/v1/rc_kakao`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ kakao_id: kid, user_id: cu.id }) });
        if (!ir.ok) throw new Error("sb_link " + ir.status);
      }
      s = await passwordLogin(email, pw);
      if (!s) throw new Error("sb_login");
    }

    // 4) 사이트로 세션 전달 (주소 # 뒤라서 서버 로그에 남지 않음)
    return back(res, new URLSearchParams({
      access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: String(s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600)), expires_in: String(s.expires_in || 3600),
    }).toString());
  } catch (e) {
    console.error("kakao login failed:", String((e && e.message) || e).slice(0, 200));
    return fail(res, "카카오 로그인 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
  }
};

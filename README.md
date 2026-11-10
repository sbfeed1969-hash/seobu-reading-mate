# 서부 리딩 메이트

서부 구성원이 독후감과 카드뉴스로 함께 성장하는 사내 독서 커뮤니티 웹앱입니다.

- **피드**: 이달의 책, 상황별 책 추천, 혁신 기업가 추천 도서, 독후감 카드뉴스·공감·댓글
- **필독서**: Basic · Management · Innovation · Marketing · 축산 · CEO 추천 (알라딘 소개 페이지 연결)
- **메이트**: 월간 우수 메이트 · 연간 최우수 메이트
- **쓰기**: 책 선택 → 카드뉴스 → 독후감, PDF 저장·인쇄

## 구성

| 구분 | 내용 |
|---|---|
| 화면 | `index.html` 한 파일 (빌드 없음, 휴대폰·PC 반응형) |
| 데이터 | Supabase (서울 리전) |
| 배포 | Vercel (이 저장소에 push하면 자동 배포) |

## 데이터와 보안

- 독후감·공감·댓글은 Supabase의 `rc_reviews`, `rc_likes`, `rc_comments` 테이블에 저장됩니다.
- 테이블은 RLS가 켜져 있고 정책이 없어 **브라우저에서 직접 읽거나 쓸 수 없습니다.**
- 앱은 `rc_data`, `rc_review`, `rc_like`, `rc_comment`, `rc_delete` 등 서버 함수로만 접근하며, 모든 함수가 **사내 접속 코드**를 먼저 확인합니다.
- `index.html`에 들어 있는 Supabase 키는 공개용(publishable) 키로, 노출되어도 테이블에 직접 접근할 수 없습니다.
- 접속 코드는 저장소가 아니라 Supabase의 `rc_config` 테이블에만 저장됩니다.

### 접속 코드 바꾸기

Supabase 대시보드 → SQL Editor에서 실행:

```sql
update public.rc_config set value = '새-접속-코드' where key = 'access_code';
```

바꾸면 기존 코드로 접속 중인 사람은 다음 새로고침 때 로그인 화면으로 돌아갑니다.

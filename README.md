# 창의경영고 2026 학사 달력

주신 2026학년도 일정 35건을 달력에 표시하는 정적 웹 페이지입니다. 일정명과 날짜는 전달받은 표기를 유지했습니다. 특히 `부천님오신날`, `은행제`도 원문 그대로 두었습니다. 2월은 받은 일정이 없어서 빈 달력으로 표시됩니다.

## 미리 보기

`index.html`을 열면 기본 달력을 볼 수 있습니다. 브라우저의 보안 정책상 로컬 파일로 JSON을 불러오지 못할 수 있으므로, 폴더를 웹 서버 또는 GitHub Pages에 올려 확인하는 방법을 권장합니다.

## Supabase 로그인 및 공유 저장 설정

교사/관리자 로그인을 실제로 작동시키고 여러 사람이 편집한 일정이 공유되게 하려면 Supabase 프로젝트가 필요합니다.

1. Supabase 프로젝트에서 SQL Editor를 열고 `supabase.sql` 전체를 실행합니다. 이 SQL은 일정 35건과 RLS 정책을 설정합니다.
2. Authentication에서 교사 및 관리자 계정을 초대하거나 생성합니다. 공개 회원가입은 꺼 두세요.
3. 각 계정의 UUID를 확인해 SQL Editor에서 승인된 역할을 부여합니다. 주석 처리된 예시처럼 `viewer`를 `teacher` 또는 `admin`으로 바꿉니다. 역할 변경은 학교 관리자만 SQL Editor에서 합니다.
4. Project URL과 anon/publishable key를 `config.js`의 빈 값에 넣습니다. **service_role 키는 절대로 브라우저 파일에 넣지 마세요.**
5. 페이지를 호스팅하면 로그인 후 교사와 관리자는 달력의 `일정 관리` 모달에서 일정을 추가·수정·삭제할 수 있습니다. 관리자 모달은 승인된 교사와 관리자에게만 열립니다. 서버의 RLS 정책도 쓰기 권한을 같은 역할로 제한합니다.

Supabase를 연결하지 않아도 전달된 정적 일정은 읽을 수 있습니다. 연결 전에는 로그인과 수정 기능이 비활성화됩니다. 연결된 DB의 일정이 비어 있으면 JSON 원본을 대신 보여줍니다.

## GitHub Pages 배포

`outputs` 안의 파일을 새 GitHub 저장소 루트에 올린 뒤 저장소 Settings → Pages에서 `Deploy from a branch`, `main`, `/ (root)`를 선택하세요. 또는 이미 보유한 저장소의 루트로 파일을 옮겨도 됩니다. `index.html`, `style.css`, `app.js`, `events.json`, `config.js`는 같은 폴더에 있어야 합니다.

GitHub Pages: https://eunyool10.github.io/changui-academic-calendar/

저장소: https://github.com/EunYool10/changui-academic-calendar

로그인 및 여러 교직원 간 일정 공유는 Supabase 프로젝트 값을 `config.js`에 설정해야 활성화됩니다.

## 개인정보 안내

페이지 안의 안내문은 계정 이메일 처리, 인증 제공자, 보유 기간, 권리 행사 방법을 설명하는 운영용 초안입니다. 학교의 공식 개인정보 처리방침으로 확정된 문서가 아닙니다. 실제 교직원 계정을 개설하기 전에 담당자가 학교 정책 및 개인정보보호 담당자 검토에 맞춰 문구와 보유 기간을 확정해야 합니다.

## 구성

- `index.html`, `style.css`, `app.js`: 상단 메뉴, 왼쪽 날짜별 일정, 월별 달력, 계절 삽화, 로그인 및 관리 모달
- `calendar.svg`: 달력 모양 파비콘
- `events.json`: 전달된 일정 35건의 정적 원본 데이터
- `config.js`: 공개 Supabase URL과 anon key 설정 위치
- `supabase.sql`: 데이터베이스, 역할 접근 정책, 일정 초기 데이터

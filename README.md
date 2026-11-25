# 창의경영고 학사 달력

창의경영고등학교 학사 일정을 달력으로 보여 주는 정적 웹 페이지입니다. 방문자는 로그인 없이 일정을 보고, 학교가 발급한 관리자 계정으로 로그인한 교직원만 일정을 추가·수정·삭제할 수 있습니다.

- 사이트: https://eunyool10.github.io/changui-academic-calendar/
- 저장소: https://github.com/EunYool10/changui-academic-calendar

## 연도 전환

페이지는 한국 시간 기준으로 올해 학사 일정을 보여 줍니다. 2027년 1월 1일이 되면 제목과 표시가 2027학년도로 바뀌고, 2027년 날짜의 일정이 달력에 나옵니다. 새해 일정은 관리자가 미리 `일정 관리`에서 입력해 두면 됩니다.

## 일정 데이터와 관리자 계정

일정과 관리자 계정은 Firebase 프로젝트 `changui-calendar`에 있습니다.

- 일정: Cloud Firestore(서울 리전) `events` 컬렉션. 누구나 읽을 수 있습니다.
- 관리자: Firebase 인증(이메일/비밀번호). 아이디 `admin`은 로그인할 때 `admin@changui-calendar.firebaseapp.com`으로 바뀌어 전달됩니다.
- 권한: `staff/{uid}` 문서에 `role: "admin"`이 있는 계정만 일정을 쓸 수 있습니다. 이 문서는 사이트에서 만들 수 없고, Firebase 콘솔에서만 추가합니다.
- 보안 규칙은 `firestore.rules`에 있습니다. 바꾼 뒤에는 Firebase에 다시 배포해야 적용됩니다.
- `config.js`의 Firebase 웹 설정 값은 공개 식별자라서 저장소에 있어도 됩니다.

Firestore에 연결할 수 없을 때는 `index.html`에 들어 있는 2026학년도 기본 일정 35건을 대신 보여 줍니다.

### 관리자 추가하기

1. Firebase 콘솔 → Authentication → 사용자 추가에서 `아이디@changui-calendar.firebaseapp.com` 형식으로 계정을 만듭니다.
2. Firestore → `staff` 컬렉션에 문서 ID를 그 계정의 UID로 하고 `role` 필드를 `admin`으로 넣습니다.
3. 임시 비밀번호를 전달하고, 처음 로그인한 뒤 관리 창의 `비밀번호 변경`에서 바꾸게 합니다.

## 구성

- `index.html`, `style.css`, `app.js`: 화면, 달력, 교직원 로그인과 관리 창, 이용 안내
- `art/`: 달마다 바뀌는 머리글 그림(WebP)
- `config.js`: Firebase 웹 설정
- `firestore.rules`: Firestore 보안 규칙
- `events.json`: 2026학년도 일정 원본 35건
- `calendar.svg`: 파비콘

## 개인정보 안내

페이지 안의 `이용 안내·개인정보`는 운영용 안내문입니다. 학교의 공식 개인정보 처리방침이 아니므로, 실제 운영 전에 학교 개인정보 담당자의 검토를 받아 문구와 보유 기간을 확정해야 합니다.

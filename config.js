// Firebase 웹 설정 값은 공개 식별자입니다. 일정 수정 권한은 Firestore 규칙과 staff 문서로만 정해집니다.
// 교직원 아이디는 "아이디@staffDomain" 형태의 로그인 이메일로 바뀌어 Firebase 인증에 전달됩니다.
window.SCHOOL_CALENDAR_CONFIG = {
  firebase: {
    apiKey: "AIzaSyB85-2h92BlIc14zNsGyVnF1FlYwILqaAk",
    authDomain: "changui-calendar.firebaseapp.com",
    projectId: "changui-calendar",
    appId: "1:174475875386:web:974bcaa12a3c2b2122d103"
  },
  staffDomain: "changui-calendar.firebaseapp.com"
};

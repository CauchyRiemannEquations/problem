# 밤샘 문제공장 — 템플릿 파이프라인 v0.1

개념카드(JSONL, repo `aibot` — 읽기 전용 참고자료)를 파라메트릭 문제 생성 템플릿으로 변환하고,
템플릿에서 5지선다 문제를 생성·검증하는 파이프라인.

**핵심 철학: LLM은 문제를 창작하지 않는다.** 템플릿+파라미터로 생성하고 정답은 코드(mathjs, 유리수 정밀 계산)가 계산한다. 정답 100% 보장.

## 범위 (v0.1 + 그림 확장)

- 미적분Ⅰ 34장 (`mijeokbun1_ai_rag_cards_v0_1.jsonl`) → 템플릿 36개 (전부 생성 가능)
  - 극한과 연속 10+2 / 미분 13 / 적분 11
  - 그림이 본질인 유형은 `figure` 스펙으로 SVG를 자동 생성: T-M1-DIF-09-a(도함수 그래프),
    T-M1-LIM-01-b(뚫린 점 극한 읽기), T-M1-LIM-02-b(좌·우극한 읽기)
- 다른 과목은 `templates/<course>/` 디렉토리만 추가하면 동일 파이프라인으로 확장

## 구조

```
factory/
  templates/mijeokbun1/   # 템플릿 JSON (카드 1장당 1파일)
  src/
    schema.ts             # ProblemTemplate / ParamSpec / DistractorSpec / FigureSpec / GeneratedProblem
    engine.ts             # 샘플링·제약검사·평가(Fraction)·하드검증·LaTeX 렌더링
    figure.ts             # 파라미터 기반 결정론적 SVG 그림 생성 (좌표축·곡선·뚫린/닫힌 점·점선·눈금)
    generate.ts           # 생성 CLI
    selftest.ts           # 템플릿당 50회 생성 통과율 + 정답 분포 체크
    review.ts             # 사람 검토용 리포트 생성
  out/                    # 생성된 문제 세트 (jsonl)
  review/                 # 검토 리포트, 실패 템플릿 격리 기록
```

## 사용법

```bash
npm install

# 문제 5개 생성 (난이도 2만)
npm run factory:gen -- --course mijeokbun1 --count 5 --difficulty 2

# 자체 테스트 (템플릿당 50회)
npm run factory:selftest

# 검토 리포트 재생성
npm run factory:review
```

- `--seed N` 을 주면 재현 가능한 생성.
- 출력: `out/{날짜}_{course}.jsonl` — 한 줄 = 한 문제
  (`stem_latex`, `choices`(5개), `answer_index`, `params_used`, `choice_origins`(오답별 mistake_type),
  그림 템플릿이면 `figure_svg`(완성된 SVG 문자열))

## 템플릿 설계 규칙

- 플레이스홀더 `{…}` 안에는 파라미터 이름 또는 파라미터로 이루어진 mathjs 식(`{-(p+q)}`, `{p*q}`)을 쓸 수 있다.
  생성기가 값을 평가해 치환하고 부호를 정규화한다 (`+ -3x` → `- 3x`, `1x` → `x`).
- mathjs로 심볼릭 적분이 안 되는 유형은 역방향 설계: 답(원시함수·교점·극값 위치)을 먼저 정하고 문제를 역으로 구성.
- 파라미터는 정수 위주, 절댓값 10 이하. 답이 깔끔하게 떨어지도록 `constraints`로 제어.
- 하드 검증: 정답≠오답 4개, 오답 상호 중복 없음, 전부 유한 유리수. 위반 시 최대 200회 재샘플, 그래도 실패면 템플릿 flag.
- 그림: `needs_figure: true` + `figure` 스펙이 있으면 생성 시 SVG를 자동 렌더링해 첨부.
  스펙의 모든 수치는 파라미터 기반 mathjs 식이라 그림도 문제와 함께 결정론적으로 생성된다.
  (GeoGebra는 서버용 렌더링 API가 없고 headless 브라우저 + 비상업 라이선스 제약이 있어 채택하지 않음)

## 하지 않는 것

- LLM API 호출로 문제 본문·정답 생성 (LLM 검수는 v0.2에서 별도 단계로 추가 예정)
- 기존 Next.js 앱·개념카드 원본 수정
- 학생 개인정보 관련 처리

/**
 * 밤샘 문제공장 — 템플릿 파이프라인 v0.1 스키마
 *
 * 철학: LLM은 문제를 창작하지 않는다.
 * 템플릿 + 파라미터로 생성하고, 정답은 코드(mathjs)가 계산한다.
 *
 * 원본 개념카드: {course}_ai_rag_cards_v0_1.jsonl (repo aibot, 읽기 전용 참고자료)
 */

export interface ProblemTemplate {
  /** 예: "T-M1-LIM-05-a". 카드 1장당 1~2개 (-a, -b) */
  template_id: string;
  /** 원본 개념카드 id. 예: "M1-LIM-05" */
  card_id: string;
  /** "미적분Ⅰ" */
  course: string;
  unit: string;
  /** 유형명. 예: "0/0꼴 극한 - 인수분해" */
  title: string;
  /** 1=교과서 기본, 2=중간고사, 3=심화 */
  difficulty: 1 | 2 | 3;
  /** v0.1은 5지선다 고정 */
  problem_format: "mcq5";
  /**
   * 문제 본문 (LaTeX). 플레이스홀더는 {…} 형태.
   * 중괄호 안에는 파라미터 이름({p}) 또는 파라미터로 이루어진
   * mathjs 식({p+q}, {-( p+q)}, {p*q})을 쓸 수 있다.
   * 생성기는 값을 평가해 치환하며, 계수 부호를 정규화한다
   * (예: "+ {B}x"에서 B=-3이면 "- 3x"로 렌더링, 1·-1 계수 생략).
   * LaTeX 고유의 중괄호는 이스케이프 없이 쓰되, 플레이스홀더와의 구분은
   * "중괄호 안 내용이 params 이름만으로 구성된 식인가"로 판정한다.
   */
  stem_latex: string;
  /** 각 파라미터의 타입·범위·제약 */
  params: ParamSpec[];
  /**
   * 파라미터 조합 제약. mathjs로 평가 가능한 boolean 식 문자열.
   * 예: "p != q", "isInteger((B - A) / 2)"
   * 전부 true가 될 때까지 재샘플 (최대 200회).
   */
  constraints: string[];
  /** 정답 계산식 (mathjs scope=params로 평가) */
  answer_expr: string;
  /** 오답 4개. 각각 생성식 + 유도하려는 실수 유형 */
  distractors: DistractorSpec[];
  /** 카드 common_mistakes 중 어떤 걸 반영했는지 (원문 인용) */
  source_mistakes: string[];
  /** 그래프/그림 필요 여부. true면 v0.1에서는 생성 대상에서 제외(보류 플래그) */
  needs_figure: boolean;
  /** 이 문제가 미적분Ⅰ 범위인 근거 한 줄 */
  curriculum_check: string;
}

export interface ParamSpec {
  name: string;
  /** int: range 내 정수, rational: 분모 choices 필요, choice: choices에서 선택 */
  type: "int" | "rational" | "choice";
  /** [min, max] (양 끝 포함) */
  range?: [number, number];
  choices?: (number | string)[];
  /** 제외값. 예: 0 제외 → [0] */
  exclude?: number[];
}

export interface DistractorSpec {
  /** 오답 계산식 (mathjs) */
  expr: string;
  /**
   * 어떤 실수를 유도하는지. 카드 common_mistakes 원문 인용,
   * 카드에 없는 보충 오답은 "generic: …" 접두어.
   */
  mistake_type: string;
}

/** 생성기 출력 1문항 (out/*.jsonl의 한 줄) */
export interface GeneratedProblem {
  problem_id: string; // 예: "T-M1-LIM-05-a#0001"
  template_id: string;
  card_id: string;
  course: string;
  unit: string;
  difficulty: 1 | 2 | 3;
  stem_latex: string; // 파라미터 치환·정규화 완료된 본문
  choices: string[]; // 셔플된 보기 5개 (렌더링된 값)
  answer_index: number; // 0~4, 셔플 후 정답 위치
  answer_value: string; // 정답 원값
  params_used: Record<string, number | string>;
  /** 보기별 출처: "answer" 또는 해당 오답의 mistake_type */
  choice_origins: string[];
}

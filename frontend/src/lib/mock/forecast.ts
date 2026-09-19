export interface ForecastPoint {
  week: string;
  cash: number;
  low: number;
  high: number;
}

export interface ForecastScenario {
  id: string;
  label: string;
  trough: number;
  troughWeek: string;
  headroom: number;
  points: ForecastPoint[];
}

const WEEKS = Array.from({ length: 13 }, (_, i) => `W${i + 1}`);

const BASE_CASH = [4820, 4760, 4910, 4680, 4550, 4390, 4210, 4340, 4480, 4620, 4710, 4880, 5040];

function buildScenario(id: string, label: string, adjust: (v: number, i: number) => number, covenantFloor: number): ForecastScenario {
  const points: ForecastPoint[] = WEEKS.map((week, i) => {
    const cash = adjust(BASE_CASH[i], i);
    const band = 60 + i * 8;
    return { week, cash, low: cash - band, high: cash + band };
  });
  const troughPoint = points.reduce((min, p) => (p.cash < min.cash ? p : min), points[0]);
  return {
    id,
    label,
    trough: troughPoint.cash,
    troughWeek: troughPoint.week,
    headroom: troughPoint.cash - covenantFloor,
    points,
  };
}

export const COVENANT_FLOOR = 3800;

export const FORECAST_SCENARIOS: ForecastScenario[] = [
  buildScenario("base", "Base case", (v) => v, COVENANT_FLOOR),
  buildScenario("ar-slip", "AR slips 2 weeks", (v, i) => v - Math.min(i * 22, 260), COVENANT_FLOOR),
  buildScenario("credit-line", "New credit line", (v, i) => v + (i >= 4 ? 500 : 0), COVENANT_FLOOR),
];

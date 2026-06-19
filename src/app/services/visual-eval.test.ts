// visual-eval — 純粋ロジックの TDD。
//
// 不変条件:
//   1. ペアはモック契約起点。実機側にペアが無い状態は realFile=null(= 未実装になる)。
//   2. tokens.png は契約外で除外。
//   3. extractVerdict: JSON フェンスから一致/乖離を復元。
//   4. extractVerdict: parse 不能・verdict 不正は fail-closed = 乖離(沈黙の一致を作らない)。
//   5. extractVerdict: 乖離なのに deviations 空 → 1 件で具体化。
//   6. decideGate: 1 つでも一致以外があれば ok=false。全件一致で ok=true。
import { describe, test, expect } from "bun:test";
import {
  pairScreenshots,
  unimplementedVerdict,
  extractVerdict,
  decideGate,
  renderVerdictTable,
  type ScreenshotPair,
  type StateVerdict,
} from "./visual-eval";

const PAIR: ScreenshotPair = {
  state: "scr-01-inbox.default",
  mockFile: "scr-01-inbox.default.png",
  realFile: "scr-01-inbox.default.real.png",
};

describe("pairScreenshots", () => {
  test("モック契約起点でペアを作り、tokens.png は除外する", () => {
    const pairs = pairScreenshots(
      ["scr-01-inbox.default.png", "tokens.png"],
      ["scr-01-inbox.default.real.png"],
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.state).toBe("scr-01-inbox.default");
    expect(pairs[0]!.realFile).toBe("scr-01-inbox.default.real.png");
  });

  test("実機側にペアが無い状態は realFile=null(= 未実装になる)", () => {
    const pairs = pairScreenshots(["scr-05-confirm.error.png"], []);
    expect(pairs[0]!.realFile).toBeNull();
    expect(unimplementedVerdict(pairs[0]!).verdict).toBe("未実装");
  });
});

describe("extractVerdict", () => {
  test("JSON フェンスから 一致 を復元する", () => {
    const out = 'comparing...\n```json\n{"verdict":"一致","deviations":[]}\n```';
    const v = extractVerdict(PAIR, out);
    expect(v.verdict).toBe("一致");
    expect(v.deviations).toHaveLength(0);
  });

  test("乖離 + deviations を復元する", () => {
    const out =
      '```json\n{"verdict":"乖離","deviations":[{"axis":"日本語水準","detail":"ReviewBlock[] 露出","severity":"high"}]}\n```';
    const v = extractVerdict(PAIR, out);
    expect(v.verdict).toBe("乖離");
    expect(v.deviations[0]!.axis).toBe("日本語水準");
  });

  test("JSON が無い → fail-closed = 乖離", () => {
    const v = extractVerdict(PAIR, "一致だと思います(JSON なし)");
    expect(v.verdict).toBe("乖離");
    expect(v.deviations[0]!.detail).toContain("fail-closed");
  });

  test("verdict 不正値 → fail-closed = 乖離", () => {
    const v = extractVerdict(PAIR, '```json\n{"verdict":"maybe"}\n```');
    expect(v.verdict).toBe("乖離");
  });

  test("乖離なのに deviations 空 → 1 件で具体化する", () => {
    const v = extractVerdict(PAIR, '```json\n{"verdict":"乖離","deviations":[]}\n```');
    expect(v.verdict).toBe("乖離");
    expect(v.deviations).toHaveLength(1);
  });
});

describe("decideGate", () => {
  const mk = (state: string, verdict: StateVerdict["verdict"]): StateVerdict => ({
    state,
    mockFile: `${state}.png`,
    realFile: `${state}.real.png`,
    verdict,
    deviations: [],
  });

  test("全件一致 → ok=true", () => {
    const g = decideGate([mk("a", "一致"), mk("b", "一致")]);
    expect(g.ok).toBe(true);
    expect(g.matched).toBe(2);
  });

  test("1 件でも乖離 → ok=false で blocking に入る", () => {
    const g = decideGate([mk("a", "一致"), mk("b", "乖離")]);
    expect(g.ok).toBe(false);
    expect(g.blocking).toHaveLength(1);
    expect(g.blocking[0]!.state).toBe("b");
  });

  test("空の verdict 群 → ok=false(契約が空なら通さない)", () => {
    expect(decideGate([]).ok).toBe(false);
  });
});

describe("renderVerdictTable", () => {
  test("乖離行は軸: 内容を連結して描画する", () => {
    const table = renderVerdictTable([
      {
        state: "scr-01.default",
        mockFile: "x",
        realFile: "y",
        verdict: "乖離",
        deviations: [{ axis: "構成要素", detail: "ボタン欠落", severity: "high" }],
      },
    ]);
    expect(table).toContain("| scr-01.default | 乖離 | 構成要素: ボタン欠落 |");
  });
});

// 画面ロジックの純関数テスト（予算の抽出・軸の丸め・レンジバーの要素）
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBudget, niceMax, rangeBar } from "../src/views.js";
import { receivedAt, repliedAt } from "../src/time.js";

test("parseBudget: 要約の予算文から万円の数値を取り出す", () => {
  assert.equal(parseBudget("150万円以内"), 150);
  assert.equal(parseBudget("建物本体2,500万円程度"), 2500);
  assert.equal(parseBudget("本工事100万円まで"), 100);
  assert.equal(parseBudget("未記載"), null);
  assert.equal(parseBudget(""), null);
});

test("niceMax: 軸の上限を 1/2/2.5/5×10^n に丸める", () => {
  assert.equal(niceMax(188), 200);
  assert.equal(niceMax(172), 200);
  assert.equal(niceMax(46), 50);
  assert.equal(niceMax(3450), 5000);
  assert.equal(niceMax(230), 250);
});

test("rangeBar: 帯の両端ラベル・予算ピン（帯内/帯外）・aria-label", () => {
  const inBand = rangeBar({ min: 30, max: 150 }, 100);
  assert.match(inBand, /30万/); assert.match(inBand, /150万/);
  assert.match(inBand, /class="pin "/); assert.match(inBand, /ご予算 100 万/);
  assert.match(inBand, /aria-label="目安 30〜150 万円・ご予算 100 万円は帯の中"/);
  const below = rangeBar({ min: 80, max: 150 }, 50);
  assert.match(below, /class="pin out"/); assert.match(below, /帯より下/);
  const none = rangeBar({ min: 30, max: 150 }, null);
  assert.doesNotMatch(none, /class="pin/); assert.match(none, /予算は未記載/);
});

test("repliedAt: 手動の返信は受信からの経過で持ち、時間が経っても所要時間が変わらない（R2 指摘）", () => {
  const item = { received_min_ago: 120 };
  const t0 = 1_000_000_000_000, later = t0 + 6 * 3600_000;
  const rep = { at: t0 };
  const d0 = repliedAt(item, rep, receivedAt(item, t0), t0) - receivedAt(item, t0);
  const d1 = repliedAt(item, rep, receivedAt(item, later), later) - receivedAt(item, later);
  assert.equal(d0, 120 * 60_000); assert.equal(d1, d0);
  const seeded = { minAgo: 30, seeded: true };
  assert.equal(repliedAt(item, seeded, receivedAt(item, t0), t0) - receivedAt(item, t0), 90 * 60_000);
  assert.equal(repliedAt(item, null, 0, t0), null);
});

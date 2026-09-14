import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classify, classifyType, classifyUrgency, lookupBand, checkFields, formatBand } from "../src/classify.js";

const here = new URL(".", import.meta.url);
const rules = JSON.parse(readFileSync(new URL("../data/rules.json", here), "utf8"));

test("工種: 一致語が最も多い行を選ぶ・根拠を返す", () => {
  const r = classifyType(rules, "外壁塗装の見積", "外壁のひび割れとチョーキングが気になります。屋根も見てほしい");
  assert.equal(r.id, "exterior_paint");
  assert.ok(r.matched.includes("外壁"));
  assert.ok(r.score >= 2);
  assert.equal(r.runnerUp && r.runnerUp.id, "roof");
});

test("工種: 一致なしは other（帯なし）", () => {
  const r = classifyType(rules, "ハチの巣", "軒下にハチの巣ができました");
  assert.equal(r.id, "other");
  assert.equal(lookupBand(rules, r.id), null);
  assert.equal(formatBand(null), "該当行なし");
});

test("緊急度: 至急語 > 検討語 > 通常", () => {
  assert.equal(classifyUrgency(rules, "", "雨漏りしています").id, "high");
  assert.equal(classifyUrgency(rules, "", "来年の春ごろ、急がないです").id, "low");
  assert.equal(classifyUrgency(rules, "", "年内に塗装したい").id, "normal");
  // 至急語と検討語が同居したら至急を優先
  assert.equal(classifyUrgency(rules, "", "至急ではないが、相場を知りたい。ただ雨漏りが心配").id, "high");
});

test("NFKC 正規化: 全角英数・大文字も一致する", () => {
  const r = classifyType(rules, "", "ＬＤＫのシステムキッチンを交換したい");
  assert.equal(r.id, "kitchen");
});

test("必須項目: 場所・規模・時期・予算・連絡先の有無", () => {
  const f = checkFields(rules, "", "桜坂市の 2 階建て 32 坪。年内希望。予算 120 万円。090-0000-0001");
  assert.deepEqual(f.missing.map((x) => x.id), []);
  const g = checkFields(rules, "", "キッチン交換したい");
  assert.deepEqual(g.missing.map((x) => x.id), ["place", "size", "timing", "budget", "contact"]);
});

test("手動上書き: 帯は上書き後の行を引用し manual=true", () => {
  const item = { subject: "外壁塗装", body: "外壁のチョーキング" };
  const c = classify(rules, item, { type: "roof" });
  assert.equal(c.type.finalId, "roof");
  assert.equal(c.type.manual, true);
  assert.deepEqual([c.band.min, c.band.max], [30, 150]);
  const d = classify(rules, item, { type: "exterior_paint" });
  assert.equal(d.type.manual, false);
});

test("サンプル 30 件: expected と一致する（事前生成の返信文と整合）", () => {
  let samples;
  try { samples = JSON.parse(readFileSync(new URL("../data/samples.json", here), "utf8")); } catch { return; } // 未作成なら skip
  assert.equal(samples.items.length, 30);
  for (const it of samples.items) {
    const c = classify(rules, it);
    assert.equal(c.type.id, it.expected.type, `${it.id} type`);
    assert.equal(c.urgency.id, it.expected.urgency, `${it.id} urgency`);
    assert.ok(it.reply.length >= 80, `${it.id} reply too short`);
    if (c.band) assert.ok(it.reply.includes(`${c.band.min}`), `${it.id} reply should cite band min`);
  }
  const ids = new Set(samples.items.map((i) => i.id));
  assert.equal(ids.size, 30, "id unique");
});

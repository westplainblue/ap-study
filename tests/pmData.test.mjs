import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { EXAMS, PM_QUESTIONS } from "../src/data/index.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

// 午後問題を追加したときの転記ミス(空欄・ID重複・図の貼り忘れ等)を機械的に検出する。
// 追加手順は docs/pm-authoring.md を参照。

test("午後: IDが一意で、examId/番号と整合している", () => {
  const ids = new Set();
  for (const q of PM_QUESTIONS) {
    assert.ok(!ids.has(q.id), `IDが重複: ${q.id}`);
    ids.add(q.id);
    const expected = `${q.examId}-pm-${String(q.number).padStart(2, "0")}`;
    assert.equal(q.id, expected, `IDの形式が不正: ${q.id}(期待 ${expected})`);
    assert.ok(Number.isInteger(q.number) && q.number >= 1, `問番号が不正: ${q.id}`);
  }
});

test("午後: examIdが収録済みの試験回と一致する", () => {
  const known = new Set(EXAMS.map((e) => e.examId));
  for (const q of PM_QUESTIONS) {
    assert.ok(known.has(q.examId), `未知のexamId: ${q.id} -> ${q.examId}`);
  }
});

test("午後: 必須テキスト項目が空でない", () => {
  for (const q of PM_QUESTIONS) {
    for (const key of ["field", "title"]) {
      assert.ok(
        typeof q[key] === "string" && q[key].trim().length > 0,
        `${q.id}: ${key} が空`
      );
    }
    assert.ok(Array.isArray(q.sections) && q.sections.length > 0, `${q.id}: sections が空`);
    for (const [i, s] of q.sections.entries()) {
      assert.ok(
        typeof s.body === "string" && s.body.trim().length > 0,
        `${q.id}: sections[${i}].body が空`
      );
    }
  }
});

test("午後: 設問と解答例が揃っている", () => {
  for (const q of PM_QUESTIONS) {
    assert.ok(Array.isArray(q.setumon) && q.setumon.length > 0, `${q.id}: setumon が空`);
    const partKeys = new Set();
    for (const s of q.setumon) {
      assert.ok(s.label?.trim(), `${q.id}: 設問のlabelが空`);
      assert.ok(Array.isArray(s.parts) && s.parts.length > 0, `${q.id} ${s.label}: parts が空`);
      for (const p of s.parts) {
        assert.ok(p.label?.trim(), `${q.id} ${s.label}: partのlabelが空`);
        assert.ok(
          typeof p.question === "string" && p.question.trim().length > 0,
          `${q.id} ${s.label} ${p.label}: question が空`
        );
        // 自己採点・AI採点の基準になるため、解答例は必須
        assert.ok(
          typeof p.answer === "string" && p.answer.trim().length > 0,
          `${q.id} ${s.label} ${p.label}: answer(模範解答) が空`
        );
        // 進捗の保存キーは `${設問label}:${partLabel}` なので問題内で一意である必要がある
        const key = `${s.label}:${p.label}`;
        assert.ok(!partKeys.has(key), `${q.id}: 設問キーが重複: ${key}`);
        partKeys.add(key);
      }
    }
  }
});

test("午後: 参照している図表ファイルが実在する", () => {
  for (const q of PM_QUESTIONS) {
    for (const [i, s] of q.sections.entries()) {
      if (!s.figure) continue;
      const fp = path.join(ROOT, "public", s.figure);
      assert.ok(fs.existsSync(fp), `${q.id}: sections[${i}].figure が存在しない: ${s.figure}`);
    }
  }
});

test("午後: JSONファイルとdata/index.tsの取り込みが一致している", () => {
  const dir = path.join(ROOT, "src/data/exams");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".pm.json"));
  const loadedByExam = new Map();
  for (const q of PM_QUESTIONS) {
    loadedByExam.set(q.examId, (loadedByExam.get(q.examId) ?? 0) + 1);
  }
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const inFile = (raw.pm ?? []).length;
    const loaded = loadedByExam.get(raw.examId) ?? 0;
    // 取り込み漏れ(data/index.ts の normalize に渡し忘れ)を検出する
    assert.equal(
      loaded,
      inFile,
      `${f}: ${inFile}問あるがアプリには${loaded}問しか読み込まれていない(src/data/index.ts の取り込みを確認)`
    );
  }
});

/**
 * 评论引用后台补锚测试（临时库，不触碰真实数据）
 * 覆盖：quote-anchor 纯函数（定位/实体/跨段分片/多匹配）+ addComment 集成（补锚落库/降级/划词跳过/批量嵌套）
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { anchorQuoteInHtml } from "../../lib/quote-anchor.js";
import { createDataAccess } from "../../lib/data.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-quote-anchor-test-"));
let data;

before(() => { data = createDataAccess(tmpDir); });
after(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

// ===== 纯函数 =====

test("补锚纯函数：简单段落定位包裹 + anchor 偏移正确", () => {
  const hit = anchorQuoteInHtml("<p>逐条独立校验、单条失败不影响其他。</p>", "单条失败不影响其他", "c1");
  assert.ok(hit);
  assert.equal(
    hit.html,
    '<p>逐条独立校验、<span class="qc-mark" data-quote-comment="c1">单条失败不影响其他</span>。</p>',
  );
  // anchor 偏移与前端 textContent 语义一致
  const text = hit.html.replace(/<[^>]+>/g, "");
  assert.equal(text.slice(hit.anchor.start, hit.anchor.end), "单条失败不影响其他");
});

test("补锚纯函数：实体解码后匹配，原文偏移跨过实体", () => {
  const hit = anchorQuoteInHtml("<p>A&amp;B&nbsp;测试文字</p>", "B 测试", "c2");
  assert.ok(hit, "nbsp 解码为空格后应可匹配");
  assert.equal(
    hit.html,
    '<p>A&amp;<span class="qc-mark" data-quote-comment="c2">B&nbsp;测试</span>文字</p>',
  );
});

test("补锚纯函数：跨 inline 标签产出多个同 ID 分片", () => {
  const hit = anchorQuoteInHtml("<p><strong>加粗</strong>普通文字</p>", "粗普通", "c3");
  assert.ok(hit);
  assert.equal(
    hit.html,
    '<p><strong>加<span class="qc-mark" data-quote-comment="c3">粗</span></strong><span class="qc-mark" data-quote-comment="c3">普通</span>文字</p>',
  );
});

test("补锚纯函数：找不到返回 null / 多匹配取首个 / 空入参返回 null", () => {
  assert.equal(anchorQuoteInHtml("<p>正文</p>", "不存在的文字", "c4"), null);
  const hit = anchorQuoteInHtml("<p>重复重复</p>", "重复", "c5");
  assert.equal(hit.html, '<p><span class="qc-mark" data-quote-comment="c5">重复</span>重复</p>');
  assert.equal(anchorQuoteInHtml("", "x", "c6"), null);
  assert.equal(anchorQuoteInHtml("<p>x</p>", "", "c7"), null);
});

// ===== data 集成 =====

test("补锚集成：addComment 带 quoteText 自动补锚（方案 + 需求）", () => {
  const proj = data.createProject({ name: "补锚测试项目" });
  const pid = proj.id;
  const plan = data.createPlan(pid, "补锚方案", "<p>逐条独立校验、单条失败不影响其他。</p>");
  const c1 = data.addComment(pid, "plan", plan.id, "验证结论一", "单条失败不影响其他");
  assert.ok(c1.quoteAnchor, "应自动生成 quoteAnchor");
  const anchor = JSON.parse(c1.quoteAnchor);
  assert.equal(anchor.start, 7);
  assert.ok(data.getPlan(pid, plan.id).content.includes(`data-quote-comment="${c1.id}"`));

  const req = data.createRequirement(pid, { name: "补锚需求", description: "<p>需求描述文字</p>" });
  const c2 = data.addComment(pid, "requirement", req.id, "需求疑问", "描述文字");
  assert.ok(c2.quoteAnchor);
  const reqRow = data.getRequirement(pid, req.id);
  assert.ok(reqRow.description.includes(`data-quote-comment="${c2.id}"`));
});

test("补锚集成：正文找不到引用文字时降级灰显，正文不变", () => {
  const proj = data.createProject({ name: "补锚降级项目" });
  const pid = proj.id;
  const plan = data.createPlan(pid, "降级方案", "<p>正文</p>");
  const c = data.addComment(pid, "plan", plan.id, "评论", "正文中不存在的引用");
  assert.equal(c.quoteAnchor, null);
  assert.equal(data.getPlan(pid, plan.id).content, "<p>正文</p>", "正文不应被改动");
});

test("补锚集成：前端划词场景（已传 quoteAnchor）跳过自动补锚", () => {
  const proj = data.createProject({ name: "补锚划词项目" });
  const pid = proj.id;
  const plan = data.createPlan(pid, "划词方案", "<p>正文</p>");
  const c = data.addComment(pid, "plan", plan.id, "评论", "正文", JSON.stringify({ start: 0, end: 2 }));
  assert.equal(c.quoteAnchor, JSON.stringify({ start: 0, end: 2 }));
  assert.equal(data.getPlan(pid, plan.id).content, "<p>正文</p>", "正文标注由前端包裹，后端不应重复写入");
});

test("补锚集成：批量两条引用同文字，分片 span 嵌套共存", () => {
  const proj = data.createProject({ name: "补锚批量项目" });
  const pid = proj.id;
  const plan = data.createPlan(pid, "批量补锚方案", "<p>同一段文字</p>");
  const [a, b] = data.addComments(pid, "plan", plan.id, [
    { content: "批一", quoteText: "同一段文字" },
    { content: "批二", quoteText: "同一段文字" },
  ]);
  const content = data.getPlan(pid, plan.id).content;
  assert.ok(content.includes(`data-quote-comment="${a.id}"`));
  assert.ok(content.includes(`data-quote-comment="${b.id}"`));
  // 第二条基于第一条更新后的正文继续匹配，包裹不改变可见文本
  const text = content.replace(/<[^>]+>/g, "");
  assert.equal(text, "同一段文字", "包裹不应改变可见文本");
});

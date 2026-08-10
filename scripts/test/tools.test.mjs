/**
 * neo-project-manage 工具层冒烟测试（node:test）
 *
 * 用法：node --test scripts/test/
 * 说明：临时数据库目录，覆盖 22 个工具的全链路调用（创建→查询→更新→删除+清理）。
 * 工具返回文本中解析 ID 用于后续步骤（比 scenario 的静态 input 更灵活）。
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createDataAccess } from "../../lib/data.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neo-pm-tools-"));
const toolCtx = { dataDir: tmpDir, log: console };

// 动态加载全部工具
const TOOL_FILES = [
  "list-project-sets", "list-projects",
  "create-project-set", "create-project", "create-task", "create-tasks",
  "create-annotation", "create-annotations",
  "get-project", "get-task", "list-tasks", "list-annotations",
  "update-project-set", "update-project", "update-task", "update-annotation",
  "delete-annotations", "delete-tasks", "delete-task", "delete-annotation",
  "delete-project", "delete-project-set",
  // V2.0 新工具
  "list-project-files", "get-project-file",
  "link-project-session", "list-project-sessions", "unlink-project-session",
  "get-project-summaries", "summarize-project", "ask-project",
];
const tools = {};
before(async () => {
  for (const f of TOOL_FILES) {
    const mod = await import(`../../tools/${f}.js`);
    tools[mod.name] = mod.execute;
  }
});
after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// 工具返回文本中解析第一个 ID（8 位短 ID）
function firstId(text) {
  const m = String(text).match(/ID:\s*([a-z0-9]{6,12})/i);
  assert.ok(m, `返回文本应包含 ID，实际: ${String(text).slice(0, 120)}`);
  return m[1];
}

async function run(toolName, input) {
  const res = await tools[toolName](input, toolCtx);
  assert.ok(res?.content?.[0]?.text, `${toolName} 应返回文本内容`);
  return res.content[0].text;
}

test("工具全链路：集→项目→任务→批注→更新→删除+清理", async () => {
  // 1. 只读（无参）
  const sets0 = await run("list_project_sets", {});
  const projs0 = await run("list_projects", {});
  assert.ok(typeof sets0 === "string" && typeof projs0 === "string");

  // 2. 创建项目集
  const setTxt = await run("create_project_set", { name: "AT-工具测试集" });
  const setId = firstId(setTxt);
  assert.match(setTxt, /AT-工具测试集/);

  // 3. 创建项目（入集 + 成员）
  const projTxt = await run("create_project", {
    name: "AT-工具测试项目", projectSetId: setId,
    members: ["测试员"], planStart: "2026-08-01", planEnd: "2026-08-31", status: "进行中",
  });
  const projId = firstId(projTxt);
  assert.match(projTxt, /AT-工具测试项目/);

  // 4. 创建任务（成员 + 日期）
  const taskTxt = await run("create_task", {
    projectId: projId, name: "任务A", assignees: ["测试员"],
    startDate: "2026-08-05", endDate: "2026-08-10",
  });
  const taskId = firstId(taskTxt);

  // 5. 批量创建（含父任务）
  const tasksTxt = await run("create_tasks", {
    projectId: projId,
    tasks: [
      { name: "子任务1", parentTaskId: taskId },
      { name: "子任务2", parentTaskId: taskId },
    ],
  });
  assert.match(tasksTxt, /批量创建/);

  // 6. 批注（单条 + 批量）
  const annTxt = await run("create_annotation", { projectId: projId, taskId, content: "第一条批注" });
  const annId = firstId(annTxt);
  const annsTxt = await run("create_annotations", {
    projectId: projId, taskId,
    items: [{ content: "批量1" }, { content: "批量2" }],
  });
  assert.match(annsTxt, /批量创建/);
  const annIds = [...annsTxt.matchAll(/ID:\s*([a-z0-9]{6,12})/gi)].map((m) => m[1]);
  assert.equal(annIds.length, 2);

  // 7. 查询
  const gotProj = await run("get_project", { id: projId });
  assert.match(gotProj, /AT-工具测试项目/);
  const gotTask = await run("get_task", { taskId });
  assert.match(gotTask, /任务A/);
  const tasksList = await run("list_tasks", { projectId: projId, status: "all" });
  assert.match(tasksList, /任务A/);
  const annsList = await run("list_annotations", { taskId });
  assert.match(annsList, /第一条批注/);

  // 8. 更新
  const upSet = await run("update_project_set", { id: setId, name: "AT-改名集" });
  assert.match(upSet, /AT-改名集/);
  const upProj = await run("update_project", { id: projId, name: "AT-改名项目", status: "已完成" });
  assert.match(upProj, /AT-改名项目/);
  const upTask = await run("update_task", { projectId: projId, id: taskId, name: "AT-改名任务", done: true });
  assert.match(upTask, /AT-改名任务/);
  const upAnn = await run("update_annotation", { taskId, annotationId: annId, content: "改后内容", confirmed: true });
  assert.match(upAnn, /改后内容/);

  // 9. 删除（子任务→批注→任务→项目→集）
  await run("delete_task", { projectId: projId, id: taskId }); // 级联删子任务
  const annsAfter = await run("list_annotations", { taskId });
  assert.ok(annsAfter.includes("暂无可批注") || annsAfter.includes("暂无"), "任务删除后批注级联清理");
  await run("delete_project", { id: projId });
  await run("delete_project_set", { id: setId });

  // 10. 清理后只读为空
  const setsAfter = await run("list_project_sets", {});
  assert.ok(!setsAfter.includes("AT-工具测试集"), "项目集已清理");
});

test("工具错误场景：非法输入应抛错", async () => {
  await assert.rejects(
    () => tools["create_project"]({ name: "" }, toolCtx),
    /不能为空|名称/
  );
  await assert.rejects(
    () => tools["create_task"]({ projectId: "nonexist", name: "X" }, toolCtx),
    /不存在/
  );
  await assert.rejects(
    () => tools["create_annotation"]({ projectId: "nonexist", taskId: "nonexist", content: "x" }, toolCtx),
    /不存在/
  );
});

// ===== V2.0 新工具冒烟（总结/会话/文件/批注 kind） =====
test("V2.0 工具：summarize_project / ask_project / 会话 / 文件资产", async () => {
  // 建集→项目→任务→批注（含 kind）→总结
  const setTxt = await run("create_project_set", { name: "V2工具集" });
  const setId = firstId(setTxt);
  const projTxt = await run("create_project", { name: "V2工具项目", projectSetId: setId });
  const projId = firstId(projTxt);
  const taskTxt = await run("create_task", { projectId: projId, name: "任务V2", endDate: "2026-01-01" });
  const taskId = firstId(taskTxt);
  await run("create_annotation", { projectId: projId, taskId, content: "决策V2", kind: "decision" });
  await run("create_annotation", { projectId: projId, taskId, content: "备注V2", kind: "note" });

  // summarize_project
  const sumTxt = await run("summarize_project", { projectId: projId });
  assert.match(sumTxt, /V2工具项目/);
  assert.match(sumTxt, /风险|延期/);

  // ask_project（all）
  const askTxt = await run("ask_project", { projectId: projId, scope: "all" });
  assert.match(askTxt, /决策V2/);
  assert.match(askTxt, /备注V2/);

  // 会话关联
  const linkTxt = await run("link_project_session", { projectId: projId, sessionId: "sess-v2-test" });
  assert.match(linkTxt, /sess-v2-test/);
  const sessListTxt = await run("list_project_sessions", { projectId: projId });
  assert.match(sessListTxt, /sess-v2-test/);
  const unlinkTxt = await run("unlink_project_session", { projectId: projId, sessionId: "sess-v2-test" });
  assert.match(unlinkTxt, /解除|移除|成功/);

  // 文件资产（登记真实文件）
  const realFile = path.join(tmpDir, "v2-report.PDF");
  fs.writeFileSync(realFile, Buffer.alloc(800));
  // addFile 是 data 层，工具层用登记接口不存在，直接验证文件工具对已有文件（空项目）友好
  const filesTxt = await run("list_project_files", { projectId: projId });
  assert.match(filesTxt, /暂无|清单/);

  // 清理
  await run("delete_project", { id: projId });
  await run("delete_project_set", { id: setId });
});

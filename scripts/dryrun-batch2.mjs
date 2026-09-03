// 批2拆分全量干跑：临时库上逐域调用代表方法，抓 ReferenceError/TypeError
import fs from "fs";
import path from "path";
import os from "os";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nvm-dry-"));
const { createDataAccess } = await import("../lib/data.js");
const data = createDataAccess(dir);

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(["OK", name]);
  } catch (e) {
    results.push(["FAIL", `${name} → ${e.constructor.name}: ${e.message}`]);
  }
}

let pid, tid, tid2, reqId, planId, fid, vid, noteId, annId, qtId, setId, cmtId;
const today = new Date().toISOString().slice(0, 10);
const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const CAP = "E:/honako/work/5-code/hana-plugins/neo-project-manage/docs/capabilities.md";

await step("sets.createProjectSet", () => { setId = data.createProjectSet({ name: "干跑集" }).id; });
await step("projects.createProject", () => { pid = data.createProject({ name: "干跑项目", description: "x", projectSetId: setId }).id; });
await step("projects.listProjects", () => data.listProjects());
await step("projects.getProject", () => data.getProject(pid));
await step("projects.updateProject", () => data.updateProject(pid, { status: "进行中", planStart: today, planEnd: week }));
await step("tasks.createTask", () => { tid = data.createTask(pid, { name: "干跑任务", priority: "P1", startDate: today, endDate: week }).id; });
await step("tasks.createTask 子任务", () => { tid2 = data.createTask(pid, { name: "干跑子任务", parentTaskId: tid }).id; });
await step("tasks.listTasks", () => data.listTasks(pid));
await step("tasks.updateTask 退回", () => data.updateTask(pid, tid, { done: false }));
await step("tasks.getTaskById", () => data.getTaskById(tid));
await step("requirements.createRequirement", () => { reqId = data.createRequirement(pid, { name: "干跑需求" }).id; });
await step("requirements.listRequirements", () => data.listRequirements(pid));
await step("requirements.updateRequirementStatus", () => data.updateRequirementStatus(pid, reqId, "已完成"));
await step("plans.createPlan", () => { planId = data.createPlan(pid, { title: "干跑方案" }).id; });
await step("plans.listPlans", () => data.listPlans(pid));
await step("versions.listVersions", () => data.listVersions(pid, "plan", planId));
await step("plans.addPlanComment 旧接口", () => { cmtId = data.addPlanComment(pid, planId, "干跑评论").id; });
await step("comments.addComment", () => data.addComment(pid, "plan", planId, { author: "冒烟", content: "统一评论" }));
await step("comments.getComments", () => data.getComments(pid, "plan", planId));
await step("comments.listAllComments", () => data.listAllComments(pid));
await step("comments.updateComment", () => data.updateComment(pid, cmtId, "改过的评论"));
await step("verifications.listCategories", () => data.listVerificationCategories(pid));
await step("verifications.createCategory", () => data.createVerificationCategory(pid, "干跑分组"));
await step("verifications.createVerification", () => { vid = data.createVerification(pid, { name: "干跑验证卡", note: "备注", category: "功能验证" }).id; });
await step("verifications.listVerifications", () => data.listVerifications(pid));
await step("verifications.createItem", () => data.createVerificationItem(pid, vid, { content: "检查项1", category: "功能验证" }));
await step("verifications.toggleItem", () => { const items = data.listVerificationItems(pid, vid); if (items.length) data.toggleVerificationItem(pid, items[0].id, true); });
await step("annotations.createAnnotation", () => { annId = data.createAnnotation(pid, tid, { content: "干跑便利贴", kind: "note" }).id; });
await step("annotations.listProjectAnnotations", () => data.getProjectAnnotations(pid));
await step("files.addFile", () => { fid = data.addFile(pid, CAP, null, null).id; });
await step("files.listFiles", () => data.listFiles(pid));
await step("files.deleteFile", () => data.deleteFile(pid, fid));
await step("notes.createNote", () => { noteId = data.createNote(pid, { content: "<p>干跑备注</p>" }).id; });
await step("notes.deleteNote", () => data.deleteNote(pid, noteId));
await step("quick.createQuickTask", () => { qtId = data.createQuickTask({ content: "干跑临时任务" }).id; });
await step("quick.complete", () => data.updateQuickTask(qtId, { action: "complete" }));
await step("quick.convert", () => data.convertQuickTask(qtId, { projectId: pid }));
await step("quick.archive", () => data.archiveQuickTask(qtId));
await step("quick.listArchived", () => data.listArchivedQuickTasks({ page: 1, pageSize: 5 }));
await step("messages.scan", () => data.listMessages({ limit: 3 }));
await step("messages.config", () => data.getMessageConfig());
await step("sessions.list", () => data.listProjectSessions(pid));
await step("calendar.listCalendarTasks", () => data.listCalendarTasks("all", pid));
await step("search.searchAll", () => data.searchAll("干跑"));
await step("search.likeSearch 短词", () => data.searchAll("干"));
await step("audit.listAuditLogs", () => data.listAuditLogs(pid, { limit: 5 }));
await step("insights.summarizeProject", () => data.summarizeProject(pid));
await step("insights.generateReport", () => data.generateReport(pid, { range: "last7days" }));
await step("insights.askProject", () => data.askProject(pid, "risks"));

const fails = results.filter((r) => r[0] === "FAIL");
console.log(`\n干跑结果: ${results.length - fails.length}/${results.length} 通过`);
for (const [, msg] of fails) console.log("FAIL", msg);
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch {}
process.exit(fails.length ? 1 : 0);

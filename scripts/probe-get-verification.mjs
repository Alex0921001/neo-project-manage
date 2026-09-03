import os from "os";
import fs from "fs";
import path from "path";
const { createDataAccess } = await import("../lib/data.js");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npmtest-"));
const data = createDataAccess(dir);
const p = data.createProject({ name: "id测试" });
const v = data.createVerification(p.id, { name: "测试卡" });
const g1 = data.getVerificationGlobal(v.id);
const g2 = data.getVerificationGlobal(v.id.slice(0, 4));
const g3 = data.getVerificationGlobal("zzzz");
if (!g1 || !g2 || g1.id !== v.id || g2.id !== v.id) { console.error("FAIL exact/prefix"); process.exit(1); }
if (g3 !== null) { console.error("FAIL null-case"); process.exit(1); }
console.log("probe-ok |", g1.projectName, "| prefix-hit:", g2.id === v.id, "| progress:", g1.progress.total);

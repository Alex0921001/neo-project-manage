// 查看真实版本快照中表格的 HTML 结构（colgroup/固定宽度嫌疑）
import Database from "better-sqlite3";

const db = new Database("C:/Users/dingpeng/.hanako/plugin-data/neo-project-manage/projects.sqlite", { readonly: true });
const rows = db.prepare("SELECT content FROM versions WHERE content LIKE '%<table%' ORDER BY created_at DESC LIMIT 2").all();
for (const r of rows) {
  const m = r.content.match(/<table[\s\S]{0,500}/);
  if (m) console.log(m[0].slice(0, 500), "\n---");
}
if (!rows.length) console.log("no table versions");
db.close();

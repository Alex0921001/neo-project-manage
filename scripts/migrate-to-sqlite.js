/**
 * 数据迁移：JSON → SQLite
 *
 * 一次性脚本，把现有 projects.json / project-sets.json 搬进 SQLite
 * 旧 JSON 文件保留作冷备份，不删
 *
 * 用法：
 *   cd F:\hanokoMemery\work\5-code\neo-project-manage
 *   node scripts/migrate-to-sqlite.js
 *
 * 已迁移过会自动跳过（schema_meta.version 存在）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, shortId, tx } from "../lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.join(__dirname, "..");

// dataDir 从环境变量或默认 plugin-data 路径
// dev slot 的 dataDir: C:\Users\xxx\.hanako\plugin-data\dev\neo-project-manage
const dataDir = process.env.NPM_PM_DATA_DIR || path.join(PLUGIN_DIR, "plugin-data");

const SETS_FILE = path.join(dataDir, "project-sets.json");
const PROJS_FILE = path.join(dataDir, "projects.json");

function readJSON(fp) {
  try {
    const raw = fs.readFileSync(fp, "utf-8").trim();
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

function migrate() {
  if (!fs.existsSync(SETS_FILE) && !fs.existsSync(PROJS_FILE)) {
    console.log("[migrate] 没找到 JSON 文件，跳过");
    console.log(`  期望路径: ${SETS_FILE}`);
    console.log(`         或 ${PROJS_FILE}`);
    return;
  }

  const sets = readJSON(SETS_FILE);
  const projects = readJSON(PROJS_FILE);
  console.log(`[migrate] 读取到 ${sets.length} 个项目集，${projects.length} 个项目`);

  const db = createDb(dataDir);

  // 已迁移过则跳过
  const existing = db.prepare("SELECT value FROM schema_meta WHERE key = 'migrated_from_json'").get();
  if (existing && existing.value === "true") {
    console.log("[migrate] 已经迁移过（schema_meta.migrated_from_json = true），跳过");
    console.log("  如需重新迁移，删除 projects.sqlite 后重跑");
    db.close();
    return;
  }

  const insertSet = db.prepare(`
    INSERT INTO project_sets (id, name, created_at)
    VALUES (@id, @name, @createdAt)
    ON CONFLICT(id) DO NOTHING
  `);
  const insertProject = db.prepare(`
    INSERT INTO projects (id, name, description, members, plan_start, plan_end, status, project_set_id, created_at)
    VALUES (@id, @name, @description, @members, @planStart, @planEnd, @status, @projectSetId, @createdAt)
    ON CONFLICT(id) DO NOTHING
  `);
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, project_id, parent_task_id, index_num, name, description, done, created_at)
    VALUES (@id, @project_id, @parent_task_id, @index_num, @name, @description, @done, @created_at)
    ON CONFLICT(id) DO NOTHING
  `);
  const insertFile = db.prepare(`
    INSERT INTO files (id, project_id, name, path, uploaded_at)
    VALUES (@id, @project_id, @name, @path, @uploaded_at)
    ON CONFLICT(id) DO NOTHING
  `);
  const insertFileRef = db.prepare(`
    INSERT INTO task_file_refs (task_id, file_id)
    VALUES (?, ?)
    ON CONFLICT DO NOTHING
  `);
  const insertNote = db.prepare(`
    INSERT INTO notes (id, project_id, content, created_at)
    VALUES (@id, @project_id, @content, @created_at)
    ON CONFLICT(id) DO NOTHING
  `);
  const insertAnnotation = db.prepare(`
    INSERT INTO annotations (id, task_id, content, confirmed, confirmed_at, created_at)
    VALUES (@id, @task_id, @content, @confirmed, @confirmed_at, @created_at)
    ON CONFLICT(id) DO NOTHING
  `);

  let setCount = 0, projCount = 0, taskCount = 0, fileCount = 0, fileRefCount = 0, noteCount = 0, annCount = 0;

  db.transaction(() => {
    // 1. 项目集
    for (const s of sets) {
      insertSet.run({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt || new Date().toISOString().slice(0, 10),
      });
      setCount++;
    }

    // 2. 项目 + 项目内嵌套数据
    for (const p of projects) {
      // 转换 createdAt：旧数据可能是 YYYY-MM-DD，存 created_at TEXT
      const projCreatedAt = p.createdAt || new Date().toISOString().slice(0, 10);

      insertProject.run({
        id: p.id,
        name: p.name,
        description: p.description || "",
        members: JSON.stringify(p.members || []),
        planStart: p.planStart || null,
        planEnd: p.planEnd || null,
        // 旧数据可能误存 "已延期"，降级为 raw 状态
        status: p.status === "已延期" ? "进行中" : (p.status || "待开始"),
        projectSetId: p.projectSetId || null,
        createdAt: projCreatedAt,
      });
      projCount++;

      // 3. 文件（项目级）
      for (const f of (p.files || [])) {
        insertFile.run({
          id: f.id,
          project_id: p.id,
          name: f.name,
          path: f.path || null,
          uploaded_at: f.uploadedAt || new Date().toISOString().slice(0, 10),
        });
        fileCount++;
      }

      // 4. 备注
      for (const n of (p.notes || [])) {
        insertNote.run({
          id: n.id,
          project_id: p.id,
          content: n.content,
          created_at: n.createdAt || new Date().toISOString().slice(0, 10),
        });
        noteCount++;
      }

      // 5. 任务（拍平 subtasks 嵌套）
      const tasks = p.tasks || [];
      const taskIndexMap = new Map(); // oldId → new index_num

      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        const topIndex = i; // 顶层任务按数组顺序
        taskIndexMap.set(t.id, topIndex);

        insertTask.run({
          id: t.id,
          project_id: p.id,
          parent_task_id: null,
          index_num: topIndex,
          name: t.name,
          description: t.description || "",
          done: t.done ? 1 : 0,
          created_at: t.createdAt || new Date().toISOString(),
        });
        taskCount++;

        // 任务级批注
        for (const a of (t.annotations || [])) {
          insertAnnotation.run({
            id: a.id,
            task_id: t.id,
            content: a.content,
            confirmed: a.confirmed ? 1 : 0,
            confirmed_at: a.confirmedAt || null,
            created_at: a.createdAt || new Date().toISOString(),
          });
          annCount++;
        }

        // 任务级 fileRefs
        for (const fid of (t.fileRefs || [])) {
          insertFileRef.run(t.id, fid);
          fileRefCount++;
        }

        // 子任务（拍平）
        for (let j = 0; j < (t.subtasks || []).length; j++) {
          const s = t.subtasks[j];
          insertTask.run({
            id: s.id,
            project_id: p.id,
            parent_task_id: t.id,
            index_num: j,
            name: s.name,
            description: s.description || "",
            done: s.done ? 1 : 0,
            created_at: s.createdAt || new Date().toISOString(),
          });
          taskCount++;

          // 子任务级批注
          for (const a of (s.annotations || [])) {
            insertAnnotation.run({
              id: a.id,
              task_id: s.id,
              content: a.content,
              confirmed: a.confirmed ? 1 : 0,
              confirmed_at: a.confirmedAt || null,
              created_at: a.createdAt || new Date().toISOString(),
            });
            annCount++;
          }

          // 子任务级 fileRefs
          for (const fid of (s.fileRefs || [])) {
            insertFileRef.run(s.id, fid);
            fileRefCount++;
          }
        }
      }
    }
  })();

  // 标记已迁移
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('migrated_from_json', 'true')").run();

  db.close();

  console.log(`[migrate] ✅ 迁移完成：`);
  console.log(`  项目集：${setCount}`);
  console.log(`  项目：${projCount}`);
  console.log(`  任务（含子任务）：${taskCount}`);
  console.log(`  文件：${fileCount}`);
  console.log(`  任务-文件关联：${fileRefCount}`);
  console.log(`  备注：${noteCount}`);
  console.log(`  批注：${annCount}`);
  console.log(`\n[migrate] 数据库位置：${path.join(dataDir, "projects.sqlite")}`);
  console.log(`[migrate] JSON 源文件保留作冷备份，未删除。`);
}

try {
  migrate();
} catch (e) {
  console.error("[migrate] ❌ 迁移失败:", e);
  process.exit(1);
}
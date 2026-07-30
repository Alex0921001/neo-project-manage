// 直接调用 Hana 内部路由（需要 surface session，先看看没 session 会怎样）
const url = "http://127.0.0.1:21276/api/plugins/neo-project-manage/api/projects/93d218de/reorder-tasks";

const tryFetch = async (label, opts) => {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    console.log(`[${label}] status=${res.status} content-type=${res.headers.get("content-type")}`);
    console.log(`[${label}] body=${JSON.stringify(text)}`);
    console.log(`[${label}] body len=${text.length}`);
    // 展示前 8 字符
    console.log(`[${label}] body head=${JSON.stringify(text.slice(0, 8))}`);
  } catch (e) {
    console.log(`[${label}] error: ${e.message}`);
  }
};

console.log("=== 测试 1: 不带 session ===");
await tryFetch("no-session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ taskIds: ["a", "b"] }),
});

console.log("\n=== 测试 2: 空 body ===");
await tryFetch("empty-body", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "",
});

console.log("\n=== 测试 3: 无效 JSON body ===");
await tryFetch("bad-json", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{not json}",
});

console.log("\n=== 测试 4: GET（应该 404 或 405）===");
await tryFetch("get", { method: "GET" });
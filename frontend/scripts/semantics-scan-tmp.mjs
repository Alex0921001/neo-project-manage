// 同类语义失效扫描：空对象传参 + URL 拼串残留
import fs from "node:fs";
import path from "node:path";

const root = "E:/honako/work/5-code/hana-plugins/neo-project-manage/frontend/src";
let hits = 0;

(function w(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) w(p);
    else if (/\.(vue|js)$/.test(f) && !f.includes(".test.")) {
      const s = fs.readFileSync(p, "utf8");
      s.split("\n").forEach((l, i) => {
        if (/\w+\(\{\},\s*\{?\s*silent/.test(l) || /\w+\(\{\},\s*undefined/.test(l)) {
          console.log("空对象传参: " + path.relative(root, p) + ":" + (i + 1) + ": " + l.trim().slice(0, 100));
          hits++;
        }
        if (/encodeURIComponent\(.*\)&|_\t=|Date\.now\(\)/.test(l) && l.includes("`")) {
          console.log("URL拼串残留: " + path.relative(root, p) + ":" + (i + 1) + ": " + l.trim().slice(0, 100));
          hits++;
        }
      });
    }
  }
})(root);
console.log("hits:", hits);

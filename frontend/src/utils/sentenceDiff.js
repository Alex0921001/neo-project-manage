/**
 * 方案对比：富文本 → 纯文本 → 句级 diff（V2.1 方案管理对比视图）
 * 返回 { left, right }：left 为 A 视角（same + del 划线），right 为 B 视角（same + add 高亮）
 * 按中文句末标点/换行切句，LCS 最长公共子序列匹配（方案内容句数有限，DP 开销可接受）
 */

/** 富文本/HTML → 纯文本（去标签、压缩空白） */
export function stripHtml(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  return String(text)
    .split(/(?<=[。！？!?；;\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 句级 diff
 * @param {string} a 方案 A 纯文本
 * @param {string} b 方案 B 纯文本
 * @returns {{ left: Array<{text, type: 'same'|'del'}>, right: Array<{text, type: 'same'|'add'}> }}
 */
export function sentenceDiff(a, b) {
  const A = splitSentences(a);
  const B = splitSentences(b);
  const n = A.length;
  const m = B.length;
  // LCS DP（相等句匹配）
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const left = [];
  const right = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      left.push({ text: A[i], type: "same" });
      right.push({ text: B[j], type: "same" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      left.push({ text: A[i], type: "del" });
      i++;
    } else {
      right.push({ text: B[j], type: "add" });
      j++;
    }
  }
  while (i < n) {
    left.push({ text: A[i], type: "del" });
    i++;
  }
  while (j < m) {
    right.push({ text: B[j], type: "add" });
    j++;
  }
  return { left, right };
}

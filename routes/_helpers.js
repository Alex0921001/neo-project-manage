/**
 * 共享 helper
 *
 * 注：旧的 makeProjectsIO / findTask / findSubtask 等已废弃，
 * SQLite 化后所有 IO 都通过 lib/data.js 统一处理。
 * 保留本文件以兼容可能的旧引用，但不再使用。
 */

export function makeProjectsIO(dataDir) {
  // 已废弃：SQLite 化后不需要直接读写 JSON
  return {
    PROJS_PATH: `${dataDir}/projects.sqlite`,
    readProjects: () => [],
    writeProjects: () => {},
  };
}
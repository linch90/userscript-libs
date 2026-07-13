/// <reference path="./types/scriptcat.d.ts" />

/**
 * userscript-libs 公共入口
 *
 * 编译后通过 @require 引入；所有功能挂在全局命名空间 `USL` 上：
 *
 *   // @require https://your.cdn/userscript-libs/dist/index.js
 *   const { gmRequest, gmRequestWithLogin, logger, UnauthorizedError } = USL;
 *   const resp = await gmRequest({ method: "GET", url: "..." });
 *   logger.info("done", resp.status);
 *
 * 在 ScriptCat 后台/定时脚本中同样可用（GM API 与前台一致，无 DOM）。
 *
 * 结构：logger.ts / gmRequest.ts 各以 `namespace USL` 贡献成员，三个文件
 * 均为全局 script（无顶层 import/export），由 tsconfig include 收入同一
 * program 后 TypeScript 自动合并同名 namespace。module:none 下编译产物为
 * 挂载到全局的 IIFE，@require 友好。
 */

/// <reference path="./logger.ts" />
/// <reference path="./gmRequest.ts" />
/// <reference path="./loginFlow.ts" />

// ============================= 全局挂载 =============================
//
// module:none 下 `namespace USL` 编译为顶层 `var USL`，但 @require 引入时
// 管理器可能把库代码包进闭包，导致 `USL` 不暴露到用户脚本作用域。
// 故显式挂到所有可用的全局对象，让用户脚本从任一处都能访问：
//   USL / unsafeWindow.USL / window.USL / globalThis.USL / self.USL
//
// 关键：挂到「所有」而非「第一个」，因为 @require 拼接的脚本作用域
// 与 unsafeWindow / globalThis 在沙箱里可能是不同对象，只挂一处会漏。

(function attachGlobal(this: unknown) {
  const targets: any[] = [];
  try {
    // @ts-ignore unsafeWindow 仅油猴环境存在，grant 后可用
    if (typeof unsafeWindow !== "undefined") targets.push(unsafeWindow);
  } catch {}
  try {
    if (typeof globalThis !== "undefined") targets.push(globalThis as any);
  } catch {}
  try {
    // @ts-ignore self 在 worker/后台可用
    if (typeof self !== "undefined") targets.push(self);
  } catch {}
  try {
    // @ts-ignore window 前台脚本可用
    if (typeof window !== "undefined") targets.push(window as any);
  } catch {}
  try {
    // @ts-ignore 非 strict 模式下的 this 也可作为全局回退
    if (this) targets.push(this as any);
  } catch {}

  for (const t of targets) {
    try {
      if (t && !t.USL) t.USL = USL;
    } catch {
      /* 某些全局对象可能只读或抛错，忽略单个失败 */
    }
  }
})();

/// <reference path="./types/scriptcat.d.ts" />

/**
 * userscript-libs 公共入口
 *
 * 编译后通过 @require 引入；所有功能挂在全局命名空间 `USL` 上：
 *
 *   // @require https://your.cdn/userscript-libs/dist/index.js
 *   const { gmRequest, logger, UnauthorizedError } = USL;
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

// ============================= 全局挂载 =============================
//
// module:none 下 `namespace USL` 编译为全局 `var USL`，理论上已是全局；
// 但油猴脚本本体常被沙箱闭包包裹，需显式挂到 unsafeWindow 才能可靠访问。
// ScriptCat 后台脚本无 unsafeWindow，回退到 globalThis/self。

(function attachGlobal(this: unknown) {
  try {
    let root: any = undefined;
    try {
      // @ts-ignore unsafeWindow 仅油猴环境存在
      if (typeof unsafeWindow !== "undefined") root = unsafeWindow;
    } catch {}
    if (!root) {
      try {
        if (typeof globalThis !== "undefined") root = globalThis as any;
      } catch {}
    }
    if (!root) {
      try {
        // @ts-ignore self 在 worker/WebWorker 后台可用
        if (typeof self !== "undefined") root = self;
      } catch {}
    }
    if (!root) {
      // @ts-ignore 非 strict 模式回退
      root = this;
    }
    if (root) (root as any).USL = USL;
  } catch {
    /* 挂载失败时忽略，namespace 本身仍可能作为全局可见 */
  }
})();

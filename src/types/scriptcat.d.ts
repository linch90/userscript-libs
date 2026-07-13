/**
 * 类型补充声明。
 *
 * 前台 GM API 基础类型来自 `@toil/gm-types/v4`（tsconfig `types` 指向它，
 * 声明全局 `namespace GM`，含 `xmlHttpRequest(details)` 的 callback 风格签名）。
 * 该包存在以下缺口，由本文件补齐：
 *
 * 1. 未声明 `GM.log` / `GM_log`（logger 需要；ScriptCat 后台脚本日志即用 GM_log）。
 * 2. 未声明全局 `unsafeWindow`（油猴脚本访问页面 window 的标准入口）。
 * 3. v4 未声明全局 `GM_info`（logger 探测 scriptHandler 需要）。
 * 4. `GMXmlHttpRequestDetails` / `GMXmlHttpResponse` 是 toil 内部模块类型，
 *    未挂到全局 `GM` 命名空间下；此处通过 `declare global namespace GM`
 *    重导出为 `GM.XhrDetails` / `GM.XhrResponse`，让全局 script（gmRequest.ts）
 *    可直接以裸名引用，无需在 script 文件内 import（import 会破坏 namespace 合并）。
 *
 * 关于 ScriptCat 后台/定时脚本（@background / @crontab）：
 * - 运行在沙盒，无 DOM，但「可使用与油猴一致的 GM API 进行开发」。
 * - `GM_xmlhttpRequest` 与前台完全一致：callback 风格（onload/onerror），
 *   返回 AbortHandle（非 Promise）。不存在单独的 GM.api Promise 入口。
 * - 日志用 GM_log。
 * 故本库无需为后台脚本做特殊分流，统一按前台 GM API 处理即可。
 */

import type {
  GMXmlHttpRequestDetails,
  GMXmlHttpResponse,
} from "@toil/gm-types/types/xmlHttpRequest";

declare global {
  /** 与页面共享的 window；油猴脚本沙箱内访问页面上下文的标准入口 */
  const unsafeWindow: Window & typeof globalThis;

  /** 脚本与运行时信息；v4 未声明全局 GM_info，此处补齐 */
  const GM_info: {
    scriptHandler: string;
    version?: string;
    script?: {
      name?: string;
      version?: string;
      namespace?: string;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };

  function GM_log(...args: unknown[]): void;

  // ---- 声明合并：给 @toil/gm-types/v4 的 namespace GM 追加成员 ----
  namespace GM {
    /** 请求详情类型（重导出自 toil，供全局 script 裸名引用） */
    type XhrDetails = GMXmlHttpRequestDetails;
    /** 响应类型（重导出自 toil，供全局 script 裸名引用） */
    type XhrResponse = GMXmlHttpResponse;

    /** 写入脚本管理器日志面板；ScriptCat 后台脚本日志亦走此入口 */
    function log(...args: unknown[]): void;
    function console(...args: unknown[]): void;
  }
}

export {};

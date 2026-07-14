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

  // ---- ScriptCat / 油猴全局 GM_* 函数（与 GM.* 等价的同步形式） ----
  // ScriptCat 的 GM_addValueChangeListener 返回 number（同步），与
  // @toil/v4 声明的 Promise<string> 不符，故在此独立声明，实现优先用全局形式。

  /** 写入 GM 存储；前台脚本登录成功后用它写登录标记 */
  function GM_setValue(name: string, value: unknown): void;

  /** 读取 GM 存储（同步形式）；favicon 缓存等用它取值，缺失时库内回退默认值。 */
  function GM_getValue<T = unknown>(name: string, defaultValue?: T): T;

  /** 监听指定 key 的值变化（可跨脚本实例/前台后台通信）。返回监听 id（同步）。
   *  后台脚本监听才有 tabid 参数。remote=true 表示来自其它脚本实例。 */
  type GM_ValueChangeListener = (
    name: string,
    oldValue: unknown,
    newValue: unknown,
    remote: boolean,
    tabid?: number
  ) => void;
  function GM_addValueChangeListener(
    name: string,
    listener: GM_ValueChangeListener
  ): number;
  function GM_removeValueChangeListener(listenerId: number): void;

  /** 打开新标签页 */
  type GM_Tab = { close(): void; onclose?: () => void; closed?: boolean };
  function GM_openInTab(
    url: string,
    options?: { active?: boolean; insert?: boolean | number; setBrowser?: boolean }
  ): GM_Tab;
  function GM_openInTab(url: string, loadInBackground: boolean): GM_Tab;

  /** 桌面通知；onclick 在用户点击通知时触发 */
  interface GM_NotificationDetails {
    text: string;
    title?: string;
    image?: string;
    highlight?: boolean;
    timeout?: number;
    onclick?: () => void;
    ondone?: (clicked: boolean) => void;
  }
  function GM_notification(
    details: GM_NotificationDetails,
    ondone?: (clicked: boolean) => void
  ): void;
  function GM_notification(
    text: string,
    title?: string,
    image?: string,
    onclick?: () => void
  ): void;

  // ---- 声明合并：给 @toil/gm-types/v4 的 namespace GM 追加成员 ----
  namespace GM {
    /** 请求详情类型（重导出自 toil，供全局 script 裸名引用） */
    type XhrDetails = GMXmlHttpRequestDetails;
    /** 响应类型（重导出自 toil，供全局 script 裸名引用） */
    type XhrResponse = GMXmlHttpResponse;

    /** 写入脚本管理器日志面板；ScriptCat 后台脚本日志亦走此入口 */
    function log(...args: unknown[]): void;
    function console(...args: unknown[]): void;

    /** 打开新标签页（重导出全局 GM_openInTab 的等价 GM.* 形式） */
    function openInTab(
      url: string,
      options?: { active?: boolean; insert?: boolean | number }
    ): GM_Tab;
  }
}

export {};

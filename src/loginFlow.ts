/// <reference path="./logger.ts" />
/// <reference path="./gmRequest.ts" />
/**
 * ScriptCat 后台/定时脚本专用：401 时引导用户登录后继续后续流程的请求封装。
 *
 * 流程：
 *   1. 发原始请求；非 401 直接返回。
 *   2. 401 → GM.notification 展示「去登录」，用户点击通知 → GM_openInTab 打开登录页。
 *   3. 并行两路等待登录成功（先到即继续，互斥清理）：
 *        路 A：GM_addValueChangeListener(loginSignalKey) 监听到前台脚本
 *              登录成功后 GM_setValue(key, true) 写入的标记。
 *        路 B：轮询重试探测（默认每 10s），发 probeRequest ?? 原始请求，
 *              status !== 401 即视为已登录。兜底——未安装前台脚本时靠它。
 *   4. 任一路成功 → 重试原请求 → resolve 给调用方。
 *   5. loginTimeout（默认 5min）内未成功 → reject LoginTimeoutError。
 *
 * 探测请求走底层 rawXhr（不走 gmRequest 的 401 重试逻辑，避免嵌套触发登录流程）。
 *
 * 注：本文件以 `namespace USL` 贡献成员，与 gmRequest.ts/logger.ts/index.ts
 * 中的同名 namespace 自动合并（全局 script，由 outFile 拼接）。
 */

namespace USL {
  /** 登录超时专用错误类型 */
  export class LoginTimeoutError extends Error {
    constructor(timeoutMs: number) {
      super(`Login flow timed out after ${timeoutMs}ms`);
      this.name = "LoginTimeoutError";
    }
  }

  /**
   * 登录引导请求配置。直接扩展 GM.XhrDetails（与 GmRequestOptions 同形），
   * 不通过继承 GmRequestOptions 以规避跨文件 namespace 内 interface 继承链
   * 在某些 TS 解析路径下退化的边角问题；onUnauthorized/maxRetry 在此重新声明。
   */
  export interface LoginFlowOptions extends GM.XhrDetails {
    /** 登录页 URL；用户点击通知后用 GM_openInTab 打开。必填 */
    loginUrl: string;
    /**
     * 前台脚本登录成功后 GM_setValue 写入的 key。后台监听该 key 变为真值
     * 即视为登录成功。必填；由调用方与前台脚本双方约定。
     */
    loginSignalKey: string;
    /** 专用登录探测请求；不传则用原始请求重试探测。 */
    probeRequest?: GM.XhrDetails;
    /** 轮询间隔 ms，默认 10000 */
    pollInterval?: number;
    /** 登录流程总超时 ms，默认 300000 (5min) */
    loginTimeout?: number;
    /** 通知文案，默认「会话已过期，请重新登录」 */
    notificationText?: string;
    /** 通知标题，默认取 GM_info.script.name 或「登录」 */
    notificationTitle?: string;
    /** 登录按钮文字，默认「去登录 <域名>」（从 loginUrl 提取 hostname） */
    loginLabel?: string;
    /** 是否在 401 时自动打开登录页（不等用户点通知）；默认 false */
    autoOpenLogin?: boolean;
    /**
     * 401 命中时的自定义回调（与 gmRequest 同义）；不传则走默认登录引导流程。
     * 返回 GM.XhrDetails 部分字段会合并到原请求后重试。
     */
    onUnauthorized?: (
      response: GM.XhrResponse,
      retry: (details: GM.XhrDetails) => Promise<GM.XhrResponse>
    ) =>
      | Partial<GM.XhrDetails>
      | false
      | void
      | Promise<Partial<GM.XhrDetails> | false | void>;
    /** 401 回调触发的最大重试次数，默认 1 */
    maxRetry?: number;
  }

  // ---- GM API 适配器：双探 GM_* 全局函数形式 / GM.* 命名空间形式 ----
  // 与 logger/gmRequest 一致：用户 grant 任一形式都能找到可用实现。
  // 注意 GM.* 形式为 Promise 风格，GM_* 为同步；适配器统一封装差异。

  const g: any = typeof globalThis !== "undefined" ? globalThis : ({} as any);
  const gmObj: any = typeof GM !== "undefined" ? (GM as any) : undefined;

  /** 取可用的 notification 调用器（返回 void/Promise，fire-and-forget） */
  function pickNotification():
    | ((details: any, ondone?: (clicked: boolean) => void) => unknown)
    | undefined {
    if (typeof g.GM_notification === "function") return g.GM_notification;
    if (gmObj && typeof gmObj.notification === "function") {
      return (d: any) => gmObj.notification(d);
    }
    return undefined;
  }

  /** 取可用的 openInTab 调用器（返回 Tab/Promise<Tab>，fire-and-forget） */
  function pickOpenInTab():
    | ((url: string, options?: any) => unknown)
    | undefined {
    if (typeof g.GM_openInTab === "function") return g.GM_openInTab;
    if (gmObj && typeof gmObj.openInTab === "function") {
      return (url: string, opts?: any) => gmObj.openInTab(url, opts);
    }
    return undefined;
  }

  /** 取可用的 addValueChangeListener 调用器（同步返回 number 或 Promise<number>） */
  function pickAddValueChangeListener():
    | ((
        name: string,
        listener: (name: string, oldV: unknown, newV: unknown, remote: boolean, tabid?: number) => unknown
      ) => number | Promise<number>)
    | undefined {
    if (typeof g.GM_addValueChangeListener === "function") return g.GM_addValueChangeListener;
    if (gmObj && typeof gmObj.addValueChangeListener === "function") {
      return (name, listener) => gmObj.addValueChangeListener(name, listener);
    }
    return undefined;
  }

  /** 取可用的 removeValueChangeListener 调用器 */
  function pickRemoveValueChangeListener():
    | ((listenerId: number) => void | Promise<void>)
    | undefined {
    if (typeof g.GM_removeValueChangeListener === "function") return g.GM_removeValueChangeListener;
    if (gmObj && typeof gmObj.removeValueChangeListener === "function") {
      return (id: number) => gmObj.removeValueChangeListener(id);
    }
    return undefined;
  }

  /** 通知用户去登录：弹 GM_notification，点击通知打开登录页 */
  function notifyLogin(
    options: LoginFlowOptions
  ): void {
    // 从 loginUrl 提取域名，让用户看到去登录哪个网站
    let domain = options.loginUrl;
    try {
      domain = new URL(options.loginUrl).hostname;
    } catch {}
    const label = options.loginLabel ?? `去登录 ${domain}`;

    // text 默认带域名：Firefox 不支持 buttons 看不到按钮，至少 text 里有域名
    const text =
      options.notificationText ?? `会话已过期，请${label}（${domain}）`;
    let title = options.notificationTitle;
    if (!title) {
      try {
        title = (GM_info?.script?.name as string) || "登录";
      } catch {
        title = "登录";
      }
    }

    const openTab = pickOpenInTab();
    let opened = false; // 防 url 自动打开 + onclick 重复打开
    const open = () => {
      if (opened) return;
      opened = true;
      if (!openTab) {
        logger.error("GM_openInTab unavailable (grant GM_openInTab or GM.openInTab)");
        return;
      }
      try {
        openTab(options.loginUrl, { active: true });
      } catch (e) {
        logger.error("GM_openInTab failed", e);
      }
    };

    if (options.autoOpenLogin) open();

    const notify = pickNotification();
    if (!notify) {
      // notification 不可用，直接打开登录页
      logger.warn("GM_notification unavailable, opening login directly");
      open();
      return;
    }
    try {
      // 双保险打开登录页：
      // - url: 管理器原生「点通知打开关联 url」，Firefox 也可靠（不依赖 onclick 回调）
      // - onclick: Chrome/SC 桌面点通知/按钮时回调，手动 open 兜底
      // - buttons: Chrome 显示「去登录 <域名>」按钮；Firefox 自动忽略
      // opened 标记防止 url 与 onclick 重复打开两个标签页
      notify({
        text,
        title,
        url: options.loginUrl,
        onclick: (event?: any) => {
          // 点通知本体(event.event==="click")或按钮(isButtonClick)都打开
          if (!event || event.event === "click" || event.isButtonClick) {
            open();
          }
        },
        buttons: [{ title: label }],
      });
    } catch (e) {
      logger.warn("GM_notification failed, opening login directly", e);
      open();
    }
  }

  /** 登录超时时弹 notification 提醒用户 */
  function notifyTimeout(options: LoginFlowOptions): void {
    const notify = pickNotification();
    if (!notify) return;
    let domain = options.loginUrl;
    try {
      domain = new URL(options.loginUrl).hostname;
    } catch {}
    let title = "登录超时";
    try {
      title = `${(GM_info?.script?.name as string) || "登录"} - 超时`;
    } catch {}
    try {
      notify({
        title,
        text: `${domain} 在 ${Math.round(
          (options.loginTimeout ?? 300000) / 1000
        )}s 内未完成登录，请重新触发任务`,
        // 超时通知不再带按钮，仅提示
      });
    } catch (e) {
      logger.warn("notify timeout failed", e);
    }
  }

  /**
   * 等待登录成功：valueChange 监听 + 轮询探测并行，先到即解除。
   * 返回的 Promise resolve 后所有监听/定时器已清理。
   * @param options 登录流程配置
   * @param fallbackProbe 探测请求退化值（原始请求的 XhrDetails）
   */
  function waitForLogin(
    options: LoginFlowOptions,
    fallbackProbe: GM.XhrDetails
  ): Promise<void> {
    const pollInterval = options.pollInterval ?? 10000;
    const timeout = options.loginTimeout ?? 300000;
    const probeDetails: GM.XhrDetails = options.probeRequest ?? fallbackProbe;

    return new Promise<void>((resolve, reject) => {
      let done = false;
      let pollTimer: ReturnType<typeof setInterval> | undefined;
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      // listenerId 可能同步拿到(number)或异步(Promise<number>，GM.* 风格)
      let listenerId: number | undefined;
      let listenerIdPromise: Promise<number> | undefined;
      let listenerRegistered = false;

      const removeListener = () => {
        if (listenerId !== undefined) {
          // 同步形式已拿到 id
          const rm = pickRemoveValueChangeListener();
          if (rm) {
            try { rm(listenerId); } catch {}
          }
        } else if (listenerIdPromise) {
          // Promise 形式：id 还没 resolve，等拿到再 remove
          listenerIdPromise.then((id) => {
            const rm = pickRemoveValueChangeListener();
            if (rm) {
              try { rm(id); } catch {}
            }
          });
        }
      };

      const cleanup = () => {
        if (pollTimer) clearInterval(pollTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (listenerRegistered) removeListener();
      };

      const finish = (ok: boolean, err?: Error) => {
        if (done) return;
        done = true;
        cleanup();
        if (ok) {
          resolve();
        } else {
          // 超时提醒：弹 notification 告知登录超时
          notifyTimeout(options);
          reject(err ?? new LoginTimeoutError(timeout));
        }
      };

      // 路 A：监听前台脚本 setValue 写入真值（双探 GM_* / GM.*）
      const addListener = pickAddValueChangeListener();
      if (addListener) {
        try {
          const result = addListener(
            options.loginSignalKey,
            (_name, _oldV, newV, _remote) => {
              if (newV) finish(true);
            }
          );
          if (typeof result === "number") {
            listenerId = result;
            listenerRegistered = true;
          } else if (result && typeof (result as any).then === "function") {
            listenerIdPromise = result as Promise<number>;
            listenerRegistered = true;
            // 若等待 id 期间已 finish，拿到后立即 remove（cleanup 里的 .then 会处理）
          }
        } catch (e) {
          logger.warn("GM_addValueChangeListener failed, rely on polling only", e);
        }
      } else {
        logger.warn("GM_addValueChangeListener unavailable, rely on polling only");
      }

      // 路 B：轮询探测
      const poll = async () => {
        try {
          const resp = await rawXhr(probeDetails);
          if (resp.status !== 401) {
            finish(true);
          }
        } catch (e) {
          // 探测请求本身出错（网络等），不致命，继续轮询
          logger.debug("login probe error (will retry)", e);
        }
      };
      // 立即探测一次，再按间隔轮询
      poll();
      pollTimer = setInterval(poll, pollInterval);

      // 超时
      timeoutTimer = setTimeout(() => finish(false), timeout);
    });
  }

  /**
   * 带登录引导的请求：401 时弹通知引导用户登录，登录成功后重试原请求。
   * ScriptCat 后台/定时脚本专用（前台也可用）。登录成功检测：前台脚本
   * GM_setValue(loginSignalKey, true) 触发监听 + 轮询探测，任一即解除。
   * 超时抛 LoginTimeoutError。
   *
   * @param {USLLoginFlowOptions} options - 请求配置（含 url/method + 登录流程字段）
   * @returns {Promise<GMTypes.XHRResponse>} 登录后重试成功的响应
   * @throws {USL.LoginTimeoutError} loginTimeout 内未登录成功
   * @example
   * const resp = await USL.gmRequestWithLogin({
   *   method: "GET",
   *   url: "https://api.example.com/me",
   *   loginUrl: "https://example.com/login",
   *   loginSignalKey: "myapp:logged-in",
   *   probeRequest: { method: "GET", url: "https://api.example.com/ping" },
   * });
   */
  export async function gmRequestWithLogin(
    options: LoginFlowOptions
  ): Promise<GM.XhrResponse> {
    // 剥离库控制字段（与 gmRequest 一致），先发原始请求探测是否 401。
    // 显式标注为 GM.XhrDetails：跨文件 namespace 内 interface 继承链对
    // GM.XhrDetails 字段在某些 TS 解析路径下会退化，此处用类型断言锁定。
    const { onUnauthorized, maxRetry, ...rest } = options;
    const xhrDetails: GM.XhrDetails = rest as GM.XhrDetails;

    let resp: GM.XhrResponse;
    try {
      resp = await rawXhr(xhrDetails);
    } catch (e) {
      throw e;
    }

    if (resp.status !== 401) {
      return resp;
    }

    // 401：引导登录
    logger.warn(`gmRequestWithLogin 401 on ${xhrDetails.method || "GET"} ${xhrDetails.url}, guiding login`);
    notifyLogin(options);

    // 等待登录成功（valueChange + 轮询），超时抛 LoginTimeoutError
    await waitForLogin(options, xhrDetails);

    // 登录成功后重试原请求
    return rawXhr(xhrDetails);
  }
}

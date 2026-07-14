// ============================================================
// userscript-libs (USL) 类型声明 —— 追加到 ScriptCat 编辑器
// 「设置 → 编辑器类型定义」输入框现有内容之后。
// 之后所有用户脚本里 USL.xxx 即有补全与类型检查，无需在每个脚本粘贴。
// 对齐版本：linch90/userscript-libs@v0.1.4
// 依赖：输入框已有 GMTypes.XHRDetails / GMTypes.XHRResponse（ScriptCat 自带）
// ============================================================

/**
 * gmRequest 请求配置：在 GMTypes.XHRDetails 基础上扩展库控制字段。
 * url 必填；method 不填时库按 GET 处理。
 */
declare interface USLGmRequestOptions extends GMTypes.XHRDetails {
  /**
   * 401 命中时的回调。
   * - 返回 Partial<GMTypes.XHRDetails>：合并到原请求后重试（适合刷新 token 后重发）
   * - 返回 false / void：以 UnauthorizedError reject
   * - 抛错：以该错误 reject
   */
  onUnauthorized?: (
    response: GMTypes.XHRResponse,
    retry: (details: GMTypes.XHRDetails) => Promise<GMTypes.XHRResponse>
  ) =>
    | Partial<GMTypes.XHRDetails>
    | false
    | void
    | Promise<Partial<GMTypes.XHRDetails> | false | void>;

  /** 401 回调触发的最大重试次数，默认 1（避免无限循环） */
  maxRetry?: number;
}

/** 跨管理器日志器 */
declare interface USLLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** 创建带前缀的子 logger，日志前缀会带上 [tag] */
  tag(tag: string): USLLogger;
}

/**
 * gmRequestWithLogin 配置：401 引导登录后继续流程。
 * ScriptCat 后台/定时脚本专用（前台也可用）。
 */
declare interface USLLoginFlowOptions extends GMTypes.XHRDetails {
  /** 登录页 URL；用户点击通知后用 GM_openInTab 打开。必填 */
  loginUrl: string;
  /** 前台脚本登录成功后 GM_setValue 写入的 key。后台监听该 key 变为真值即视为登录成功。必填 */
  loginSignalKey: string;
  /** 专用登录探测请求；不传则用原始请求重试探测 */
  probeRequest?: GMTypes.XHRDetails;
  /** 轮询间隔 ms，默认 10000 */
  pollInterval?: number;
  /** 登录流程总超时 ms，默认 300000 (5min) */
  loginTimeout?: number;
  /** 通知文案，默认「会话已过期，请重新登录（<域名>）」 */
  notificationText?: string;
  /** 通知标题，默认取 GM_info.script.name 或「登录」 */
  notificationTitle?: string;
  /** 登录按钮文字，默认「去登录 <域名>」（从 loginUrl 提取 hostname） */
  loginLabel?: string;
  /** 401 时自动打开登录页（不等用户点通知），默认 false */
  autoOpenLogin?: boolean;
  /** 401 自定义回调（与 gmRequest 同义）；不传则走默认登录引导流程 */
  onUnauthorized?: (
    response: GMTypes.XHRResponse,
    retry: (details: GMTypes.XHRDetails) => Promise<GMTypes.XHRResponse>
  ) =>
    | Partial<GMTypes.XHRDetails>
    | false
    | void
    | Promise<Partial<GMTypes.XHRDetails> | false | void>;
  /** 401 回调触发的最大重试次数，默认 1 */
  maxRetry?: number;
}

/** message 提示类型 */
declare type USLMessageType = "success" | "error" | "warning" | "info";

/** message 提示配置 */
declare interface USLMessageOptions {
  /** 显示时长 ms，默认 3000；设 0 则不自动消失 */
  duration?: number;
}

/**
 * 轻量页面内 message 提示（类似 ElMessage）。
 * 前台脚本注入顶部居中浮层；后台/定时脚本无 DOM 时优先降级 GM_notification，
 * 不可用再降级走 logger。
 */
declare interface USLMessageApi {
  success(text: string, options?: USLMessageOptions): void;
  error(text: string, options?: USLMessageOptions): void;
  warning(text: string, options?: USLMessageOptions): void;
  info(text: string, options?: USLMessageOptions): void;
  /** 自定义类型显示 */
  show(text: string, type: USLMessageType, options?: USLMessageOptions): void;
}

/** 401 专用错误类型，便于调用方 catch 区分 */
declare class USLUnauthorizedError extends Error {
  readonly response: GMTypes.XHRResponse;
}

/** 登录流程超时错误类型 */
declare class USLLoginTimeoutError extends Error {}

/**
 * userscript-libs 全局对象。由 @require 的 index.js 注入到全局。
 * ScriptCat 后台/定时脚本与前台脚本均可用（GM API 与前台一致，后台无 DOM）。
 */
declare const USL: {
  /**
   * 发起 GM 请求，返回 Promise<GMTypes.XHRResponse>。
   * 401 时按 onUnauthorized 处理（返回部分字段重试 / false 抛 UnauthorizedError）。
   */
  gmRequest(options: USLGmRequestOptions): Promise<GMTypes.XHRResponse>;

  /** 发起 GM 请求并将 responseText 按 JSON 解析返回。 */
  gmRequestJson<T = unknown>(options: USLGmRequestOptions): Promise<T>;

  /** 底层 xhr（不走 401 重试逻辑），供探测等场景复用。 */
  rawXhr(details: GMTypes.XHRDetails): Promise<GMTypes.XHRResponse>;

  /** 默认 logger（无前缀）。ScriptCat 下走 GM.log/GM_log，其它走 console。 */
  readonly logger: USLLogger;

  /** 是否运行在 ScriptCat 环境下。 */
  isScriptCat(): boolean;

  /** 轻量页面内 message 提示。前台注入浮层；无 DOM 时降级走 logger。 */
  readonly message: USLMessageApi;

  /**
   * 带登录引导的请求：401 时弹通知引导用户登录，登录成功后重试原请求。
   * 登录成功检测：前台 GM_setValue(loginSignalKey,true) 触发监听 + 轮询探测，任一即解除。
   * 超时抛 USLLoginTimeoutError。
   * @throws {USLLoginTimeoutError} loginTimeout 内未登录成功
   */
  gmRequestWithLogin(options: USLLoginFlowOptions): Promise<GMTypes.XHRResponse>;

  /** 带登录引导的请求并将 responseText 按 JSON 解析返回（gmRequestWithLogin + JSON.parse）。 */
  gmRequestJsonWithLogin<T = unknown>(options: USLLoginFlowOptions): Promise<T>;

  /** 401 专用错误类构造器 */
  readonly UnauthorizedError: typeof USLUnauthorizedError;
  /** 登录超时错误类构造器 */
  readonly LoginTimeoutError: typeof USLLoginTimeoutError;
};

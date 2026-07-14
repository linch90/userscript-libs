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
  /** 通知图标 URL，默认用 getFavicon(loginUrl 域名) 取 data URL（最多等 8s，超时不带图标）。显式传入则直接用。 */
  notificationImage?: string;
  /** 登录按钮文字，默认「去登录 <域名>」（从 loginUrl 提取 hostname） */
  loginLabel?: string;
  /** 401 时自动打开登录页（不等用户点通知），默认 false */
  autoOpenLogin?: boolean;
  /**
   * 判定响应是否「需要登录」。默认仅 status===401；站点未登录时返回别的形态
   * （如 302 重定向到 /login、200 登录页 HTML）时，传此回调扩展判定：
   *   isUnauthorized: (r) => r.status === 401 || (r.finalUrl || "").includes("/login")
   * 命中即走登录引导，登录成功后重试；该判定同时用于登录成功探测。
   */
  isUnauthorized?: (response: GMTypes.XHRResponse) => boolean;
  /** 401（或 isUnauthorized）自定义回调（与 gmRequest 同义）；不传则走默认登录引导流程 */
  onUnauthorized?: (
    response: GMTypes.XHRResponse,
    retry: (details: GMTypes.XHRDetails) => Promise<GMTypes.XHRResponse>
  ) =>
    | Partial<GMTypes.XHRDetails>
    | false
    | void
    | Promise<Partial<GMTypes.XHRDetails> | false | void>;
  /** 401（或 isUnauthorized）回调触发的最大重试次数，默认 1 */
  maxRetry?: number;
}

/** message 提示类型 */
declare type USLMessageType = "success" | "error" | "warning" | "info";

/** message 提示配置 */
declare interface USLMessageOptions {
  /** 显示时长 ms，默认 3000；设 0 则不自动消失（仅 DOM 浮层生效） */
  duration?: number;
  /** 标题：GM_notification 降级时显示（DOM 浮层忽略）。默认取类型中文或 GM_info.script.name */
  title?: string;
  /** 图标 URL：GM_notification 降级时显示（DOM 浮层忽略） */
  image?: string;
  /** 通知点击回调：GM_notification 降级时生效（DOM 浮层忽略） */
  onclick?: () => void;
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

/** getFaviconDetail 返回值：dataUrl 是图标 data URL，isReal 区分真实站标与降级默认图 */
declare interface USLFaviconDetail {
  /** 图标 data URL（真实站标或默认 SVG） */
  dataUrl: string;
  /** true=真实站标；false=策略一/二都失败后生成的默认字母图标 */
  isReal: boolean;
  /** 原图标远程 URL（命中真站标时为 favicon.ico 或 link href；降级字母图无此字段）。
   *  notifyLogin 在 dataURL 不适合通知（jpeg/过大）时退回此远程 URL。 */
  sourceUrl?: string;
}

/** 401 专用错误类型，便于调用方 catch 区分 */
declare class USLUnauthorizedError extends Error {
  readonly response: GMTypes.XHRResponse;
}

/** 登录流程超时错误类型 */
declare class USLLoginTimeoutError extends Error {
  readonly timeoutMs: number;
}

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

  /**
   * 获取站点 favicon（data URL）。前台脚本专用（依赖 DOMParser/FileReader/btoa）。
   * 双策略逐级降级（根 favicon.ico → HTML 解析 → 默认首字母 SVG），
   * 结果带 30 天 GM 存储缓存，永不 reject（失败返回默认图标）。
   * @param domain 站点域名（hostname），如 "example.com"
   */
  getFavicon(domain: string): Promise<string>;

  /**
   * 获取站点 favicon，返回带「是否真实站标」标记。
   * isReal=true 表示策略一/二成功拿到真实站标；false 表示降级生成的默认字母图。
   * 缓存 key 恒等于入参 domain（不设父域回退，回退由调用方组织），永不 reject。
   */
  getFaviconDetail(domain: string): Promise<USLFaviconDetail>;

  /** 生成基于域名首字母的默认 SVG 图标，返回 data URL。 */
  generateDefaultIcon(domain: string): string;

  /** 将图片 URL 转为 data:image（带超时与大小校验，无效图片会 reject）。 */
  urlToDataUrl(imageUrl: string, timeout?: number): Promise<string>;

  /** 只读取目标网址 HTML 前 maxBytes 字节（onprogress 提前 abort），用于快速提取图标。 */
  fetchHtmlPartial(url: string, maxBytes?: number, timeout?: number): Promise<string>;

  /** 从 HTML 片段按优先级解析图标 URL（apple-touch-icon > icon > shortcut icon），未找到返回 null。 */
  parseIconFromHtml(html: string, baseUrl: string): string | null;

  /** 401 专用错误类构造器 */
  readonly UnauthorizedError: typeof USLUnauthorizedError;
  /** 登录超时错误类构造器 */
  readonly LoginTimeoutError: typeof USLLoginTimeoutError;
};

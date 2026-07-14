/**
 * 轻量页面内 message 提示（类似 ElMessage）。
 *
 * - 前台脚本（有可视 DOM）：注入顶部居中的浮层容器 + style，按类型显示彩色提示，
 *   duration（默认 3000ms）后自动淡出消失，多条垂直堆叠。
 * - 后台/定时脚本（ScriptCat @background/@crontab，background page DOM 不可见）：
 *   优先降级 GM_notification（桌面通知），不可用再降级 logger
 *   （GM 日志面板/console），不报错。由 GM_info.script.header 含
 *   @background/@crontab 判定后台脚本。
 *
 * 用法：
 *   USL.message.success("保存成功");
 *   USL.message.error("出错了");
 *   USL.message.warning("注意");
 *   USL.message.info("提示");
 *   USL.message.success("自定义时长", { duration: 5000 });
 *
 * 注：本文件以 `namespace USL` 贡献成员，与其它源文件同名 namespace 自动合并。
 */

namespace USL {
  export type MessageType = "success" | "error" | "warning" | "info";

  export interface MessageOptions {
    /** 显示时长 ms，默认 3000；设 0 则不自动消失（仅 DOM 浮层生效） */
    duration?: number;
    /** 标题：GM_notification 降级时显示（DOM 浮层忽略）。默认取类型中文或 GM_info.script.name */
    title?: string;
    /** 图标 URL：GM_notification 降级时显示（DOM 浮层忽略） */
    image?: string;
    /** 通知点击回调：GM_notification 降级时生效（DOM 浮层忽略） */
    onclick?: () => void;
  }

  const CONTAINER_ID = "usl-message-container";
  const STYLE_ID = "usl-message-style";
  const STYLE_CSS = `
#${CONTAINER_ID} {
  position: fixed !important; top: 20px !important; left: 50% !important;
  transform: translateX(-50%) !important;
  display: flex !important; flex-direction: column !important;
  align-items: center !important;
  z-index: 999999 !important;
  pointer-events: none !important;
}
#${CONTAINER_ID} > .usl-msg {
  margin: 8px 0 !important; padding: 10px 20px !important;
  color: #fff !important; border-radius: 4px !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
  font-size: 14px !important; line-height: 1.5 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  animation: uslMsgFadeIn 0.3s !important;
  transition: opacity 0.3s, transform 0.3s !important;
  max-width: 80vw !important; word-break: break-word !important;
  pointer-events: auto !important;
}
#${CONTAINER_ID} > .usl-msg-success { background-color: #52c41a !important; }
#${CONTAINER_ID} > .usl-msg-error   { background-color: #ff4d4f !important; }
#${CONTAINER_ID} > .usl-msg-warning { background-color: #faad14 !important; }
#${CONTAINER_ID} > .usl-msg-info    { background-color: #1890ff !important; }
@keyframes uslMsgFadeIn {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

  /** 是否为 ScriptCat 后台/定时脚本。
   *  通过 GM_info.script.header 中的 @background / @crontab 元数据判定。
   *  后台/定时脚本运行在隐藏 background page，DOM 不可见。 */
  function isBackgroundScript(): boolean {
    try {
      if (typeof GM_info === "undefined") return false;
      if ((GM_info as any)?.scriptHandler !== "ScriptCat") return false;
      const header: string = (GM_info as any)?.script?.header ?? "";
      // 词边界匹配，避免 @background-xxx 之类误匹配
      return /@background\b/.test(header) || /@crontab\b/.test(header);
    } catch {
      return false;
    }
  }

  /** 是否有可用的可视 DOM（前台脚本）。
   *  ScriptCat 后台/定时脚本运行在隐藏 background page，document.body 存在
   *  但页面不可见，注入浮层用户看不到，故排除。 */
  function hasDom(): boolean {
    try {
      if (typeof document === "undefined" || !document.body) return false;
      if (isBackgroundScript()) return false;
      return true;
    } catch {
      return false;
    }
  }

  /** 确保样式已注入（仅一次） */
  let styleInjected = false;
  function ensureStyle(): void {
    if (styleInjected || !hasDom()) return;
    if (document.getElementById(STYLE_ID)) {
      styleInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);
    styleInjected = true;
  }

  /** 取/创建容器 */
  function ensureContainer(): HTMLElement | null {
    if (!hasDom()) return null;
    ensureStyle();
    let el = document.getElementById(CONTAINER_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = CONTAINER_ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function showDom(
    text: string,
    type: MessageType,
    duration: number
  ): void {
    const container = ensureContainer();
    if (!container) return;
    const p = document.createElement("div");
    p.className = `usl-msg usl-msg-${type}`;
    p.textContent = text;
    container.appendChild(p);

    const remove = () => {
      if (p.parentNode) {
        p.style.opacity = "0";
        p.style.transform = "translateY(-12px)";
        setTimeout(() => p.remove(), 300);
      }
    };

    if (duration > 0) {
      setTimeout(remove, duration);
    }
  }

  /** 无 DOM 时的降级：优先 GM_notification（桌面通知），其次 logger */
  const gMsg: any = typeof globalThis !== "undefined" ? globalThis : ({} as any);
  const gmMsgObj: any = typeof GM !== "undefined" ? (GM as any) : undefined;

  function pickNotify():
    | ((details: any, ondone?: (clicked: boolean) => void) => unknown)
    | undefined {
    if (typeof gMsg.GM_notification === "function") return gMsg.GM_notification;
    if (gmMsgObj && typeof gmMsgObj.notification === "function") {
      return (d: any) => gmMsgObj.notification(d);
    }
    return undefined;
  }

  const TYPE_LEVEL: Record<MessageType, "debug" | "info" | "warn" | "error"> = {
    success: "info",
    error: "error",
    warning: "warn",
    info: "info",
  };

  const TYPE_TITLE: Record<MessageType, string> = {
    success: "成功",
    error: "错误",
    warning: "警告",
    info: "提示",
  };

  function showFallback(text: string, type: MessageType, options?: MessageOptions): void {
    // 优先桌面通知（后台脚本常见，比 logger 更直观）
    const notify = pickNotify();
    if (notify) {
      // 默认标题：options.title > GM_info.script.name > 类型中文
      let title = options?.title;
      if (!title) {
        try {
          title = (GM_info?.script?.name as string) || TYPE_TITLE[type];
        } catch {
          title = TYPE_TITLE[type];
        }
      }
      const details: any = {
        title,
        text,
        highlight: type === "error",
      };
      if (options?.image) details.image = options.image;
      if (options?.onclick) details.onclick = options.onclick;
      try {
        notify(details);
        return;
      } catch (e) {
        logger.debug("message fallback notification failed, use logger", e);
      }
    }
    // 最终降级 logger（带 title 前缀若有）
    const prefix = options?.title ? `[${options.title}] ` : "";
    logger[TYPE_LEVEL[type]](`${prefix}[message:${type}] ${text}`);
  }

  export interface MessageApi {
    success(text: string, options?: MessageOptions): void;
    error(text: string, options?: MessageOptions): void;
    warning(text: string, options?: MessageOptions): void;
    info(text: string, options?: MessageOptions): void;
    /** 自定义类型：show(text, type, options) */
    show(text: string, type: MessageType, options?: MessageOptions): void;
  }

  function show(text: string, type: MessageType, options?: MessageOptions): void {
    const duration = options?.duration ?? 3000;
    if (hasDom()) {
      showDom(text, type, duration);
    } else {
      showFallback(text, type, options);
    }
  }

  export const message: MessageApi = {
    success: (text, options) => show(text, "success", options),
    error: (text, options) => show(text, "error", options),
    warning: (text, options) => show(text, "warning", options),
    info: (text, options) => show(text, "info", options),
    show,
  };
}

/**
 * 轻量页面内 message 提示（类似 ElMessage）。
 *
 * - 前台脚本（有 DOM）：注入顶部居中的浮层容器 + style，按类型显示彩色提示，
 *   duration（默认 3000ms）后自动淡出消失，多条垂直堆叠。
 * - 后台/定时脚本（无 DOM）：优先降级 GM_notification（桌面通知），
 *   不可用再降级 logger（GM 日志面板/console），不报错。
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
    /** 显示时长 ms，默认 3000；设 0 则不自动消失（需手动 message.dismiss） */
    duration?: number;
  }

  const TYPE_COLOR: Record<MessageType, string> = {
    success: "#52c41a",
    error: "#ff4d4f",
    warning: "#faad14",
    info: "#1890ff",
  };

  const CONTAINER_ID = "usl-message-container";
  const STYLE_ID = "usl-message-style";
  const STYLE_CSS = `
#${CONTAINER_ID} {
  position: fixed; top: 20px; left: 50%;
  transform: translateX(-50%);
  display: flex; flex-direction: column;
  align-items: center;
  z-index: 999999;
  pointer-events: none;
}
#${CONTAINER_ID} > .usl-msg {
  margin: 8px 0; padding: 10px 20px;
  color: #fff; border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 14px; line-height: 1.5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  animation: uslMsgFadeIn 0.3s;
  transition: opacity 0.3s, transform 0.3s;
  max-width: 80vw; word-break: break-word;
  pointer-events: auto;
}
@keyframes uslMsgFadeIn {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

  /** 是否有可用 DOM（前台脚本） */
  function hasDom(): boolean {
    try {
      return typeof document !== "undefined" && !!document.body;
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
    p.className = "usl-msg";
    p.style.backgroundColor = TYPE_COLOR[type];
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

  function showFallback(text: string, type: MessageType): void {
    // 优先桌面通知（后台脚本常见，比 logger 更直观）
    const notify = pickNotify();
    if (notify) {
      try {
        notify({ title: type, text, highlight: type === "error" });
        return;
      } catch (e) {
        logger.debug("message fallback notification failed, use logger", e);
      }
    }
    // 最终降级 logger
    logger[TYPE_LEVEL[type]](`[message:${type}] ${text}`);
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
      showFallback(text, type);
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

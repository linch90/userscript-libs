/**
 * 跨管理器日志工具。
 *
 * - ScriptCat（含后台/定时脚本）：走 `GM.log` / `GM_log` 写入日志面板。
 *   后台脚本无 DOM/console 可靠输出，必须走 GM 日志入口，否则日志丢失。
 * - 其他管理器（Tampermonkey/Violentmonkey 等）：使用 `console.*`。
 *
 * 注：本文件以 `namespace USL` 贡献成员，与 gmRequest.ts、index.ts 中的
 * 同名 namespace 自动合并（全局 script，由 outFile 拼接）。
 */

namespace USL {
  export type LogLevel = "debug" | "info" | "warn" | "error";

  /** 是否运行在 ScriptCat 环境下 */
  export function isScriptCat(): boolean {
    try {
      return (
        typeof GM_info !== "undefined" &&
        ((GM_info as any)?.scriptHandler === "ScriptCat")
      );
    } catch {
      return false;
    }
  }

  const LEVEL_PREFIX: Record<LogLevel, string> = {
    debug: "DEBUG",
    info: "INFO",
    warn: "WARN",
    error: "ERROR",
  };

  function emit(level: LogLevel, prefix: string, args: unknown[]): void {
    const tag = `[${LEVEL_PREFIX[level]}]${prefix ? " " + prefix : ""}`;
    const payload = [tag, ...args];

    if (isScriptCat()) {
      // ScriptCat（含后台/定时脚本）走 GM.log / GM_log 写入日志面板。
      // 后台脚本无 DOM/console 可靠输出，必须走 GM 日志入口。
      const gm: any = typeof GM !== "undefined" ? GM : undefined;
      if (typeof gm?.log === "function") {
        gm.log(...payload);
        return;
      }
      const g: any = typeof globalThis !== "undefined" ? globalThis : {};
      if (typeof g.GM_log === "function") {
        g.GM_log(...payload);
        return;
      }
    }

    const fn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : level === "debug"
            ? console.debug
            : console.log;
    fn(...payload);
  }

  export interface Logger {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    /** 以指定标签创建子 logger，日志前缀会带上 [tag] */
    tag(tag: string): Logger;
  }

  function createLogger(prefix: string): Logger {
    return {
      debug: (...a) => emit("debug", prefix, a),
      info: (...a) => emit("info", prefix, a),
      warn: (...a) => emit("warn", prefix, a),
      error: (...a) => emit("error", prefix, a),
      tag: (t) => createLogger(prefix ? `${prefix}:${t}` : t),
    };
  }

  /** 默认 logger，无前缀。
   * @type {USLLogger} */
  export const logger: Logger = createLogger("");
}

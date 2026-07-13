# userscript-libs

油猴脚本公共库，TypeScript 开发，`tsc` 编译为单文件 IIFE，供 `@require` 直接引入。兼容 **Tampermonkey / Violentmonkey 前台脚本** 与 **ScriptCat 后台/定时脚本**。

## 功能

- `gmRequest(details, options?)` — `GM.xmlHttpRequest` 的 Promise 封装，自动适配前台 callback 风格 / ScriptCat `GM.api` Promise 风格；对 `401` 提供可配置回调。
- `gmRequestJson<T>(details, options?)` — 在 `gmRequest` 基础上自动 `JSON.parse(responseText)`。
- `UnauthorizedError` — 401 专用错误类，便于 `try/catch` 区分。
- `logger` — 跨管理器日志：ScriptCat 走 `GM.api.log`/`GM.log`，其他走 `console.*`；支持 `logger.tag("xxx")` 子前缀。

## 构建

```bash
npm install
npm run build      # 输出到 dist/index.js（+ .d.ts / .map）
npm run watch      # 监听变更自动编译
```

产物 `dist/index.js` 为单文件 IIFE，无 CommonJS 包裹，`@require` 拼接后挂载全局 `USL`。

## 在油猴脚本中使用

```js
// @require https://your.cdn/userscript-libs/dist/index.js

const { gmRequest, gmRequestJson, logger, UnauthorizedError } = USL;

// 普通请求
const resp = await gmRequest({ method: "GET", url: "https://api.example.com/me" });

// 401 自动刷新 token 后重试
const data = await gmRequestJson(
  {
    method: "GET",
    url: "https://api.example.com/protected",
    headers: { Authorization: `Bearer ${token}` },
  },
  {
    onUnauthorized: async () => {
      const fresh = await refreshToken();
      return { headers: { Authorization: `Bearer ${fresh}` } };
    },
  }
);

try {
  await gmRequest({ url: "..." });
} catch (e) {
  if (e instanceof UnauthorizedError) {
    logger.error("需要重新登录");
  }
}
```

## 设计要点

- **module: none + namespace**：避免 @require 沙箱中无模块加载器导致的 `export` 语法错误；编译为全局 `var USL` + IIFE 挂载到 `unsafeWindow`/`globalThis`。
- **ScriptCat 探测**：通过 `GM_info.scriptHandler === "ScriptCat"` 判断，后台脚本仅有 `GM.api` 统一入口，故 `rawXhr`/`logger` 优先走 `GM.api`。
- **401 不写死业务**：`onUnauthorized` 由调用方注入，返回新 `XHRRequest` 即触发一次重试，返回 `false`/`void` 则以 `UnauthorizedError` reject；`maxRetry` 默认 `1` 防止无限循环。

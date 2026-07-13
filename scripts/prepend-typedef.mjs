// 构建后处理：把 scripts/jsdoc-typedef.js 的内容前置到 dist/index.js。
// ensure @typedef 在所有函数 @param 引用之前，供 ScriptCat(Monaco) 编辑器补全。
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const typedefPath = new URL("./jsdoc-typedef.js", import.meta.url);
const distPath = new URL("../dist/index.js", import.meta.url);

if (!existsSync(typedefPath)) {
  console.error("jsdoc-typedef.js not found:", typedefPath.pathname);
  process.exit(1);
}
if (!existsSync(distPath)) {
  console.error("dist/index.js not found, run tsc first");
  process.exit(1);
}

const typedef = readFileSync(typedefPath, "utf8");
let dist = readFileSync(distPath, "utf8");

// 幂等：若已含 typedef 标记则先移除旧的前置块
const marker = "@fileoverview userscript-libs JSDoc 类型声明";
if (dist.includes(marker)) {
  // 移除已存在的 typedef 块（从 /** @fileoverview... 到该注释结束 */ ）
  dist = dist.replace(
    /\/\*\*[\s\S]*?@fileoverview userscript-libs JSDoc 类型声明[\s\S]*?\*\/\s*/,
    ""
  );
}

writeFileSync(distPath, typedef + "\n" + dist);
console.log("✓ prepended jsdoc typedef to dist/index.js");

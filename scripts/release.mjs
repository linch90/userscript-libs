// 发版快捷脚本：改 package.json 版本号 → commit → 打 tag → push（触发 CI 发布）。
// 用法：
//   npm run release -- patch      # 0.1.0 -> 0.1.1
//   npm run release -- minor      # 0.1.0 -> 0.2.0
//   npm run release -- major      # 0.1.0 -> 1.0.0
//   npm run release -- 1.2.3      # 指定具体版本
//
// npm version 自身会：更新 package.json version、git commit、git tag。
// 要求工作区干净（否则 npm version 会报错中止），等价于发版前保护。
// 之后本脚本 push commit 与 tag，CI 检测到 v* tag 触发 .github/workflows/release.yml。

import { execSync } from "node:child_process";

const bump = process.argv[2];

if (!bump) {
  console.error("用法: npm run release -- <patch|minor|major|具体版本号>");
  process.exit(1);
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", ...opts });
}

// 1. 确认工作区干净
let dirty;
try {
  execSync("git diff --quiet && git diff --cached --quiet", { stdio: "ignore" });
  dirty = false;
} catch {
  dirty = true;
}
if (dirty) {
  console.error("✗ 工作区有未提交改动，请先 commit 或 stash 再发版。");
  process.exit(1);
}

// 2. 同步本地 master 与远程（避免发版基于落后 HEAD）
run("git fetch origin master");
const behind = execSync("git rev-list --count HEAD..origin/master")
  .toString()
  .trim();
if (behind !== "0") {
  console.error(`✗ 本地 master 落后远程 ${behind} 个 commit，请先 git pull。`);
  process.exit(1);
}

// 3. npm version：改版本号 + commit + 打 tag（%s 会被替换为新版本号）
run(`npm version ${bump} -m "chore: release %s"`);

// 读出刚打的 tag 名（v<新版本>）
const newVersion = JSON.parse(
  execSync("node -p JSON.stringify(require('./package.json').version)").toString()
);
const tagName = `v${newVersion}`;

// 4. push commit 与 tag（tag 触发 CI 发布 index.js）
run("git push origin master");
run(`git push origin ${tagName}`);

console.log("\n✓ 已打 tag 并推送，GitHub Actions 将自动 build 并发布 index.js。");
console.log("  关注: https://github.com/linch90/userscript-libs/actions");

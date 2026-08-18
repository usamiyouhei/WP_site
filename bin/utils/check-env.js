/**
 * 実行環境チェック
 */

const MIN_NODE_VERSION = "20.19.0";

/**
 * semver形式のバージョンを比較する
 * @param {string} current - 現在のバージョン
 * @param {string} required - 必須バージョン
 * @returns {boolean} current が required 以上なら true
 */
function isVersionAtLeast(current, required) {
  const currentParts = current.split(".").map(Number);
  const requiredParts = required.split(".").map(Number);

  for (let i = 0; i < requiredParts.length; i++) {
    const currentPart = currentParts[i] ?? 0;
    const requiredPart = requiredParts[i] ?? 0;

    if (currentPart > requiredPart) return true;
    if (currentPart < requiredPart) return false;
  }

  return true;
}

/**
 * Node.js のバージョン状態を返す
 */
export function getNodeStatus() {
  const current = process.versions.node;

  return {
    ok: isVersionAtLeast(current, MIN_NODE_VERSION),
    current,
    required: MIN_NODE_VERSION,
  };
}

/**
 * Yarn の実行状態を返す
 */
export function getYarnStatus() {
  const userAgent = process.env.npm_config_user_agent || "";

  if (userAgent.includes("yarn/1.")) {
    return {
      ok: false,
      detail: "Yarn 1 で実行されています",
    };
  }

  if (userAgent.includes("yarn/")) {
    return {
      ok: true,
      detail: userAgent.split(" ").find(part => part.startsWith("yarn/")) || "Yarn を検出しました",
    };
  }

  return {
    ok: true,
    detail: "Yarn 1 は検出されませんでした",
  };
}

/**
 * Node.js のバージョンを検証する
 */
export function checkNode() {
  const status = getNodeStatus();

  if (!status.ok) {
    console.error(`[check-env] Node.js v20.19.0 以上が必要です（推奨 v22.12.0 以上）。現在: v${status.current}`);
    process.exit(1);
  }
}

/**
 * Yarn の実行バージョンを検証する
 */
export function checkYarn() {
  const status = getYarnStatus();

  if (!status.ok) {
    console.error("[check-env] Yarn 1 で実行されています。corepack enable を実行してから yarn をやり直してください。");
    process.exit(1);
  }
}

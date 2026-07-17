/**
 * Codex App Server(`codex app-server`)への最小JSON-RPCクライアント。
 *
 * - stdio上の改行区切りJSON(JSONL)で通信する(codex-cli 0.142で実機確認済み)
 * - 接続ごとに initialize → initialized を一度だけ送る
 * - 認証管理(account/read, account/login/start, account/logout)にのみ使用する
 * - トークンや auth.json の中身はこのプロセスに現れない(App Server側が管理)
 *
 * セキュリティ注意: stderr は診断用に末尾のみ保持し、そのままログへ流さない。
 */
import { spawn } from "node:child_process";

const REQUEST_TIMEOUT_MS = 15_000;
const STDERR_KEEP_BYTES = 4_096;

export class CodexAppServerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // "cli_not_found" | "app_server_failed" | "timeout" | "rpc_error"
  }
}

export class CodexAppServer {
  /**
   * @param {{ clientVersion?: string, onNotification?: (method: string, params: unknown) => void }} opts
   */
  constructor(opts = {}) {
    this.clientVersion = opts.clientVersion ?? "0.0.0";
    this.onNotification = opts.onNotification ?? (() => {});
    this.child = null;
    this.pending = new Map(); // id -> {resolve, reject, timer}
    this.nextId = 1;
    this.initialized = null; // Promise
    this.stderrTail = "";
    this.restartCount = 0;
  }

  /** 起動済みでなければ起動し、initializeハンドシェイクを済ませる */
  async ensureStarted() {
    if (this.child && this.initialized) return this.initialized;
    if (this.restartCount > 1) {
      throw new CodexAppServerError(
        "app_server_failed",
        "Codex App Serverの再起動に繰り返し失敗しました"
      );
    }

    const child = spawn("codex", ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.restartCount += 1;

    child.stdin.on("error", () => {
      /* 子プロセス終了後の書き込み(EPIPE)は exit ハンドラ側で処理する */
    });

    let buffer = "";
    child.stdout.on("data", (d) => {
      buffer += d.toString();
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) this.#handleMessage(line);
      }
    });
    child.stderr.on("data", (d) => {
      this.stderrTail = (this.stderrTail + d.toString()).slice(-STDERR_KEEP_BYTES);
    });
    child.on("error", (e) => {
      const err =
        e.code === "ENOENT"
          ? new CodexAppServerError(
              "cli_not_found",
              "codex コマンドが見つかりません(Codex CLI未インストール)"
            )
          : new CodexAppServerError("app_server_failed", "Codex App Serverを起動できません");
      this.#failAll(err);
      this.child = null;
      this.initialized = null;
    });
    child.on("exit", () => {
      this.#failAll(
        new CodexAppServerError("app_server_failed", "Codex App Serverが終了しました")
      );
      this.child = null;
      this.initialized = null;
    });

    this.initialized = (async () => {
      await this.#request(
        "initialize",
        {
          clientInfo: { name: "ap_study", title: "AP Study", version: this.clientVersion },
          capabilities: null,
        },
        child
      );
      this.#notify("initialized", undefined, child);
      this.restartCount = 0; // 正常初期化できたらリセット
    })();
    return this.initialized;
  }

  /** initialize済みの接続でリクエストを送る */
  async request(method, params, timeoutMs = REQUEST_TIMEOUT_MS) {
    await this.ensureStarted();
    return this.#request(method, params, this.child, timeoutMs);
  }

  #request(method, params, child, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (!child || child.exitCode !== null) {
        reject(new CodexAppServerError("app_server_failed", "Codex App Serverが起動していません"));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexAppServerError("timeout", `${method} がタイムアウトしました`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, ...(params !== undefined ? { params } : {}) }) +
          "\n"
      );
    });
  }

  #notify(method, params, child = this.child) {
    if (!child || child.exitCode !== null) return;
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}) }) + "\n"
    );
  }

  #handleMessage(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // JSON以外の行は無視
    }
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) {
        entry.reject(
          new CodexAppServerError("rpc_error", msg.error.message ?? "App Serverエラー")
        );
      } else {
        entry.resolve(msg.result);
      }
      return;
    }
    if (msg.method) {
      try {
        this.onNotification(msg.method, msg.params);
      } catch {
        /* 通知ハンドラの例外は無視 */
      }
    }
  }

  #failAll(err) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }

  close() {
    if (this.child) {
      this.child.kill();
      this.child = null;
      this.initialized = null;
    }
  }
}

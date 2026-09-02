/**
 * 运行参数
 *
 * 全部从 Cloudflare 的环境变量读取，代码里只留兜底默认值。
 * 在 Cloudflare 控制台 → Workers & Pages → 本 Worker → Settings →
 * Variables and Secrets 里增改，保存后即时生效，不需要改代码或重新部署。
 *
 * 机密（Secret 类型）：
 *   ADMIN_PASSWORD        后台登录口令        必填
 *   SESSION_SECRET        会话签名密钥        必填，建议 ≥32 字符
 *
 * 普通变量（Text 类型，可不填，留空即用默认值）：
 *   SESSION_TTL_HOURS     登录有效期（小时）   默认 8      范围 1–720
 *   LOGIN_MAX_FAILS       允许连续失败次数     默认 8      范围 3–100
 *   LOGIN_WINDOW_MINUTES  失败计数窗口（分钟） 默认 15     范围 1–1440
 *   PUBLIC_CACHE_SECONDS  门户接口缓存（秒）   默认 60     范围 0–86400
 */

const SESSION_SECRET_MIN = 32;

/** 读取一个整数变量，非法或越界时回退到默认值 */
function int(value, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function settings(env) {
  return {
    /** 会话有效期（秒） */
    sessionTtl: int(env.SESSION_TTL_HOURS, 8, 1, 720) * 3600,
    /** 窗口内允许的失败次数 */
    loginMaxFails: int(env.LOGIN_MAX_FAILS, 8, 3, 100),
    /** 失败计数窗口（毫秒） */
    loginWindow: int(env.LOGIN_WINDOW_MINUTES, 15, 1, 1440) * 60 * 1000,
    /** 门户公开接口的缓存时长（秒） */
    publicCache: int(env.PUBLIC_CACHE_SECONDS, 60, 0, 86400),
  };
}

/**
 * 启动自检：缺少必需机密时直接告诉运维该做什么，
 * 而不是抛一个看不懂的运行时错误。
 * @returns {string|null} 有问题返回提示文案，正常返回 null
 */
export function checkEnv(env) {
  if (!env.DB) {
    return '未绑定 D1 数据库。请在 Cloudflare 控制台 → 本 Worker → Settings → Bindings 添加 D1 绑定，变量名填 DB。';
  }
  if (!env.SESSION_SECRET) {
    return '未配置 SESSION_SECRET。请在 Settings → Variables and Secrets 添加同名 Secret，或执行 wrangler secret put SESSION_SECRET。';
  }
  if (env.SESSION_SECRET.length < SESSION_SECRET_MIN) {
    return `SESSION_SECRET 过短（当前 ${env.SESSION_SECRET.length} 字符，至少需要 ${SESSION_SECRET_MIN}）。太短的密钥会削弱会话签名强度，请换成更长的随机字符串。`;
  }
  if (!env.ADMIN_PASSWORD) {
    return '未配置 ADMIN_PASSWORD。请在 Settings → Variables and Secrets 添加同名 Secret，或执行 wrangler secret put ADMIN_PASSWORD。';
  }
  return null;
}

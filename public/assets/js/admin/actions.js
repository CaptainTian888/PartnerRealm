/**
 * 后台写操作的统一入口。
 *
 * 各业务模块不直接处理错误与重绘：写成功后广播 wlt:refresh 由外壳重绘当前页，
 * 会话过期则广播 wlt:auth-expired 由外壳退回登录页。
 * 用事件而不是直接引用 admin.js，避免模块间循环依赖。
 */
import { AuthError } from '../store.js';
import { toast } from '../util.js';

/**
 * @param {() => Promise<any>} action 实际的写操作
 * @param {string} [successMessage] 成功后的提示文案
 * @returns {Promise<boolean>} 是否成功
 */
export async function write(action, successMessage) {
  try {
    await action();
    if (successMessage) toast(successMessage, 'ok');
    window.dispatchEvent(new CustomEvent('wlt:refresh'));
    return true;
  } catch (err) {
    if (err instanceof AuthError) {
      window.dispatchEvent(new CustomEvent('wlt:auth-expired', { detail: { message: err.message } }));
      return false;
    }
    // 服务端的业务校验错误（如伙伴仍被引用）在这里原样告知用户，停留时间长一些
    toast(err.message || '保存失败', 'bad', 6000);
    return false;
  }
}

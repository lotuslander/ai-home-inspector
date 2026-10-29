// utils/fileStore.js - 把临时文件持久化到本地用户目录
// 小程序 wx.chooseMedia / canvas 拿到的 tempFilePath 是临时文件，
// 系统清理后（通常数天/重启后）图片就会失效，导致历史报告照片空白。
// 所有落库的照片、签名、Logo 都必须先 saveFile 持久化，统一走本模块。

// wx.saveFile 保存到本地用户目录后的路径特征：
//   iOS/安卓：wxfile://usr/xxx 或 /usr/xxx（旧版 wxfile://store_xxx）
// 临时文件通常在 http://tmp/、http://usr/ 之外的一次性目录，或 wxfile://tmp/
const IS_PERSISTED = /(^|\/)usr\//i;

// 把单个临时文件保存为永久文件，返回 res.savedFilePath；失败时原样返回入参（保证不中断主流程）
function persist(tempPath) {
  return new Promise((resolve) => {
    if (!tempPath || typeof tempPath !== 'string') return resolve(tempPath);
    // 网络图片无需处理（不是本机文件）
    if (/^https?:/i.test(tempPath)) return resolve(tempPath);
    // 已经在持久化目录（wxfile://usr/... 或 /usr/...）则跳过，避免重复保存
    if (IS_PERSISTED.test(tempPath)) return resolve(tempPath);
    try {
      wx.getFileSystemManager().saveFile({
        tempFilePath: tempPath,
        success: (r) => resolve(r.savedFilePath || tempPath),
        fail: () => resolve(tempPath)
      });
    } catch (e) {
      resolve(tempPath);
    }
  });
}

// 批量持久化照片对象 [{url, shotAt}] 或字符串数组，保持原有格式
function persistPhotos(photos) {
  const arr = photos || [];
  return Promise.all(arr.map((p) => {
    const isObj = p && typeof p === 'object';
    const src = isObj ? p.url : p;
    return persist(src).then((saved) => (isObj ? Object.assign({}, p, { url: saved }) : saved));
  }));
}

// 单个照片对象（无 url 时原样返回）
function persistPhoto(p) {
  if (!p) return Promise.resolve(p);
  const isObj = typeof p === 'object';
  const src = isObj ? p.url : p;
  return persist(src).then((saved) => (isObj ? Object.assign({}, p, { url: saved }) : saved));
}

// 删除持久化文件（恢复出厂/删报告时释放空间），忽略错误
function remove(savedPath) {
  if (!savedPath || typeof savedPath !== 'string' || !/usr\//.test(savedPath)) return;
  try { wx.getFileSystemManager().unlink({ filePath: savedPath }); } catch (e) {}
}

module.exports = { persist, persistPhotos, persistPhoto, remove };

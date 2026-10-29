// utils/llmConfig.js - 大模型配置统一读写（全局唯一入口）
// 历史上存在两种存储结构，必须兼容：
//   A) 扁平（mine.js / 旧版写入）：{ apiUrl, apiKey, model }
//   B) 多模型（llm-config/detail 写入）：{ qwen:{apiKey,endpoint,model}, deepseek:{...}, active:'qwen' }
// aiEngine / rag / 各页面统一走本模块，避免"某一处配置了却不生效"。

const KEY = 'llmConfig';

// 各预设模型的默认接口（与 llm-config 页保持一致）
const PRESETS = {
  qwen:     { name: '阿里通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-plus', vision: true },
  deepseek: { name: 'DeepSeek',    apiUrl: 'https://api.deepseek.com/chat/completions',                         model: 'deepseek-chat', vision: false },
  glm:      { name: '智谱GLM',     apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',            model: 'glm-4-flash',   vision: false },
  doubao:   { name: '字节豆包',    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',        model: 'ep-你的接入点ID', vision: false },
  baidu:    { name: '百度文心一言', apiUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions', model: 'ernie-4.0', vision: false }
};

function readRaw() {
  try { return wx.getStorageSync(KEY) || {}; } catch (e) { return {}; }
}

// 读取生效配置，统一返回 { apiUrl, apiKey, model, active } 或 null（未配置）
function getActive() {
  const raw = readRaw();
  if (!raw || typeof raw !== 'object') return null;

  // A) 扁平结构优先
  if (raw.apiUrl && raw.apiKey) {
    return { apiUrl: raw.apiUrl, apiKey: raw.apiKey, model: raw.model || 'qwen-plus', active: raw.active || '' };
  }

  // B) 多模型结构：优先 active，否则取第一个填了 Key 的
  let id = raw.active;
  if (!id || !raw[id] || !raw[id].apiKey) {
    id = Object.keys(raw).find(k => raw[k] && raw[k].apiKey);
  }
  if (!id || !raw[id] || !raw[id].apiKey) return null;
  const cfg = raw[id];
  const preset = PRESETS[id] || {};
  const apiUrl = cfg.endpoint || cfg.apiUrl || preset.apiUrl;
  if (!apiUrl) return null;
  return { apiUrl, apiKey: cfg.apiKey, model: cfg.model || preset.model || 'qwen-plus', active: id };
}

// 是否已配置可用的大模型
function isConfigured() { return !!getActive(); }

// 写入扁平结构（设置页"手动配置"用），同时清掉多模型结构避免歧义
function saveFlat(cfg) {
  const out = { apiUrl: (cfg.apiUrl || '').trim(), apiKey: (cfg.apiKey || '').trim(), model: (cfg.model || '').trim() || 'qwen-plus' };
  try { wx.setStorageSync(KEY, out); return out; } catch (e) { return null; }
}

// 写入某个预设模型的 Key（llm-config/detail 用），保留其他模型已存的 Key。
// 关键：同时回写扁平字段，保证所有读配置的地方都能立刻用上。
function saveModel(id, cfg) {
  const raw = readRaw();
  const multi = (raw && typeof raw === 'object') ? raw : {};
  multi[id] = { apiKey: (cfg.apiKey || '').trim(), endpoint: cfg.endpoint || '', model: cfg.model || '' };
  multi.active = id;
  const preset = PRESETS[id] || {};
  const apiUrl = cfg.endpoint || preset.apiUrl;
  if (apiUrl && multi[id].apiKey) {
    multi.apiUrl = apiUrl;
    multi.apiKey = multi[id].apiKey;
    multi.model = cfg.model || preset.model || '';
  }
  try { wx.setStorageSync(KEY, multi); return multi; } catch (e) { return null; }
}

// 移除某个模型的 Key
function removeModel(id) {
  const raw = readRaw();
  if (!raw || typeof raw !== 'object') return;
  delete raw[id];
  if (raw.active === id) {
    delete raw.active;
    const next = Object.keys(raw).find(k => raw[k] && raw[k].apiKey);
    if (next) {
      raw.active = next;
      raw.apiUrl = raw[next].endpoint || (PRESETS[next] || {}).apiUrl || '';
      raw.apiKey = raw[next].apiKey;
      raw.model = raw[next].model || (PRESETS[next] || {}).model || '';
    } else {
      delete raw.apiUrl; delete raw.apiKey; delete raw.model;
    }
  }
  try { wx.setStorageSync(KEY, raw); } catch (e) {}
}

function clearAll() { try { wx.removeStorageSync(KEY); } catch (e) {} }

module.exports = { PRESETS, getActive, isConfigured, saveFlat, saveModel, removeModel, clearAll, readRaw };

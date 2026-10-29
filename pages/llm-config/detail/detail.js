// 单个大模型配置页
const llm = require('../../../utils/llmConfig.js');
const MODELS = {
  qwen: { name: '阿里通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-plus' },
  deepseek: { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  glm: { name: '智谱GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
  doubao: { name: '字节豆包', endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'ep-你的接入点ID' },
  baidu: { name: '百度文心一言', endpoint: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions', model: 'ernie-4.0' }
};
Page({
  data: { id: '', name: '', endpoint: '', model: '', apiKey: '' },
  onLoad(e) {
    const m = MODELS[e.id] || MODELS.qwen;
    const raw = llm.readRaw();
    const mine = (raw && raw[e.id]) || {};
    this.setData({ id: e.id, name: m.name, endpoint: m.endpoint, model: m.model, apiKey: mine.apiKey || '' });
    wx.setNavigationBarTitle({ title: m.name });
    // 自动检测剪贴板里有没有Key
    wx.getClipboardData({
      success: (res) => {
        const text = res.data || '';
        // 自动识别Key前缀
        if (text.startsWith('sk-') && !this.data.apiKey) {
          wx.showModal({
            title: '检测到剪贴板内容',
            content: '检测到一串API Key，是否自动填入？',
            success: (r) => { if (r.confirm) this.setData({ apiKey: text }); }
          });
        }
      }
    });
  },
  onKeyInput(e) { this.setData({ apiKey: e.detail.value }); },
  save() {
    if (!this.data.apiKey.trim()) { wx.showToast({ title: '请输入API Key', icon: 'none' }); return; }
    // 统一走 llmConfig 模块：会同时写入扁平字段，(aiEngine/rag 读的就是它)
    llm.saveModel(this.data.id, { apiKey: this.data.apiKey, endpoint: this.data.endpoint, model: this.data.model });
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 1000);
  },
  clear() {
    llm.removeModel(this.data.id);
    this.setData({ apiKey: '' });
    wx.showToast({ title: '已清除', icon: 'success' });
  }
});

// 大模型配置列表页
const llm = require('../../utils/llmConfig.js');
Page({
  data: {
    models: [
      { id: 'qwen', name: '阿里通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-plus', desc: '带看图能力，推荐首选', configured: false },
      { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', desc: '纯文字问答，便宜', configured: false },
      { id: 'glm', name: '智谱GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', desc: '免费额度多', configured: false },
      { id: 'doubao', name: '字节豆包', endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'ep-你的接入点ID', desc: '字节出品，稳定', configured: false },
      { id: 'baidu', name: '百度文心一言', endpoint: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions', model: 'ernie-4.0', desc: '百度出品', configured: false }
    ]
  },
  onShow() {
    // 读已配置的Key（兼容多模型/扁平两种结构）
    const raw = llm.readRaw();
    const active = llm.getActive();
    const models = this.data.models.map(m => {
      const hit = raw && raw[m.id];
      // 走扁平结构的用户，active 模型也算已配置
      m.configured = !!(hit && hit.apiKey) || !!(active && active.active === m.id);
      return m;
    });
    this.setData({ models });
  },
  tapModel(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/llm-config/detail/detail?id=' + id });
  }
});

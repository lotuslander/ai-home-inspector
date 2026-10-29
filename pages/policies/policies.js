// pages/policies/policies.js - 协议与声明（隐私政策/用户协议/版权声明/免责声明全文）
Page({
  data: { active: 'privacy' },
  pick(e) {
    this.setData({ active: e.currentTarget.dataset.k });
  }
});

// pages/tools/tools.js - 验房工具清单（按房型推荐，可勾选打包，现场检测引导）
const app = getApp();

// 按房型推荐工具（毛坯/精装/二手）
const TOOL_LIB = {
  common: [
    { id:'hammer', name:'空鼓锤', need:'敲击墙地面听空响', must:true },
    { id:'tape', name:'5m钢卷尺', need:'量面积、尺寸、门缝', must:true },
    { id:'tester', name:'验电插座/相位仪', need:'测插座接线与接地', must:true },
    { id:'flash', name:'强光手电', need:'照暗角、看裂缝渗水', must:true },
    { id:'level', name:'2m靠尺', need:'测墙面/地面平整度', must:true },
    { id:'feeler', name:'塞尺', need:'配合靠尺量缝隙', must:true },
    { id:'moisture', name:'水分仪', need:'测墙地面含水率', must:false },
    { id:'phone', name:'手机（拍照记录）', need:'现场取证', must:true },
    { id:'note', name:'记录本+笔', need:'手绘点位图', must:false }
  ],
  '毛坯房': [
    { id:'cap', name:'安全帽', need:'毛坯工地安全', must:true },
    { id:'chalk', name:'粉笔/胶带', need:'标记空鼓范围', must:true },
    { id:'glass', name:'玻璃检测仪', need:'测安全玻璃3C', must:false },
    { id:'caliper', name:'游标卡尺', need:'量管径、型材厚度', must:false }
  ],
  '精装房': [
    { id:'shoes', name:'鞋套', need:'保护地板', must:true },
    { id:'angle', name:'直角检测尺', need:'测阴阳角方正', must:true },
    { id:'laser', name:'激光水平仪', need:'测吊顶/地板水平', must:false },
    { id:'stethoscope', name:'水压表', need:'配合打压试验', must:false }
  ],
  '二手房': [
    { id:'multi', name:'万用表', need:'测电路通断/老化', must:true },
    { id:'gas', name:'燃气检测仪', need:'测燃气泄漏', must:false },
    { id:'infrared', name:'红外测温仪', need:'查渗漏、空鼓', must:false },
    { id:'drill', name:'查漏电笔', need:'快速测插座带电', must:true }
  ]
};

// 防护与记录（所有房型）
const SAFETY = [
  { id:'mask', name:'口罩', need:'防尘、防护', must:true },
  { id:'glove', name:'手套', need:'保护双手', must:true },
  { id:'goggle', name:'护目镜', need:'防灰尘/碎屑', must:false },
  { id:'pow', name:'充电宝', need:'手机续航', must:false }
];

Page({
  data: { groups: [], taskType: '', packed: 0, total: 0, allPacked: false },
  onShow() {
    const task = app.globalData.currentTask;
    const type = (task && task.type) || '毛坯房';
    // 组装工具组：通用 + 房型专用 + 防护
    const groups = [
      { name: '🛠 基础检测工具', items: TOOL_LIB.common },
      { name: '🏠 ' + type + '专用', items: TOOL_LIB[type] || [] },
      { name: '🛡 防护用品', items: SAFETY }
    ];
    // 读取本地勾选状态
    const saved = wx.getStorageSync('toolPacked') || {};
    let packed = 0, total = 0;
    groups.forEach(g => g.items.forEach(it => {
      it.checked = saved[it.id] === true;
      if (it.checked) packed++;
      total++;
    }));
    this.setData({ groups, taskType: type, packed, total, allPacked: packed === total });
  },
  toggle(e) {
    const id = e.currentTarget.dataset.id;
    const saved = wx.getStorageSync('toolPacked') || {};
    saved[id] = !saved[id];
    if (app.safeSet) app.safeSet('toolPacked', saved); else wx.setStorageSync('toolPacked', saved);
    this.onShow();
  },
  // 一键全选
  packAll() {
    const saved = {};
    this.data.groups.forEach(g => g.items.forEach(it => saved[it.id] = true));
    if (app.safeSet) app.safeSet('toolPacked', saved); else wx.setStorageSync('toolPacked', saved);
    wx.showToast({ title: '已全部勾选', icon: 'success' });
    this.onShow();
  },
  // 一键清空
  clearAll() {
    if (app.safeSet) app.safeSet('toolPacked', {}); else wx.setStorageSync('toolPacked', {});
    this.onShow();
  },
  // 生成打包提醒文本（可分享/复制）
  genList() {
    const notPacked = [];
    this.data.groups.forEach(g => g.items.forEach(it => {
      if (it.must && !it.checked) notPacked.push(it.name);
    }));
    if (notPacked.length) {
      wx.showModal({
        title: '⚠️ 还有必带工具未勾选',
        content: '以下工具建议带上：\n' + notPacked.join('、') + '\n\n确认已带齐？',
        confirmText: '已带齐', cancelText: '再看看',
        success: (r) => { if (r.confirm) this.doCopy(); }
      });
      return;
    }
    this.doCopy();
  },
  doCopy() {
    const type = this.data.taskType;
    let t = '【AI验房师 · ' + type + '验房工具清单】\n';
    this.data.groups.forEach(g => {
      t += '\n' + g.name + '\n';
      g.items.forEach(it => t += (it.checked ? '☑' : '☐') + ' ' + it.name + '（' + it.need + '）\n');
    });
    t += '\n勾选状态已保存在本机。';
    wx.setClipboardData({
      data: t,
      success: () => wx.showModal({ title: '清单已复制', content: '已复制完整工具清单，可粘贴到备忘录或发给助手备查。', showCancel: false })
    });
  }
});

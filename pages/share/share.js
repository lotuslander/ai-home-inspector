// pages/share/share.js - 业主端只读报告页（分享给业主查看 + 手写确认签名）
const app = getApp();
// 问题归类（业主视角，按住宅系统）
const CATEGORY_RULES = [
  { cat: '墙面顶棚', kw: ['墙面', '墙', '顶棚', '抹灰', '空鼓', '裂缝', '乳胶漆', '阴阳角'] },
  { cat: '地面', kw: ['地面', '地板', '地砖', '地面空鼓', '地面坡度', '起拱'] },
  { cat: '防水渗漏', kw: ['防水', '渗漏', '渗水', '漏水', '闭水', '返潮'] },
  { cat: '门窗', kw: ['门', '窗', '玻璃', '五金', '密封'] },
  { cat: '电气', kw: ['插座', '开关', '配电', '漏电', '等电位', '照明', '电路'] },
  { cat: '给排水', kw: ['给水', '排水', '管道', '地漏', '水封', '龙头', '水压'] },
  { cat: '安全防护', kw: ['栏杆', '护栏', '燃气', '消防', '烟道'] },
  { cat: '采暖通风', kw: ['采暖', '地暖', '通风', '空调', '排烟'] }
];
function classify(name) {
  for (const r of CATEGORY_RULES) {
    if (r.kw.some(k => name.indexOf(k) >= 0)) return r.cat;
  }
  return '其他';
}
Page({
  data: { report: null, notFound: false, problems: [], photos: [], summary: [], advice: null, oneLine: '' },
  onLoad(o) {
    const no = o.no || app.globalData.shareReportNo || '';
    this.reportNo = no;
    const reports = app.getReports();
    const report = reports.find(r => r.reportNo === no) || reports[0] || null;
    if (!report) { this.setData({ notFound: true }); return; }
    const photos = [];
    (report.problems || []).forEach(p => (p.photos || []).forEach(u => photos.push(typeof u === 'string' ? u : u.url)));
    // 注意：problems 必须取自 report.problems，此前这里直接引用了未声明的变量，
    // 只要报告存在就会抛 ReferenceError，业主端整页白屏。
    const problems = report.problems || [];
    this.setData({ report, problems, photos, summary: this.buildSummary(report), advice: this.getAdvice(report), oneLine: this.buildOneLine(report) });
    wx.setNavigationBarTitle({ title: '验房报告' });
  },
  // 一句话版报告：业主可直接转发给家人/开发商的口语化摘要
  buildOneLine(r) {
    const g = r.grade ? r.grade.grade : '';
    const gName = { A: '整体质量好', B: '整体质量良好', C: '整体质量一般', D: '整体质量偏差' }[g] || '';
    const high = r.highCount || 0;
    const bad = r.badCount || 0;
    const mid = r.midCount || 0;
    const parts = [];
    parts.push(r.community + ' ' + r.room + '验房完成');
    if (gName) parts.push(gName + '（' + g + '级）');
    if (high) parts.push('发现' + high + '项高风险需优先整改');
    if (bad) parts.push('共' + bad + '项问题');
    if (mid) parts.push(mid + '项关注');
    if (!bad && !mid) parts.push('未发现明显问题，可正常收房');
    return parts.join('，') + '。详细报告编号' + r.reportNo + '，可向验房师核对。';
  },
  // 复制一句话摘要给家人/开发商
  copyOneLine() {
    wx.setClipboardData({
      data: this.data.oneLine,
      success: () => wx.showToast({ title: '一句话摘要已复制', icon: 'success' })
    });
  },
  // 问题分类汇总：让业主一眼看到问题集中在哪些系统
  buildSummary(report) {
    const map = {};
    (report.problems || []).forEach(p => {
      const c = classify(p.name || '');
      if (!map[c]) map[c] = { cat: c, bad: 0, mid: 0, high: 0 };
      map[c].bad += p.type === 'bad' ? 1 : 0;
      map[c].mid += p.type === 'mid' ? 1 : 0;
      map[c].high += p.risk === 'high' ? 1 : 0;
    });
    return Object.keys(map).map(k => map[k]).sort((a, b) => (b.bad + b.mid) - (a.bad + a.mid));
  },
  onShow() {
    // 业主签完名返回后写回报告
    let sig = '';
    try { sig = wx.getStorageSync('ownerSignature') || ''; } catch(e) {}
    if (sig && this.reportNo) {
      app.updateReport(this.reportNo, { ownerConfirmed: true, ownerSignature: sig, ownerConfirmTime: new Date().toISOString() });
      wx.removeStorageSync('ownerSignature');
      const reports = app.getReports();
      const report = reports.find(r => r.reportNo === this.reportNo);
      if (report) this.setData({ report });
      wx.showToast({ title: '业主已确认', icon: 'success' });
    }
  },
  viewPhoto(e) {
    const urls = this.data.photos;
    if (!urls.length) return;
    const cur = urls[e.currentTarget.dataset.idx];
    wx.previewImage({ urls, current: cur });
  },
  // 业主签字改为"现场在验房师手机上签"（纯端侧无法把业主端签字回传），
  // 本页不再提供签字入口，仅做说明。
  confirmRead() {
    wx.showModal({
      title: '签字确认说明',
      content: '为保证报告签字的有效性，业主签字需在现场由验房师协助完成，签字会写入报告并随报告长图一起导出。',
      showCancel: false
    });
  },
  // 业主收房决策建议：按评级给可直接照做的行动指引
  getAdvice(report) {
    const g = report.grade ? report.grade.grade : '';
    const high = report.highCount || 0;
    if (g === 'D' || high >= 1) {
      return {
        title: '建议：暂缓收房，先整改',
        color: '#FF3B30',
        items: [
          '存在高风险项（结构/渗漏/安全），建议要求开发商先整改，整改后复检确认再收房',
          '保留本报告和照片，与开发商书面交涉时作为依据',
          '如开发商拒绝整改，可向当地住建部门投诉或咨询律师'
        ]
      };
    }
    if (g === 'C') {
      return {
        title: '建议：边整改边收房',
        color: '#FF9500',
        items: [
          '问题较多但无重大隐患，可先收房，同时要求开发商限期整改',
          '把整改通知单发给开发商，15天内整改完预约复检',
          '复检前先不要装修，避免责任不清'
        ]
      };
    }
    if (g === 'B') {
      return {
        title: '建议：可以收房，装修前处理',
        color: '#34C759',
        items: [
          '整体质量基本合格，可正常收房',
          '关注项建议在装修时一并处理，避免二次返工',
          '保留报告，入住后如发现渗漏等问题可追溯'
        ]
      };
    }
    return {
      title: '建议：放心收房',
      color: '#007AFF',
      items: [
        '本次检查未发现明显问题，可以放心收房',
        '建议保留报告，作为入住后维保的依据',
        '交房后注意开发商保修期（通常2-5年）'
      ]
    };
  },
  // 业主常见问题自动回复
  ownerFAQ(){
    const faqs = [
      'Q：报告里的"问题"和"关注"有什么区别？\nA："问题"是必须整改的硬伤，"关注"是建议处理的小毛病。',
      'Q：整改有时间限制吗？\nA：高风险建议1周内，一般问题2周内，关注项装修前处理即可。',
      'Q：整改完还要再验吗？\nA：重要问题建议复检，约验房师上门确认整改效果。',
      'Q：这份报告有法律效力吗？\nA：本报告由独立验房师出具，可作为与开发商交涉的证据。'
    ];
    wx.showActionSheet({
      itemList: ['常见问题', '开发商不整改怎么办（维权指引）'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({ title: '业主常见问题', content: faqs.join('\n\n'), showCancel: false });
        } else if (res.tapIndex === 1) {
          this.rightsGuide();
        }
      }
    });
  },
  // 维权指引：开发商不整改时的合规行动路径
  rightsGuide(){
    const steps = [
      '1️⃣ 书面交涉（0-7天）\n用本报告+整改通知单，微信/书面要求开发商限期整改，留存沟通记录。',
      '2️⃣ 物业/开发商客服升级（1-2周）\n开发商不回应，向物业公司或开发商的客服热线正式投诉，要求书面答复。',
      '3️⃣ 主管部门投诉（2-4周）\n拨打当地住建部门投诉电话（如12345转住建），或登录"全国12315平台"投诉，附报告和照片。',
      '4️⃣ 专业鉴定（4周后）\n涉及结构安全/渗漏等重大问题的，委托有资质的检测机构鉴定，鉴定报告是诉讼关键证据。',
      '5️⃣ 法律途径\n协商无果可依《商品房买卖合同》《建设工程质量管理条例》向法院起诉，报告+鉴定+整改通知单组成证据链。'
    ];
    wx.showModal({
      title: '维权指引（开发商不整改）',
      content: steps.join('\n\n') + '\n\n—— 本指引仅供参考，重大纠纷建议咨询专业律师',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});

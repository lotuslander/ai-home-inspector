// pages/norms/norms.js - 规范检索（自然语言问答 + 条文过滤 + 高频判定线速查 + 类别导航）
const { NORMS } = require('../../utils/inspectData.js');
const { askSmart } = require('../../utils/aiEngine.js');
const { CATEGORY_GUIDE } = require('../../utils/normMatch.js');
// 高频判定线：验房现场最高频的量化标准，一眼速查
const QUICK_STANDARDS = [
  { cat: '墙面', item: '空鼓', std: '单处≤400cm²，每间≤2处', code: 'GB50210' },
  { cat: '墙面', item: '平整度', std: '2m靠尺偏差≤4mm', code: 'GB50210' },
  { cat: '墙面', item: '裂缝', std: '≤0.5mm发丝纹；>1mm疑结构缝', code: 'GB50210' },
  { cat: '墙面', item: '阴阳角', std: '方正偏差≤4mm', code: 'GB50210' },
  { cat: '地面', item: '地砖空鼓', std: '单砖≤15%面积', code: 'GB50209' },
  { cat: '地面', item: '地板起拱', std: '表面平整≤2mm/2m', code: 'GB50209' },
  { cat: '门窗', item: '玻璃3C', std: '7层及以上必须安全玻璃', code: 'GB15763' },
  { cat: '门窗', item: '外窗渗漏', std: '淋水试验不渗漏', code: 'GB50210' },
  { cat: '防水', item: '卫生间防水', std: '墙面≥1.8m，闭水≥24h', code: 'GB50209' },
  { cat: '防水', item: '阳台防水', std: '闭水试验不渗漏', code: 'GB50209' },
  { cat: '电气', item: '插座接地', std: 'PE线必须可靠接地', code: 'GB50303' },
  { cat: '电气', item: '漏保', std: '末端回路应装漏电保护', code: 'GB50303' },
  { cat: '给排水', item: '打压试验', std: '0.6-0.8MPa保压1h', code: 'GB50242' },
  { cat: '给排水', item: '通球', std: '排水立管通球试验', code: 'GB50242' },
  { cat: '安全', item: '阳台栏杆', std: '净高≥1.1m，间距≤0.11m', code: 'GB50352' },
  { cat: '安全', item: '护栏玻璃', std: '临空护栏用钢化夹胶玻璃', code: 'GB15763' },
  { cat: '层高', item: '净高', std: '住宅层高≥2.8m(净高≥2.4m)', code: 'GB50352' },
  { cat: '烟道', item: '止逆阀', std: '厨房烟道应设止逆阀', code: 'GB50096' }
];
// 地方规范参考：主要省市高于国家标准的本地要点（按所在城市查看，仅供参考，具体以当地最新文件为准）
const LOCAL_STANDARDS = [
  { region: '北京市', code: '京建发〔2020〕', points: ['住宅工程质量验收推行"一户一验"，交付前由业主逐户查验', '精装修住宅交付标准不得低于样板间展示标准', '渗漏、裂缝等质量通病列入分户验收必查项'] },
  { region: '上海市', code: '沪建质安〔2019〕', points: ['外墙保温与饰面系统推行淋水试验，杜绝渗漏通病', '精装房交付应提供主要材料品牌清单', '室内空气污染物检测报告随交付提供'] },
  { region: '广东省', code: '粤建质函〔2021〕', points: ['精装房应交付空气质量检测报告（甲醛/苯/TVOC）', '外墙渗漏纳入质量投诉重点督办', '台风多发区外窗抗风压性能需达标'] },
  { region: '浙江省', code: '浙建〔2020〕', points: ['住宅交付应提供分户验收记录', '厨卫防水闭水试验时间不少于24小时', '全装修住宅实行"样板房+交付标准"双公示'] },
  { region: '江苏省', code: '苏建规字〔2019〕', points: ['精装房交付标准应明确到品牌型号', '外墙保温、外窗渗漏为重点验收项', '交付时应提供住宅质量保证书和说明书'] },
  { region: '山东省', code: '鲁建质安〔2021〕', points: ['推行住宅工程质量分户验收制度', '室内净高、开间进深实测实量结果随交付公示', '渗漏、空鼓、裂缝列入必查通病清单'] },
  { region: '四川省', code: '川建质安〔2020〕', points: ['地震多发区关注结构构件裂缝（非表面抹灰缝）', '精装房交付应含隐蔽工程影像资料', '卫生间防水闭水试验记录需业主签字确认'] },
  { region: '湖北省', code: '鄂建〔2021〕', points: ['推行"先验房后收房"制度', '精装房主要材料进场需验收记录', '外墙、屋面渗漏维修责任期不低于5年'] },
  { region: '湖南省', code: '湘建建〔2020〕', points: ['住宅分户验收应逐户形成验收记录并备案', '厨房、卫生间闭水试验应留存影像', '渗漏、开裂等质量通病纳入建设单位首要责任'] },
  { region: '福建省', code: '闽建〔2019〕', points: ['台风、多雨地区重点查验外窗防渗漏', '沿海地区墙面返潮、盐析需关注', '精装房交付应提供隐蔽工程验收记录'] }
];
Page({
  data: { norms: [], allNorms: [], keyword: '', totalHits: 0, activeCode: '', codes: [], aiAnswer: '', aiLoading: false, showQuick: true, quickStandards: QUICK_STANDARDS, catGuide: [], activeCat: '', guideRules: [], localStandards: LOCAL_STANDARDS, showLocal: false },
  onLoad(options) {
    const codes = NORMS.map(n => n.code);
    this.setData({ norms: NORMS, allNorms: NORMS, codes, catGuide: CATEGORY_GUIDE });
    // 支持外部带关键词进入（如AI答案里的"查条文库"直达）
    if (options && options.k) {
      const k = decodeURIComponent(options.k);
      this.setData({ keyword: k, showQuick: false });
      this.doSearch(k);
    }
  },
  // 按检查类别导航：显示该类相关条文
  pickCat(e){
    const cat = e.currentTarget.dataset.cat;
    if(cat === this.data.activeCat){
      this.setData({ activeCat: '', guideRules: [], norms: this.data.allNorms, showQuick: true });
      return;
    }
    const g = CATEGORY_GUIDE.find(x => x.cat === cat);
    const rules = g ? g.rules : [];
    // 渲染为规范卡片格式
    const norms = rules.map(r => ({ code: r.code, name: '相关条文', points: [{ html: r.point }] }));
    this.setData({ activeCat: cat, guideRules: rules, norms: norms, keyword: '', totalHits: 0, aiAnswer: '', showQuick: false });
  },
  toggleQuick(){ this.setData({showQuick: !this.data.showQuick}); },
  toggleLocal(){ this.setData({showLocal: !this.data.showLocal}); },
  // 点判定线自动检索对应条文
  quickSearch(e){
    const k = e.currentTarget.dataset.k || '';
    this.setData({ keyword: k, showQuick: false });
    this.doSearch(k);
  },
  filterByCode(e) {
    const code = e.currentTarget.dataset.code;
    if (code === this.data.activeCode) {
      this.setData({ norms: this.data.allNorms, activeCode: '', keyword: '', totalHits: 0, aiAnswer: '', showQuick: true });
    } else {
      const filtered = this.data.allNorms.filter(n => n.code === code);
      this.setData({ norms: filtered, activeCode: code, keyword: '', totalHits: 0, aiAnswer: '', showQuick: false });
    }
  },
  onSearch(e) {
    const k = (e.detail.value || '').trim();
    this.doSearch(k);
  },
  doSearch(k) {
    k = typeof k === 'string' ? k : '';
    const base = this.data.activeCode ? this.data.allNorms.filter(n => n.code === this.data.activeCode) : this.data.allNorms;
    if (!k) { this.setData({ norms: base, keyword: '', totalHits: 0, aiAnswer: '', showQuick: !this.data.activeCode }); return; }
    // 1. 先出 AI 答案（本地知识库模糊匹配）
    this.setData({ aiLoading: true, aiAnswer: '' });
    askSmart(k).then(r => {
      this.setData({ aiAnswer: r.text || '', aiLoading: false });
    }).catch(() => { this.setData({ aiLoading: false }); });
    // 2. 同步过滤条文
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'g');
    let hits = 0;
    const filtered = base.map(n => {
      const pts = n.points.filter(p => p.includes(k)).map(p => {
        hits++;
        return { html: p.replace(re, '<span style="color:#FF3B30;font-weight:600;">' + k + '</span>') };
      });
      const nameHit = n.name.includes(k) || n.code.includes(k);
      if (pts.length) return { code: n.code, name: n.name, points: pts };
      if (nameHit) return { code: n.code, name: n.name, points: [{ html: n.name + '（整规范命中，共' + n.points.length + '条）' }] };
      return null;
    }).filter(Boolean);
    this.setData({ norms: filtered, keyword: k, totalHits: hits });
  }
});

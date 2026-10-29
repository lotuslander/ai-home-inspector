const app = getApp();
const { CATEGORIES, NORMS } = require('../../utils/inspectData.js');
const { genConclusion, genOwnerScript, polishProblem } = require('../../utils/aiEngine.js');
const { judgeReport, correlate } = require('../../utils/grade.js');
const { normLine } = require('../../utils/normMatch.js');
Page({ data: { current:{}, reportNo:'', problems:[], badCount:0, midCount:0, okCount:0, doneCount:0, highCount:0, aiText:'', aiLoading:false, inspector:{}, signature:'', unchecked:[], uncheckedNote:'', grade:null },
onLoad(){
  const task=app.globalData.currentTask;
  if(!task){ wx.showToast({title:'无任务',icon:'none'}); return; }
  const no=app.genReportNo();
  // 防伪码：报告号后4位 + 日期校验，业主可凭此向验房师核验
  const antiCode = this.genAntiCode(no);
  const ps=[];
  let mid=0;
  Object.keys(task.records||{}).forEach(id=>{
    const r=task.records[id];
    if(r.status==='bad'||r.status==='mid'){
      CATEGORIES.forEach(c=>c.items.forEach(it=>{
        if(it.id===id){
          ps.push({category:c.name, name:it.name, note:r.note||'', location:r.location||'', fix:it.fix||'', risk:it.risk, type:r.status, metricTip:r.metricTip||'', metricValue:r.metricValue||'', photos:r.photos||[]});
          if(r.status==='mid') mid++;
        }
      }));
    }
  });
  const hc = ps.filter(p=>p.risk==='high').length;
  const user = app.globalData.userInfo||{};
  let sig = '';
  try { sig = wx.getStorageSync('signature')||''; } catch(e){}
  // 业主确认签名不在 onLoad 时读：本单还没存成报告，业主是之后通过分享页签的。
  // 若已保存过同编号报告，则带出业主签名（重新导出图片时才会用上）。
  const savedReport = (app.getReports() || []).find(x => x.reportNo === no) || null;
  const doneCount = app.countChecked ? app.countChecked(task.records) : Object.keys(task.records||{}).length;
  this.setData({current:task, reportNo:no, antiCode, problems:ps, badCount:ps.length-mid, midCount:mid, doneCount, highCount:hc, inspector:user, signature:sig, ownerSignature:(savedReport && savedReport.ownerSignature) || '', grade:judgeReport({badCount:ps.length-mid, midCount:mid, highCount:hc, doneCount})});
},
// 生成防伪码：报告号尾4位 + 哈希校验位
genAntiCode(no){
  no = typeof no === 'string' ? no : String(no || '');
  const tail = (no || '').split('-').pop() || '0000';
  let sum = 0;
  String(no || '').split('').forEach(ch => { sum = (sum + ch.charCodeAt(0)) % 36; });
  const code = sum.toString(36).toUpperCase();
  return tail + code;
},
toggleUncheck(e){
    const item = e.currentTarget.dataset.item;
    const arr = this.data.unchecked;
    const i = arr.indexOf(item);
    if(i>=0) arr.splice(i,1); else arr.push(item);
    this.setData({unchecked:arr});
  },
  onUncheckNote(e){ this.setData({uncheckedNote:e.detail.value}); },
  goSign(){ wx.navigateTo({url:'/pages/sign/sign'}); },
  // 业主当场签字（纯端侧：业主在自己手机上无法把签字回传给验房师，
  // 因此改为当场在验房师手机上签，签字存入当前报告数据，随长图导出）
  goOwnerSign(){ wx.navigateTo({url:'/pages/sign/sign?mode=owner'}); },
  clearOwnerSign(){
    wx.showModal({
      title: '清除业主签字？',
      content: '清除后需要业主重新签字。',
      confirmColor: '#FF3B30',
      success: (r) => { if (r.confirm) this.setData({ ownerSignature: '' }); }
    });
  },
  viewProbPhoto(e){ wx.previewImage({ urls: [e.currentTarget.dataset.src] }); },
onShow(){
  let sig='';
  try { sig = wx.getStorageSync('signature')||''; } catch(e){}
  const patch = {};
  if(sig !== this.data.signature) patch.signature = sig;
  // 业主当场签完字（sign 页 mode=owner 写入 ownerSignature）后返回本页，取出并挂到当前报告上
  let localOwner = '';
  try { localOwner = wx.getStorageSync('ownerSignature') || ''; } catch (e) {}
  if (localOwner) {
    patch.ownerSignature = localOwner;
    wx.removeStorageSync('ownerSignature');
  } else {
    const saved = (app.getReports() || []).find(x => x.reportNo === this.data.reportNo);
    const ownerSig = (saved && saved.ownerSignature) || '';
    if (ownerSig && ownerSig !== this.data.ownerSignature) patch.ownerSignature = ownerSig;
  }
  if (Object.keys(patch).length) this.setData(patch);
},
saveReport(){
  let sig='';
  try { sig = wx.getStorageSync('signature')||''; } catch(e){}
  const r={reportNo:this.data.reportNo, antiCode:this.data.antiCode, grade:this.data.grade, community:this.data.current.community, room:this.data.current.room, date:this.data.current.date, clientName:this.data.current.clientName||'', clientPhone:this.data.current.clientPhone||'', badCount:this.data.badCount, midCount:this.data.midCount, okCount:this.data.doneCount-this.data.badCount-this.data.midCount, highCount:this.data.highCount, problems:this.data.problems, signature:sig, ownerSignature:this.data.ownerSignature||'', ownerConfirmed:!!this.data.ownerSignature, aiConclusion:this.data.aiText, inspector:{name:(app.globalData.userInfo||{}).name, company:(app.globalData.userInfo||{}).company, certNo:(app.globalData.userInfo||{}).certNo, certOrg:(app.globalData.userInfo||{}).certOrg}};
  // pushReport 内部已调用 learnFromReport，此处不能再调一次，否则同一份报告会把
  // 小区/问题次数重复累计（经验库与"本小区历史经验"统计数据翻倍）。
  app.pushReport(r);
  wx.showModal({title:'报告已保存',content:'报告号：'+this.data.reportNo+'\n已自动存入你的个人经验库',showCancel:false,success:()=>{
    // 任务已闭环：清掉当前任务与草稿/未完成快照，避免下次误恢复
    const cur = this.data.current || {};
    if (app.removeUnfinishedTask) app.removeUnfinishedTask(cur.community, cur.room);
    wx.removeStorageSync('currentTask');
    wx.removeStorageSync('taskDraft');
    app.globalData.currentTask=null;
    wx.switchTab({url:'/pages/index/index'});
  }});
},
copyText(){
  let t='【验房报告】'+this.data.reportNo+'\n'+this.data.current.community+' '+this.data.current.room+'\n共'+this.data.doneCount+'项 问题'+this.data.badCount+'项 关注'+this.data.midCount+'项 高风险'+this.data.highCount+'项\n\n';
  this.data.problems.forEach((p,i)=>{ t+=(i+1)+'.['+p.category+']'+p.name+(p.location?'('+p.location+')':'')+(p.metricTip?'【实测:'+p.metricTip+'】':'')+'\n'; });
  wx.setClipboardData({data:t,success:()=>wx.showToast({title:'已复制',icon:'success'})});
},
// ===== 多问题关联分析规则引擎（12条系统性风险规则）=====
correlateAnalysis(){
  const ps = this.data.problems;
  if(!ps.length){ wx.showToast({title:'暂无问题',icon:'none'}); return; }
  const findings = correlate(ps);
  const warns = findings.filter(f=>f.level==='warn');
  if(!warns.length){ wx.showModal({title:'关联分析', content:findings[0].text, showCancel:false}); return; }
  wx.showModal({title:'🔍 多问题关联分析', content: warns.map(f=>'• '+f.text).join('\n\n'), showCancel:false});
},
// ===== 生成整改通知单（给业主/施工方，含评级与分级时限）=====
// ===== 生成整改通知单（按风险分级时限，复制发开发商/物业）=====
genFixList(){
  const ins = this.data.inspector||{};
  const ps = this.data.problems;
  const high = ps.filter(p => p.type==='bad' && p.risk === 'high');
  const normal = ps.filter(p => p.type === 'bad' && p.risk !== 'high');
  const mid = ps.filter(p => p.type === 'mid');
  if(!ps.length){ wx.showToast({title:'无问题项可生成',icon:'none'}); return; }
  let t = '【验房整改通知单】\n';
  t += '致：' + this.data.current.community + ' ' + this.data.current.room + ' 开发商/物业\n';
  t += '报告编号：' + this.data.reportNo + '｜日期：' + this.data.current.date + '\n';
  t += '验房师：' + (ins.name || '—') + (ins.company ? '（' + ins.company + '）' : '') + '\n';
  if(this.data.grade) t += '综合评级：' + this.data.grade.label + '（' + this.data.grade.grade + '级）\n\n';
  t += '本次验房共发现问题 ' + this.data.badCount + ' 项、关注 ' + this.data.midCount + ' 项，请按下述时限完成整改：\n\n';
  if (high.length) {
    t += '一、高风险项（涉及安全/渗漏/结构，请 7 天内优先整改）\n';
    high.forEach((p, i) => {
      t += (i + 1) + '. ' + p.name + (p.location ? '（' + p.location + '）' : '') + '\n';
      const norm = normLine(p.name, p.category, p.note);
      if (norm) t += '   依据：' + norm + '\n';
      if (p.fix) t += '   整改要求：' + p.fix + '\n';
    });
    t += '\n';
  }
  if (normal.length) {
    t += '二、一般问题（请 15 天内完成整改）\n';
    normal.forEach((p, i) => {
      t += (i + 1) + '. ' + p.name + (p.location ? '（' + p.location + '）' : '') + '\n';
      if (p.fix) t += '   整改要求：' + p.fix + '\n';
    });
    t += '\n';
  }
  if (mid.length) {
    t += '三、关注项（建议装修前处理或记录观察）\n';
    t += mid.map(p => '· ' + p.name + (p.location ? '（' + p.location + '）' : '')).join('\n') + '\n\n';
  }
  t += '整改完成后请通知业主预约复检，复检确认后方视为闭环。\n';
  t += '—— 验房师：' + (ins.name || '________') + '\n';
  t += '由「AI验房师」生成 · 防伪码：' + this.data.antiCode;
  wx.setClipboardData({ data: t, success: () => {
    wx.showModal({ title: '整改通知单已复制', content: '已复制分级整改通知单，可直接粘贴发给开发商/物业。', showCancel: false });
  }});
},
aiConclusion(){
  if(!this.data.problems.length){ wx.showToast({title:'暂无问题可生成',icon:'none'}); return; }
  this.setData({aiLoading:true});
  genConclusion(this.data.problems).then(r=>{
    this.setData({aiText:r.text, aiLoading:false});
  }).catch(()=>{ this.setData({aiLoading:false}); wx.showToast({title:'未配置大模型',icon:'none'}); });
},
// 房屋保险建议（根据问题类型推荐）
insuranceTip(){
  const ps = this.data.problems;
  const tips = [];
  const hasWater = ps.some(p=>/漏|渗|防水/.test(p.name||''));
  const hasElec = ps.some(p=>/电|插座|漏保|配电/.test(p.name||''));
  const hasFire = ps.some(p=>/防火|消防|烟感/.test(p.name||''));
  if(hasWater) tips.push('漏水责任险：防水问题易渗到楼下，建议投保');
  if(hasElec) tips.push('家电意外险：电路问题易引发家电损坏');
  tips.push('家财险：覆盖火灾、水渍、盗抢，年保费约200-500元');
  if(hasFire) tips.push('火灾险：有消防隐患时建议加高保额');
  wx.showModal({title:'房屋保险建议', content: tips.join('\n'), showCancel:false});
},
// ===== 生成完整报告文本（本地规范条文拼装，不耗额度）=====
genFullReport(){
  const ins = this.data.inspector||{};
  const ps = this.data.problems;
  let t = '【AI 验房师 · 完整验房报告】\n';
  t += '报告编号：'+this.data.reportNo+'\n';
  t += '项目：'+this.data.current.community+' '+this.data.current.room+'\n';
  t += '验房日期：'+this.data.current.date+'\n';
  t += '验房师：'+(ins.name||'—')+(ins.company?'（'+ins.company+'）':'')+(ins.certNo?'｜资质：'+ins.certOrg+' '+ins.certNo:'')+'\n\n';
  t += '一、检测概况\n';
  t += '共检查 '+this.data.doneCount+' 项，其中问题 '+this.data.badCount+' 项、关注 '+this.data.midCount+' 项、高风险 '+this.data.highCount+' 项。\n';
  if(this.data.grade){
    t += '综合评级：'+this.data.grade.label+'（'+this.data.grade.grade+'级）\n';
    t += '评级说明：'+this.data.grade.desc+'\n';
  }
  t += '\n';
  if(ps.length){
    t += '二、问题明细\n';
    ps.forEach((p,i)=>{
      // 专业规范依据匹配（normMatch引擎，精准命中）
      const norm = normLine(p.name, p.category, p.note);
      t += (i+1)+'. ['+p.category+'] '+p.name+(p.location?'（'+p.location+'）':'')+'\n';
      if(p.metricTip) t += '   实测判定：'+p.metricTip+'\n';
      if(p.note) t += '   现场备注：'+p.note+'\n';
      if(norm) t += '   规范依据：'+norm+'\n';
      t += '   整改建议：'+(p.fix||'按规范整改')+'\n';
    });
    t += '\n三、整改要求\n';
    const gd = this.data.grade;
    if(gd && gd.grade === 'D') t += '本报告评级为不合格，请对高风险项于 7 天内、其余问题于 15 天内完成整改，整改后预约复检。\n';
    else t += '请对上述问题于 15 天内完成整改，整改完成后联系验房师复检确认。\n';
  } else {
    t += '二、结论\n本次检查未发现明显问题。\n';
  }
  t += '\n四、声明\n';
  t += '1. 本报告仅针对交付时现场可检项目，不构成对隐蔽工程、结构安全的鉴定结论；涉及结构安全、渗漏等重大问题的，建议委托有资质的专业机构进一步检测。\n';
  t += '2. 检测结果以现场实测数据和照片为准，因业主自行改动、装修覆盖、二次施工导致的缺陷不在本报告范围内。\n';
  t += '3. 本报告由验房师依据国家现行规范（GB50210/GB50096/GB50242等）出具，供业主维权、整改参考，不替代法律意见。\n';
  t += '4. 报告防伪码：'+this.data.antiCode+'。业主可凭此码向验房师核验报告真伪。\n';
  t += '\n验房师签名：'+(ins.name||'________')+'\n';
  t += '签字日期：'+this.data.current.date+'\n';
  t += '验房师承诺：本人已按规范完成现场查验，报告内容真实、客观。\n';
  t += '本报告由 AI 验房师小程序自动生成';
  wx.setClipboardData({ data: t, success: () => {
    wx.showModal({ title:'完整报告已复制', content:'已复制完整版报告文本，可粘贴到文档/微信中保存或打印。', showCancel:false });
  }});
},
// 设备像素比：优先新版 wx.getWindowInfo，拒绝已废弃 API 硬依赖
getDpr() {
  try {
    if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 2;
    if (wx.getSystemInfoSync) return wx.getSystemInfoSync().pixelRatio || 2;
  } catch (e) {}
  return 2;
},
// ===== 导出报告长图（分页保存到相册，发给业主）=====
// 修复要点：
//  1) 原实现只画前 12 条问题，超出直接写"详见完整报告"——图片里并没有完整内容；
//  2) 画布高度按"问题数×固定值"估算，长文本溢出被裁；
//  3) 不含现场照片，业主拿到的图缺证据；
//  4) 单张超高画布会超出设备 canvas 上限（大真实项目必崩），故改为按页渲染。
async exportImage(){
  const that = this;
  if (!this.data.current) { wx.showToast({ title: '暂无报告数据', icon: 'none' }); return; }
  wx.showLoading({ title: '生成报告中…', mask: true });

  const R = require('../../utils/reportImage.js');
  // 单页最大逻辑高度：按 dpr 反推，确保设备像素高度不超过 8000（iOS/安卓 canvas 安全区间）
  const dpr = Math.min(this.getDpr() || 2, 3);
  const MAX_PAGE_H = Math.max(1200, Math.floor(8000 / dpr));

  const reportData = {
    reportNo: this.data.reportNo,
    antiCode: this.data.antiCode,
    current: this.data.current,
    inspector: this.data.inspector,
    problems: this.data.problems,
    grade: this.data.grade,
    aiText: this.data.aiText,
    signature: this.data.signature,
    ownerSignature: this.data.ownerSignature,
    unchecked: this.data.unchecked,
    uncheckedNote: this.data.uncheckedNote,
    doneCount: this.data.doneCount,
    badCount: this.data.badCount,
    midCount: this.data.midCount,
    highCount: this.data.highCount
  };

  // 收集图片
  const urls = [];
  (this.data.problems || []).forEach(p => (p.photos || []).forEach(x => {
    const u = (x && typeof x === 'object') ? x.url : x;
    if (u) urls.push(u);
  }));
  if (this.data.signature) urls.push(this.data.signature);
  if (this.data.ownerSignature) urls.push(this.data.ownerSignature);

  wx.createSelectorQuery().select('#reportCanvas').fields({ node: true, size: true }).exec(async (res) => {
    if (!res || !res[0] || !res[0].node) { wx.hideLoading(); wx.showToast({ title: '绘制失败', icon: 'none' }); return; }
    const canvas = res[0].node;
    let ctx = canvas.getContext('2d');

    // 1) 量出总高度（不绘制）
    canvas.width = R.W * dpr;
    canvas.height = 100 * dpr;
    ctx.scale(dpr, dpr);
    const totalH = R.render(ctx, { layoutOnly: true, report: reportData, images: {} });

    // 2) 预加载图片
    const images = {};
    const uniq = urls.filter((u, i) => urls.indexOf(u) === i);
    await Promise.all(uniq.map(u => new Promise((resolve) => {
      const img = canvas.createImage();
      const timer = setTimeout(() => { images[u] = null; resolve(); }, 4000);
      img.onload = () => { clearTimeout(timer); images[u] = img; resolve(); };
      img.onerror = () => { clearTimeout(timer); images[u] = null; resolve(); };
      img.src = u;
    })));

    // 3) 分页渲染
    const pages = Math.max(1, Math.ceil(totalH / MAX_PAGE_H));
    const files = [];
    for (let i = 0; i < pages; i++) {
      const offsetY = i * MAX_PAGE_H;
      const pageH = i === pages - 1 ? (totalH - offsetY) : MAX_PAGE_H;
      canvas.width = R.W * dpr;
      canvas.height = Math.ceil(pageH * dpr);
      ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#F2F2F7';
      ctx.fillRect(0, 0, R.W, pageH);
      R.render(ctx, { layoutOnly: false, report: reportData, images, offsetY, pageNo: i + 1, pageTotal: pages });
      const filePath = await that.canvasToFile(canvas, R.W, pageH);
      if (filePath) files.push(filePath);
    }

    wx.hideLoading();
    if (!files.length) { wx.showToast({ title: '导出失败', icon: 'none' }); return; }
    that.savePages(files);
  });
},
// canvas 转临时文件
canvasToFile(canvas, W, H){
  return new Promise((resolve) => {
    wx.canvasToTempFilePath({
      canvas, fileType: 'png', quality: 1,
      success: (r) => resolve(r.tempFilePath),
      fail: () => resolve(null)
    });
  });
},
// 逐页保存到相册（用户拒绝时给出引导）
// 注意：必须用 setTimeout 让出调用栈。若在 success 回调里同步递归 next()，
// 页数一多（超长报告）就会在同一个调用栈里层层嵌套 → Maximum call stack size exceeded。
savePages(files){
  if (!files || !files.length) return;
  let idx = 0, ok = 0, denied = false;
  const next = () => {
    if (idx >= files.length) {
      if (denied) {
        wx.showModal({
          title: '需要相册权限',
          content: '保存报告图片需要「保存到相册」权限，请在设置中开启后重试。',
          confirmText: '去设置',
          success: (s) => { if (s.confirm) wx.openSetting(); }
        });
      } else {
        wx.showModal({
          title: '报告已保存到相册',
          content: '共 ' + ok + ' 张图片（' + (this.data.problems || []).length + ' 项问题、现场照片与签名均已包含）。\n\n在微信里选中这些图片发给业主即可。',
          showCancel: false
        });
      }
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath: files[idx++],
      success: () => { ok++; setTimeout(next, 0); },
      fail: (e) => {
        if (e && /auth|deny|denied/i.test(e.errMsg || '')) denied = true;
        setTimeout(next, 0);
      }
    });
  };
  next();
},
// 纯端侧架构下报告数据只在本机，小程序卡片在业主端取不到内容。
// 产品决策：不做云同步，报告统一以「长图 / 文本」形式交付业主。
// 因此这里把「分享业主」改为直接引导导出，避免误发空卡片。
warnShare(){
  wx.showModal({
    title: '报告请用长图/文本发给业主',
    content: '本小程序数据只保存在你手机上，业主打开小程序卡片看不到报告。\n\n「导出长图」会把全部问题、照片和双方签字保存到相册，直接在微信里发给业主即可。',
    confirmText: '导出长图',
    cancelText: '复制文本',
    success: (r) => { if (r.confirm) this.exportImage(); else this.copyText(); }
  });
},
// 复制报告核验信息（端侧：无网页链接，改用编号+防伪码，业主可在小程序内核验）
copyLink(){
  const t = '【验房报告核验】\n报告编号：' + this.data.reportNo + '\n防伪码：' + this.data.antiCode + '\n项目：' + this.data.current.community + ' ' + this.data.current.room + '\n日期：' + this.data.current.date + '\n验房师：' + ((this.data.inspector||{}).name||'—') + '\n\n业主可向验房师出示此编号与防伪码核验报告真伪。';
  wx.setClipboardData({
    data: t,
    success: () => {
      wx.showModal({title:'核验信息已复制', content:'已复制报告编号+防伪码。发送给业主即可核验；完整报告请点「导出长图」或「复制文本」发给业主。', showCancel:false});
    }
  });
}
});

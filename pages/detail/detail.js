const app = getApp();
const { CATEGORIES, judgeMetric, CASES, TEST_METHODS } = require('../../utils/inspectData.js');
const rag = require('../../utils/rag.js');
const { askVision, genOwnerScript } = require('../../utils/aiEngine.js');
const fs = require('../../utils/fileStore.js');
Page({ data: { item:null, categoryName:'', photos:[], record:{}, location:'', instrument:'', note:'', ownerText:'', similarCases:[], proMethod:null, rooms:['入户','客厅','主卧','次卧','厨房','卫生间','阳台','书房','走廊','衣帽间'] },
onLoad(o){
  this.itemId=o.id;
  const cat=CATEGORIES.find(c=>c.id===o.cat);
  const item=cat&&cat.items.find(i=>i.id===o.id);
  if(item){
    // 匹配专业检测方法（TEST_METHODS库）
    const tm = TEST_METHODS.find(m => item.name.indexOf(m.problem) >= 0 || (m.problem.indexOf(item.name) >= 0)) ||
               TEST_METHODS.find(m => (item.defects||'').indexOf(m.problem) >= 0) || null;
    this.setData({item, categoryName:cat.name, proMethod: tm});
    wx.setNavigationBarTitle({title:item.name});
    // RAG找类似案例
    const r = rag.search(item.name + ' ' + (item.standard||''));
    this.setData({similarCases: r.cases.slice(0,3)});
  }
  this.loadRecord();
},
onShow(){ if(this.itemId) this.loadRecord(); this.setData({fieldMode:wx.getStorageSync('fieldMode')===true}); },
loadRecord(){
  const task=app.globalData.currentTask;
  if(task&&task.records&&task.records[this.itemId]){
    const r=task.records[this.itemId];
    this.setData({photos:r.photos||[], record:r, location:r.location||'', instrument:r.instrument||'', note:r.note||''});
  }
},
// 统一保存当前检查项记录：始终基于已有记录做合并。
// 原来 takePhoto / aiVision / autoDescribe 三处都是"用新建对象整体覆盖"，
// 只要用户先「测一测」录入实测值、再去拍照或让 AI 写描述，metricValue/metricTip 就被清空，
// 报告的"实测判定"随之丢失。这里统一走合并，避免再次遗漏字段。
saveRecord(patch){
  const task = app.globalData.currentTask;
  if (!task) return null;
  if (!task.records) task.records = {};
  const prev = task.records[this.itemId] || {};
  task.records[this.itemId] = Object.assign({}, prev, {
    location: this.data.location,
    instrument: this.data.instrument
  }, patch);
  app.saveTask(task);
  return task.records[this.itemId];
},
// 取第一张照片的文件路径（照片统一为 {url, shotAt}，兼容旧的字符串格式）
firstPhotoPath(){
  const p = (this.data.photos || [])[0];
  if (!p) return '';
  return typeof p === 'string' ? p : (p.url || '');
},
showToolTip(){
  const item = this.data.item;
  if (!item) return;
  wx.showModal({
    title: item.name + ' · 检测教程',
    content: '【怎么测】' + (item.method||'现场目测') + '\n\n【合格标准】' + (item.standard||'符合规范要求') + '\n\n【注意】拍照要拍远景+特写两张，记录位置和实测数据。',
    showCancel: false,
    confirmText: '知道了'
  });
},
setStatus(e){
  const s=e.currentTarget.dataset.s;
  const task=app.globalData.currentTask;
  if(!task){ wx.showToast({title:'请先新建任务',icon:'none'}); return; }
  this.saveRecord({ status: s, photos: this.data.photos, note: this.data.note });
  // AI 风险提示：备注含高危关键词时提醒升级
  const note = (this.data.note||'') + (this.data.instrument||'');
  const highHints = [
    {kw:['斜','贯穿','通长'], tip:'这条裂缝是斜向/贯穿的，可能是结构问题，建议标高风险并要求第三方检测'},
    {kw:['渗','漏','霉','水渍'], tip:'有渗水痕迹，属于高风险项，建议标高风险并要求重做防水'},
    {kw:['电','火','漏电','跳闸'], tip:'电气问题有安全隐患，建议标高风险'},
    {kw:['裂','开','鼓'], tip:'开裂/起鼓较明显，建议标高风险并拍照留证'}
  ];
  const hit = highHints.find(h => h.kw.some(k => note.indexOf(k) >= 0));
  if (hit && s !== 'bad') {
    wx.showModal({ title:'AI 风险提示', content: hit.tip, confirmText:'升级为问题', cancelText:'保持', success:(m)=>{
      if(m.confirm){ task.records[this.itemId].status='bad'; app.saveTask(task); }
      wx.showToast({title:'已标记',icon:'success'});
      setTimeout(()=>wx.navigateBack(), 500);
    }});
  } else {
    wx.showToast({title:'已标记',icon:'success'});
    setTimeout(()=>wx.navigateBack(), 500);
  }
},
takePhoto(){
  if(!app.globalData.currentTask){ wx.showToast({title:'请先新建任务',icon:'none'}); return; }
  wx.chooseMedia({count:3, mediaType:['image'], sourceType:['camera','album'], success: async (r)=>{
    // 持久化临时文件，否则系统清理后报告里的照片会全部失效
    const scaled = await Promise.all(r.tempFiles.map(f => fs.persist(f.tempFilePath)));
    const shotAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // 统一照片格式为 {url, shotAt}，与清单页/报告页保持一致
    const newPhotos = scaled.map(url => ({ url, shotAt }));
    const photos=this.data.photos.map(p => (typeof p === 'string' ? { url: p, shotAt } : p)).concat(newPhotos).slice(0,9);
    // 自动记录拍照时间
    const now = new Date();
    const timeStr = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0')+' '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
    if(photos.length>this.data.photos.length){
      wx.showToast({title:'已添加'+newPhotos.length+'张',icon:'success'});
      // 备注里自动加时间戳
      if(!this.data.note){
        this.setData({note: '【拍照时间】'+timeStr});
      }
    }
    this.setData({photos});
    this.saveRecord({ photos, note: this.data.note });
  }});
},
aiVision(){
  if(!this.data.item){wx.showToast({title:'加载中',icon:'none'});return;}
  if(!this.data.photos.length){wx.showToast({title:'先拍照',icon:'none'});return;}
  wx.showLoading({title:'AI看图中…'});
  askVision(this.firstPhotoPath(),this.data.item.name).then(r=>{
    wx.hideLoading();
    wx.showModal({
      title:'AI看图',
      content:r.text,
      cancelText:'知道了',
      confirmText:'写入备注',
      success:(m)=>{
        if(m.confirm){
          this.setData({note:r.text});
          this.saveRecord({ photos: this.data.photos, note: r.text });
          wx.showToast({title:'已写入备注',icon:'success'});
        }
      }
    });
  })
  .catch(()=>{wx.hideLoading();wx.showToast({title:'需视觉模型',icon:'none'});});
},
  // AI自动生成问题描述
  autoDescribe(){
    if(!this.data.photos.length){wx.showToast({title:'先拍照',icon:'none'});return;}
    wx.showLoading({title:'AI生成描述中…'});
    askVision(this.firstPhotoPath(), '我是验房师，这是验房现场拍的照片。请用专业验房语言描述这个问题：部位+现象+程度。50字内。').then(r=>{
      wx.hideLoading();
      this.setData({note: r.text});
      this.saveRecord({ photos: this.data.photos, note: r.text });
      wx.showToast({title:'AI已自动写好描述',icon:'success'});
    }).catch(()=>{ wx.hideLoading(); wx.showToast({title:'未配置大模型',icon:'none'}); });
  },
  // AI辅助判断风险等级
  autoRisk(){
    if(!this.data.photos.length && !this.data.note){wx.showToast({title:'先拍照或写备注',icon:'none'});return;}
    wx.showLoading({title:'AI判断风险中…'});
    const ctx = '问题：'+this.data.item.name+' 备注：'+(this.data.note||'无');
    askVision(this.firstPhotoPath(), '验房问题：'+ctx+'。请判断这个问题是高风险/中风险/低风险，一句话说明理由。').then(r=>{
      wx.hideLoading();
      wx.showModal({title:'AI风险判断', content:r.text, showCancel:false});
    }).catch(()=>{ wx.hideLoading(); wx.showToast({title:'未配置大模型',icon:'none'}); });
  },
onLocation(e){this.setData({location:e.detail.value});},
quickLoc2(e){
  const room = e.currentTarget.dataset.room;
  const cur = this.data.location || '';
  if (!cur || cur.indexOf(room) >= 0) { this.setData({ location: room }); return; }
  this.setData({ location: cur + '·' + room });
},
onInstrument(e){this.setData({instrument:e.detail.value});},
// 测一测：结构化指标自动判定（数值弹窗输入 / 定性选项）
measure(){
  const item = this.data.item;
  if(!item || !item.metrics) return;
  const m = item.metrics;
  const task = app.globalData.currentTask;
  if(!task){ wx.showToast({title:'请先新建任务',icon:'none'}); return; }
  const save = (val, tip, status) => {
    const rec = this.saveRecord({ status, metricValue: val, metricTip: tip, photos: this.data.photos, note: this.data.note });
    this.setData({ record: rec });
    const iconMap = { ok:'success', mid:'none', bad:'none' };
    wx.showToast({ title: tip, icon: iconMap[status], duration: 2500 });
  };
  if (m.type === 'choice') {
    const labels = (m.options||[]).map(o=>o.label);
    const tip = m.measure ? '测量方法：' + m.measure + '\n\n请现场观察后选结果：' : '请现场观察后选结果：';
    wx.showModal({ title:'测一测：'+item.name, content:tip, confirmText:'去选择', success:(r)=>{
      if(!r.confirm) return;
      wx.showActionSheet({ itemList: labels, success: (r2) => {
        const opt = m.options[r2.tapIndex]; if(!opt) return;
        const res = judgeMetric(m, opt.label);
        save(opt.label, res.tip, res.status);
      }});
    }});
    return;
  }
  wx.showModal({ title:'测一测：'+item.name, content:(m.measure?'测量方法：'+m.measure+'\n\n':'')+'请输入'+m.input+'（'+m.unit+'）', editable:true, placeholderText:m.input, success:(r)=>{
    if(!r.confirm) return;
    const res = judgeMetric(m, r.content);
    if(!res){ wx.showToast({title:'请输入数字',icon:'none'}); return; }
    save(r.content.trim(), res.tip, res.status);
  }});
},
onNote(e){this.setData({note:e.detail.value});},
// 语音输入备注：检测 WechatSI 插件，正式版可说话转文字
voiceInput(){
  let plugin = null;
  try { plugin = requirePlugin('WechatSI'); } catch(e) {}
  if (!plugin) {
    wx.showModal({ title:'语音输入未开通', content:'正式版需在小程序后台开通「微信同声传译」插件后，即可现场说话自动转文字写入备注。当前测试版可先手动输入。', showCancel:false });
    return;
  }
  const that = this;
  wx.authorize({ scope: 'scope.record', success: () => {
    wx.showToast({ title:'请说话(5秒)', icon:'none', duration: 5000 });
    const amr = plugin.getRecordRecognitionManager();
    amr.onStop = (res) => {
      if (res && res.result) that.setData({ note: (that.data.note ? that.data.note + '，' : '') + res.result });
    };
    amr.start({ lang: 'zh_CN', duration: 5000 });
  }, fail: () => wx.showToast({ title:'请授权录音权限', icon:'none' }) });
},
aiOwner(){
  if(!this.data.item){return;}
  wx.showLoading({title:'生成话术中…'});
  genOwnerScript({name:this.data.item.name, note:this.data.note||this.data.instrument||''}).then(r=>{
    wx.hideLoading();
    this.setData({ownerText:r.text});
  }).catch(()=>{wx.hideLoading();wx.showToast({title:'需配置大模型',icon:'none'});});
},
// 类似案例：根据当前检查项匹配历史案例
similarCase(){
  if(!this.data.item){return;}
  const kw = this.data.item.name.replace(/[与和及的]/g,'').slice(0,4);
  const hits = CASES.filter(c => c.title.indexOf(kw)>=0 || c.scene.indexOf(kw)>=0 || c.text.indexOf(kw)>=0).slice(0,2);
  if(!hits.length){ wx.showToast({title:'暂无类似案例',icon:'none'}); return; }
  const content = hits.map((c,i)=>'【案例'+(i+1)+'】'+c.scene+'\n判定：'+c.judge+'\n怎么跟业主说：'+c.say).join('\n\n');
  wx.showModal({ title:'类似案例参考', content, showCancel:false, confirmText:'知道了' });
}
});

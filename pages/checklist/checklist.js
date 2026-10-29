const app = getApp();
const { CATEGORIES, totalItems, judgeMetric } = require('../../utils/inspectData.js');
const { askVision } = require('../../utils/aiEngine.js');
const asr = require('../../utils/asrEngine.js');
const { buildDraft, mergeDraft } = require('../../utils/voiceParser.js');
const fs = require('../../utils/fileStore.js');

// 按房型推荐重点分类
const TYPE_FOCUS = {
  '毛坯房': ['wall', 'floor', 'waterproof', 'water', 'elec', 'ceiling'],
  '精装房': ['finish', 'kitchen', 'bath', 'door', 'ceiling', 'elec', 'water'],
  '二手房': ['resale', 'elec', 'water', 'wall', 'safety', 'waterproof']
};

// 房间类型-检查分类映射
const ROOM_TYPE_MAP = {
  'bedroom': ['wall', 'floor', 'ceiling', 'elec', 'window'],
  'bath': ['waterproof', 'water', 'elec', 'bath', 'safety'],
  'balcony': ['waterproof', 'floor', 'window', 'water'],
  'living': ['wall', 'floor', 'ceiling', 'elec', 'door', 'window'],
  'kitchen': ['waterproof', 'water', 'elec', 'finish', 'kitchen'],
  'entrance': ['door', 'elec', 'safety']
};

// 各房间检查重点（新手引导弹窗动态内容）
const ROOM_MAP = {
  '入户': '入户门/锁/猫眼/强电箱/弱电箱',
  '客厅': '墙面空鼓/地面平整/阴阳角/插座开关',
  '主卧': '墙面/地面/飘窗渗水/插座/空调孔',
  '次卧': '墙面/地面/窗户密封/插座',
  '厨房': '橱柜/水槽/烟道止逆阀/燃气表位置',
  '卫生间': '防水闭水/地漏防臭/角阀软管/马桶下水',
  '阳台': '地面坡度/地漏/栏杆高度/窗户渗水'
};

// 根据户型配置生成房间列表
function buildRooms(roomConfig){
  const {rooms=3, baths=2, balconies=1} = roomConfig || {};
  const list = ['入户', '客厅'];
  // 卧室：主卧+次卧1+次卧2...
  list.push('主卧');
  for(let i=1;i<rooms;i++) list.push('次卧'+i);
  list.push('厨房');
  // 卫生间
  for(let i=1;i<=baths;i++) list.push('卫生间'+i);
  // 阳台
  for(let i=1;i<=balconies;i++) list.push('阳台'+i);
  return list;
}

Page({ data: { cats: [], typeTip:'', doneCount:0, totalCount:0, progress:0, activeType:'', focusMap:{}, rooms:[], currentRoom:'', step:0 },
onShow(){
  const task=app.globalData.currentTask;
  // 根据户型配置生成房间列表（默认3室2卫1阳台）
  const defaultRooms = {rooms:3, baths:2, balconies:1};
  const rooms = buildRooms((task && task.roomConfig) || defaultRooms);
  let tip='', activeType='';
  if(task){
    activeType = task.type||'';
    if(task.type==='精装房')tip='精装重点：橱柜地板·五金·美缝';
    else if(task.type==='二手房')tip='二手房重点：水电老化·渗水·违规改造';
    else tip='毛坯重点：空鼓·防水·平整度';
  }
  const records = (task&&task.records)||{};
  const done = app.countChecked ? app.countChecked(records) : Object.keys(records).length;
  const voiceDrafts = (task && task.voiceDrafts) || [];
  const voicePending = voiceDrafts.filter(d => !d.confirmed).length;
  // 类型排序：重点类靠前并标记
  const focus = TYPE_FOCUS[activeType] || [];
  const sorted = CATEGORIES.slice().sort((a,b)=>{
    const ai = focus.indexOf(a.id), bi = focus.indexOf(b.id);
    if(ai>=0 && bi<0) return -1;
    if(ai<0 && bi>=0) return 1;
    return 0;
  });
  const focusMap = {};
  focus.forEach(f=>focusMap[f]=true);
  let cats = sorted.map(c=>({
    id:c.id, name:c.name, icon:c.icon, focus: !!focusMap[c.id],
    items:c.items.map(it=>{
      const rec = records[it.id];
      return {...it, status: rec?rec.status:'', metricTip: rec?rec.metricTip:'', note: rec?rec.note:'', photos: rec?rec.photos:[]};
    })
  }));
  // 漏检提醒：每个分类还有几项未检（引导集中检查完当前分类）
  cats.forEach(c=>{
    c.left = c.items.filter(it => !it.status).length;
    c.doneCount = c.items.length - c.left;
  });
  // 按房间聚焦：选了房间就把该房间要查的分类排到最前并高亮，
  // 但【不能隐藏其它分类】——检查项库里条目没有房间字段，同一条目在不同房间都要各查一遍，
  // 一旦过滤掉，用户就永远看不到、也永远标不了，直接影响验房Coverage。
  const selectedRoom = this.data.currentRoom || '';
  let roomType = '';
  if(selectedRoom){
    if(selectedRoom.indexOf('入户')>=0) roomType='entrance';
    else if(selectedRoom.indexOf('主卧')>=0||selectedRoom.indexOf('次卧')>=0||selectedRoom.indexOf('卧')>=0) roomType='bedroom';
    else if(selectedRoom.indexOf('卫生间')>=0) roomType='bath';
    else if(selectedRoom.indexOf('阳台')>=0) roomType='balcony';
    else if(selectedRoom.indexOf('厨房')>=0) roomType='kitchen';
    else roomType='living';
  }
  if(roomType){
    const roomCats = ROOM_TYPE_MAP[roomType] || [];
    // 聚焦分类置顶
    cats = cats.slice().sort((a,b)=>{
      const ai = roomCats.indexOf(a.id), bi = roomCats.indexOf(b.id);
      if(ai>=0 && bi<0) return -1;
      if(ai<0 && bi>=0) return 1;
      return 0;
    });
    cats.forEach(c => { c.roomFocus = roomCats.indexOf(c.id) >= 0; });
  }
  this.setData({cats, typeTip:tip, activeType, doneCount:done, totalCount:totalItems, progress:Math.round(done/totalItems*100), fieldMode:wx.getStorageSync('fieldMode')===true, rooms: rooms, voicePending, roomType});
},
// 引导式：选择当前房间
quickRoom(e){
  const room = e.currentTarget.dataset.room;
  const idx = this.data.rooms.indexOf(room);
  this.setData({currentRoom: room, step: idx+1});
  // 重新加载：只显示这个房间要查的项
  this.onShow();
  const mode = wx.getStorageSync('checkMode') || 'beginner';
  // 老师傅模式不弹窗
  if(mode === 'pro'){
    wx.showToast({title: '已定位到'+room, icon:'none'});
    return;
  }
  // 新手模式弹窗提示重点
  const roomFocus = ROOM_MAP[room] || '门/窗/锁、墙面/地面、水电点位';
  wx.showModal({
    title: '📍 现在在' + room,
    content: '这个房间重点查：\n· ' + roomFocus + '\n\n已把本房间的重点分类置顶（其它分类往下翻仍可查），查完点"去下一个房间"。',
    confirmText: '开始查',
    cancelText: '取消'
  });
},
// 下一个房间
nextRoom(){
  const cur = this.data.currentRoom;
  const idx = this.data.rooms.indexOf(cur);
  if(idx < this.data.rooms.length - 1){
    this.setData({currentRoom: this.data.rooms[idx+1], step: idx+2});
    wx.showToast({title: '下一步：'+this.data.rooms[idx+1], icon:'none'});
  } else {
    wx.showModal({title:'全部房间走完', content:'已走完所有房间，去生成报告吧。', confirmText:'去报告', success:()=>{ wx.redirectTo({url:'/pages/report/report'}); }});
  }
},
goDetail(e){ const {id,cat}=e.currentTarget.dataset; wx.navigateTo({url:'/pages/detail/detail?id='+id+'&cat='+cat}); },
// 快速打勾（不用进详情页）
quickMark(e){
  const {id, cat, status} = e.currentTarget.dataset;
  const task = app.globalData.currentTask;
  if(!task){ wx.showToast({title:'请先新建任务', icon:'none'}); return; }
  // 合格直接标
  if(status === 'ok'){
    if(!task.records) task.records = {};
    const prev = task.records[id] || {};
    task.records[id] = { ...prev, status };
    app.saveTask(task);
    wx.showToast({title: '已标记：合格', icon:'none', duration: 1000});
    this.onShow();
    return;
  }
  // 关注/问题：直接调拍照→AI自动识别
  const category = CATEGORIES.find(c=>c.id===cat);
  const item = category && category.items.find(i=>i.id===id);
  const itemName = item ? item.name : '这个问题';
  wx.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sourceType: ['camera', 'album'],
    success: async (r) => {
      // 先持久化照片：临时文件会被系统清理，历史报告照片会变空白
      const photo = await fs.persist(r.tempFiles[0].tempFilePath);
      const shotAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      wx.showLoading({title: 'AI识别问题中…'});
      // 调AI自动识别
      askVision(photo, '验房项：'+itemName+'。请用专业验房语言描述这个问题：部位+现象+程度。50字内。').then(aiText => {
        wx.hideLoading();
        if(!task.records) task.records = {};
        const prev = task.records[id] || {};
        task.records[id] = { ...prev, status, note: aiText, photos: [{ url: photo, shotAt }] };
        app.saveTask(task);
        wx.showToast({title: '已识别：'+aiText.slice(0,10)+'…', icon:'none', duration: 2000});
        this.onShow();
      }).catch(() => {
        wx.hideLoading();
        // AI识别失败，存照片不写描述
        if(!task.records) task.records = {};
        const prev = task.records[id] || {};
        task.records[id] = { ...prev, status, photos: [{ url: photo, shotAt }] };
        app.saveTask(task);
        wx.showToast({title: '已拍照，AI未配置', icon:'none', duration: 1500});
        this.onShow();
      });
    }
  });
},
// ===== 单条口述（按住说话，自动归入当前房间）=====
voiceStart(){
  const task = app.globalData.currentTask;
  if(!task){ wx.showToast({title:'请先新建任务', icon:'none'}); return; }
  if(!asr.getConfig()){
    wx.showModal({title:'语音引擎未配置', content:'需要先配置ASR接口才能口述转文字。', confirmText:'去配置', success:(r)=>{ if(r.confirm) wx.navigateTo({url:'/pages/asr-config/asr-config'}); }});
    return;
  }
  this.rec = asr.createRecorder();
  this.rec.start({
    maxMs: 20000,
    onSegment: (seg) => { this.handleShort(seg); },
    onError: (e) => { this.setData({voiceOn:false}); wx.showToast({title:'录音失败：'+(e&&e.errMsg||'请检查麦克风权限'), icon:'none'}); }
  });
  this.setData({ voiceOn: true });
  wx.vibrateShort && wx.vibrateShort({ type: 'light' });
},
voiceEnd(){
  if (this.rec && this.rec.isRunning()) this.rec.stop();
  this.setData({ voiceOn: false });
},
goVoiceReview(){ wx.navigateTo({ url: '/pages/review/review' }); },
async handleShort(seg){
  try {
    const r = await asr.transcribe(seg.filePath);
    const text = (r.text || '').trim();
    if (!text) { wx.showToast({ title: '没听清，再说一次', icon: 'none' }); return; }
    const draft = await buildDraft(text, this.data.currentRoom);
    if (!draft) { wx.showToast({ title: '解析失败，稍后再试', icon: 'none' }); return; }
    const task = app.globalData.currentTask;
    const m = mergeDraft(task, draft);
    app.saveTask(task);
    if (m.ok) {
      wx.showToast({ title: '✅ 已并入「' + draft.itemName + '」' + (m.count > 1 ? '（第'+m.count+'处）' : ''), icon: 'none', duration: 2000 });
    } else {
      wx.showToast({ title: '⚠️ 已留草稿（待归类）', icon: 'none', duration: 2000 });
    }
    this.onShow();
  } catch (e) {
    if (e && e.msg === 'NO_CONFIG') {
      wx.showModal({ title: '语音引擎未配置', content: e.hint, confirmText: '去配置', success: (m) => { if (m.confirm) wx.navigateTo({ url: '/pages/asr-config/asr-config' }); } });
    } else {
      wx.showToast({ title: '转写失败：' + ((e && e.msg) || '网络'), icon: 'none' });
    }
  }
},
measure(e){
  const { id, cat } = e.currentTarget.dataset;
  const category = CATEGORIES.find(c=>c.id===cat);
  const item = category && category.items.find(i=>i.id===id);
  if(!item || !item.metrics){ return; }
  const m = item.metrics;
  const saveResult = (val, tip, status) => {
    const task = app.globalData.currentTask;
    if(!task){ wx.showToast({title:'请先新建任务', icon:'none'}); return; }
    if(!task.records) task.records = {};
    const prev = task.records[id] || {};
    task.records[id] = { ...prev, status, metricValue: val, metricTip: tip };
    app.saveTask(task);
    const iconMap = { ok:'success', mid:'none', bad:'none' };
    wx.showToast({ title: tip, icon: iconMap[status], duration: 2500 });
    this.onShow();
  };
  // choice 类型：ActionSheet 选选项
  if (m.type === 'choice') {
    const labels = (m.options || []).map(o => o.label);
    const tip = m.measure ? '测量方法：' + m.measure + '\n\n现场观察后选结果：' : '现场观察后选结果：';
    wx.showModal({ title:'测一测：'+item.name, content:tip, confirmText:'去选择', success:(r)=>{
      if(!r.confirm) return;
      wx.showActionSheet({ itemList: labels, success: (r2) => {
        const opt = m.options[r2.tapIndex]; if(!opt) return;
        const result = judgeMetric(m, opt.label);
        saveResult(opt.label, result.tip, result.status);
      }});
    }});
    return;
  }
  // 数值类型：弹窗输入
  wx.showModal({
    title: '测一测：' + item.name,
    editable: true,
    content: m.measure ? '测量方法：' + m.measure : '',
    placeholderText: '如 ' + m.input + '（' + m.unit + '）',
    success: (r) => {
      if(!r.confirm){ return; }
      const result = judgeMetric(m, r.content);
      if(!result){ wx.showToast({title:'请输入数字', icon:'none'}); return; }
      saveResult(r.content.trim(), result.tip, result.status);
    }
  });
}
});

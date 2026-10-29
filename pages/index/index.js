const app = getApp();
const { totalItems } = require('../../utils/inspectData.js');
Page({ data: { greeting:'', user:{}, hasTask:false, task:{}, doneCount:0, totalCount:totalItems, progress:0, pendingFix:0, proactive:'', mode:'beginner' },
onShow(){
  const savedMode = wx.getStorageSync('checkMode') || 'beginner';
  this.setData({mode: savedMode});
  if(typeof this.getTabBar==='function'&&this.getTabBar()) this.getTabBar().setData({selected:0});
  const h=new Date().getHours();
  const g=h<6?'凌晨好':h<12?'上午好':h<14?'中午好':h<18?'下午好':'晚上好';
  const task=app.globalData.currentTask;
  const done = task ? (app.countChecked ? app.countChecked(task.records) : Object.keys(task.records||{}).length) : 0;
  const reports=app.getReports();
  let pf=0;
  reports.forEach(r=>(r.problems||[]).forEach(p=>{if(p.recheck!=='fixed')pf++;}));
  let pro='';
  if(task) pro='正在验 '+task.community+' '+task.room+'，已检 '+done+'/'+totalItems;
  else if(pf>0) pro='你有 '+pf+' 项待复检';
  else {
    const tips=['今天验房重点查空鼓和防水','出门前检查工具带齐','拍照要拍全景和特写','记得开验电插座测每个插座'];
    pro=tips[Math.floor(Math.random()*tips.length)];
  }
  // 新手首次使用：无任务且无历史报告 → 显示三步引导
  const firstTime = !task && reports.length === 0;
  // 未完成任务（新建别的单子时暂存的），允许一键继续
  const unfinished = (app.getUnfinishedTasks ? app.getUnfinishedTasks() : [])
    .filter(x => !(task && x.community === task.community && x.room === task.room))
    .map(x => ({ community: x.community, room: x.room, done: Object.keys(x.records || {}).length, date: x.date }));
  this.setData({greeting:g,user:app.globalData.userInfo,hasTask:!!task,task:task||{},doneCount:done,progress:Math.round(done/totalItems*100),pendingFix:pf,proactive:pro,firstTime,fieldMode:wx.getStorageSync('fieldMode')===true,unfinished});
},
onTaskCard(){ if(this.data.hasTask) this.goChecklist(); else this.newTask(); },
// 切换验房模式
setMode(e){
  const mode = e.currentTarget.dataset.mode;
  if (app.safeSet) app.safeSet('checkMode', mode); else wx.setStorageSync('checkMode', mode);
  this.setData({mode});
  wx.showToast({title: mode==='beginner'?'新手引导模式':'老师傅模式', icon:'none'});
},
newTask(){
  const cur = app.globalData.currentTask;
  // 当前已有检查内容却还没出报告：先确认，绝不能静默覆盖导致整单数据丢失
  if (cur && app.taskHasProgress && app.taskHasProgress(cur)) {
    wx.showModal({
      title: '当前还有未完成的验房',
      content: (cur.community || '') + ' ' + (cur.room || '') + ' 已检 ' + Object.keys(cur.records || {}).length + ' 项，尚未生成报告。\n\n新建会把它存到「未完成任务」，可随时继续。',
      confirmText: '新建并暂存',
      cancelText: '先去出报告',
      success: (r) => {
        if (!r.confirm) { wx.navigateTo({ url: '/pages/report/report' }); return; }
        app.stashUnfinishedTask();
        this.askType();
      }
    });
    return;
  }
  this.askType();
},
askType(){
  wx.showActionSheet({itemList:['毛坯房','精装房','二手房'],success:(res)=>{
    const types=['毛坯房','精装房','二手房'];
    this.pickRooms(types[res.tapIndex]);
  }});
},
// 选择房间数量配置
pickRooms(type){
  wx.showModal({
    title:'户型配置',
    content:'几室？（如2/3/4）',
    editable:true,
    placeholderText:'如 3',
    success:(r)=>{
      if(!r.confirm||!r.content) return;
      const rooms = parseInt(r.content)||3;
      wx.showModal({
        title:'几卫？',
        content:'几个卫生间？（如1/2/3）',
        editable:true,
        placeholderText:'如 2',
        success:(r2)=>{
          if(!r2.confirm||!r2.content) return;
          const baths = parseInt(r2.content)||2;
          wx.showModal({
            title:'几阳台？',
            content:'几个阳台？（如1/2）',
            editable:true,
            placeholderText:'如 1',
            success:(r3)=>{
              if(!r3.confirm||!r3.content) return;
              const balconies = parseInt(r3.content)||1;
              this.roomConfig = {rooms, baths, balconies, type};
              this.pickCommunity(type);
            }
          });
        }
      });
    }
  });
},
pickCommunity(type){
  wx.showModal({title:'小区名称',editable:true,placeholderText:'如 江山壹号',success:(r)=>{if(!r.confirm||!r.content){wx.showToast({title:'请输入小区名',icon:'none'});return;}
    const community = r.content.trim();
    const exp = app.getCommunityExperience(community);
    const go = () => {
      wx.showModal({title:'房号',editable:true,placeholderText:'如 1栋2单元301',success:(r2)=>{if(!r2.confirm||!r2.content){wx.showToast({title:'请输入房号',icon:'none'});return;}
        this.pickOwner({community,room:r2.content,type:type,date:new Date().toISOString().slice(0,10),records:{}, roomConfig: this.roomConfig || {rooms:3,baths:2,balconies:1}});
      }});
    };
    if (exp) {
      const topStr = exp.top.map(t => t.name + '×' + t.n).join('、');
      wx.showModal({
        title: '📚 本小区历史经验',
        content: '你在这个小区已验过 ' + exp.count + ' 次（最近 ' + (exp.lastDate||'—') + '）\n高频问题：' + topStr + '\n这次重点留意这些位置。',
        confirmText: '开始验房',
        cancelText: '修改小区',
        success: (m) => { if (m.confirm) go(); }
      });
    } else {
      go();
    }
  }});
},
pickOwner(task){
  wx.showModal({title:'业主称呼（可跳过）',editable:true,placeholderText:'如 李先生',success:(r3)=>{
    task.clientName = r3.confirm ? (r3.content||'') : '';
    if(!task.clientName){ app.saveTask(task); wx.navigateTo({url:'/pages/checklist/checklist'}); return; }
    wx.showModal({title:'业主电话（可跳过）',editable:true,placeholderText:'便于复检联系',success:(r4)=>{
      task.clientPhone = r4.confirm ? (r4.content||'') : '';
      app.saveTask(task); wx.navigateTo({url:'/pages/checklist/checklist'});
    }});
  }});
},
// 恢复一张未完成任务
resumeTask(e){
  const { community, room } = e.currentTarget.dataset;
  const hit = (app.getUnfinishedTasks() || []).find(x => x.community === community && x.room === room);
  if (!hit) { wx.showToast({ title: '任务已不存在', icon: 'none' }); return; }
  const cur = app.globalData.currentTask;
  // 当前也有进度的话，先把它也存起来，避免互相覆盖
  if (cur && app.taskHasProgress(cur)) app.stashUnfinishedTask();
  const task = Object.assign({}, hit);
  delete task.stashedAt;
  app.saveTask(task);
  app.removeUnfinishedTask(community, room);
  wx.showToast({ title: '已恢复任务', icon: 'success' });
  wx.navigateTo({ url: '/pages/checklist/checklist' });
},
goChecklist(){wx.navigateTo({url:'/pages/checklist/checklist'});},
goReport(){ if(!app.globalData.currentTask){ wx.showToast({title:'请先新建验房任务',icon:'none'}); return; } wx.navigateTo({url:'/pages/report/report'});},
goHistory(){wx.navigateTo({url:'/pages/history/history'});},
goClients(){wx.navigateTo({url:'/pages/clients/clients'});},
goRecheck(){wx.navigateTo({url:'/pages/recheck/recheck'});},
goCases(){wx.navigateTo({url:'/pages/cases/cases'});},
goTools(){wx.navigateTo({url:'/pages/tools/tools'});},
goVoice(){
  if(!app.globalData.currentTask){ wx.showToast({title:'请先新建验房任务',icon:'none'}); return; }
  wx.navigateTo({url:'/pages/voice/voice'});
},
showTools(){ this.goTools(); },
showCases(){wx.navigateTo({url:'/pages/cases/cases'});}
});

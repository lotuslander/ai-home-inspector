// app.js - AI 验房师全局逻辑
// 架构：纯端侧小程序。数据全部存用户手机本地，大模型由用户自申请API Key配置。
// 不做云端部署：无云函数、无云数据库、无云端备份。将来收集数据再另行规划。
App({
  globalData: {
    currentTask: null,
    shareReportNo: '',
    userInfo: { name: '', company: '', logoPath: '', phone: '', certNo: '', certOrg: '', plan: 'free' }
  },

  onLaunch() {
    this.parseShare();
    this.checkBuildConfig();

    try {
      const task = wx.getStorageSync('currentTask');
      if (task) this.globalData.currentTask = task;
      // currentTask 丢失但草稿还在（异常退出/被清理）时，用草稿兜底恢复
      if (!task) {
        const draft = wx.getStorageSync('taskDraft');
        if (draft) { this.globalData.currentTask = draft; this.safeSet('currentTask', draft); }
      }
      let user = wx.getStorageSync('userInfo');
      if (!user) {
        user = Object.assign(this.globalData.userInfo, {});
        this.safeSet('userInfo', user);
      }
      this.globalData.userInfo = user;
    } catch (e) {}

    // 第一次启动：弹隐私政策+版权声明
    const agreed = wx.getStorageSync('agreedPolicy');
    if (!agreed) {
      wx.showModal({
        title: '欢迎使用AI验房师',
        content: '【隐私政策】\n1. 你的所有报告、客户数据存在你自己手机本地，本小程序不上传任何数据\n2. 大模型接口由你自己申请配置，对话内容直接发给你配置的模型服务商\n3. 不收集你的位置、通讯录等敏感信息\n\n【版权声明】\n本小程序由AI验房师团队开发，版权所有，未经授权不得复制传播。\n\n点击"同意"即表示你已阅读并同意以上条款。',
        confirmText: '同意并开始使用',
        cancelText: '不同意退出',
        success: (r) => {
          if (r.confirm) {
            this.safeSet('agreedPolicy', true);
          } else {
            wx.exitMiniProgram();
          }
        }
      });
    }

    const consented = wx.getStorageSync('dataConsent');
    if (consented !== true && consented !== false) {
      wx.showModal({
        title: '数据使用授权',
        content: '是否允许将匿名验房数据（去掉姓名电话房号）保存到本机，供将来小程序功能改进使用？不影响正常使用，可随时在"我的"中关闭。',
        confirmText: '同意', cancelText: '暂不同意',
        success: (r) => { this.safeSet('dataConsent', r.confirm); }
      });
    }
  },

  onShow(o) {
    if (o && o.query && o.query.no) this.globalData.shareReportNo = o.query.no;
  },

  // 解析冷启动分享参数 /pages/share/share?no=xxx
  parseShare() {
    try {
      const info = wx.getLaunchOptionsSync();
      if (info && info.query && info.query.no) this.globalData.shareReportNo = info.query.no;
    } catch (e) {}
  },

  // 上线前配置自检：在开发者工具/体验版里明确提示尚未替换的占位配置，
  // 避免"本地跑得好好的、上线后接口全挂"这类问题到了用户手里才发现。
  checkBuildConfig() {
    try {
      const info = (wx.getAccountInfoSync && wx.getAccountInfoSync()) || {};
      const mini = info.miniProgram || {};
      // touristappid = 未填 AppID 的游客模式；wxYOUR_APPID_HERE = 模板占位符
      const appId = mini.appId || '';
      const isPlaceholder = !appId || appId === 'touristappid' || /YOUR_APPID/i.test(appId);
      if (!isPlaceholder) return;
      console.warn('[配置] 当前为占位/游客 AppID（' + (appId || '空') + '），仅可用于本地预览；上线前必须替换为正式 AppID 并配置服务器域名。');
      // 只在开发/体验版提示，正式版用户不应看到
      const env = mini.envVersion || 'develop';
      if (env === 'release') return;
      wx.showModal({
        title: '⚠️ 尚未配置正式 AppID',
        content: '当前为占位 AppID，接口调用会失败。\n\n上线前请：\n1. project.config.json 填入正式 AppID\n2. 公众平台登记服务器域名（见「服务器域名配置.md」）',
        showCancel: false,
        confirmText: '知道了'
      });
    } catch (e) {
      // 老版本基础库没有 getAccountInfoSync，忽略即可
    }
  },

  genReportNo() {
    const d = new Date();
    const pad = n => String(n).padStart(2,'0');
    return 'YF-' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '-' + Math.floor(1000+Math.random()*9000);
  },

  // 安全写存储：容量超限(10MB)时 setStorageSync 会抛异常，未捕获会导致当前操作直接中断。
  // 返回 true/false，调用方可据此给出可操作提示，而不是静默失败。
  safeSet(key, val) {
    try {
      wx.setStorageSync(key, val);
      return true;
    } catch (e) {
      wx.showModal({
        title: '本机存储空间不足',
        content: '微信小程序本地存储上限为 10MB。请到「我的 → 本地数据备份」导出备份后，再清理历史报告释放空间。',
        showCancel: false
      });
      return false;
    }
  },

  saveUserInfo(u) { this.globalData.userInfo = u; this.safeSet('userInfo', u); },
  saveTask(t) {
    this.globalData.currentTask = t;
    this.safeSet('currentTask', t);
    // 同步一份未完成草稿：.onLaunch 里据此恢复，避免冷启动/切后台后被清空
    if (t) this.safeSet('taskDraft', Object.assign({ draftSavedAt: Date.now() }, t));
  },
  // 已检项数：只有真正打了状态的项才算"已检"。
  // detail.js 允许只拍照/只写备注而不选合格与否，这类记录 status 为空，
  // 若按 Object.keys(records).length 统计，进度会虚高、清单却显示未标记，前后自相矛盾。
  countChecked(records) {
    return Object.keys(records || {}).filter(k => {
      const s = records[k] && records[k].status;
      return s === 'ok' || s === 'mid' || s === 'bad';
    }).length;
  },
  // 任务是否有实际检查内容（只有空壳任务才允许被直接覆盖）
  taskHasProgress(t) {
    if (!t) return false;
    const n = Object.keys(t.records || {}).length;
    const v = (t.voiceDrafts || []).length;
    return n > 0 || v > 0;
  },
  // 新建任务前调用：当前有未出报告的任务时，先归档到"未完成"列表，绝不静默丢弃
  stashUnfinishedTask() {
    const t = this.globalData.currentTask;
    if (!this.taskHasProgress(t)) return;
    try {
      const list = wx.getStorageSync('unfinishedTasks') || [];
      // 同小区同房号视为同一任务的再次进入，覆盖旧快照
      const idx = list.findIndex(x => x.community === t.community && x.room === t.room);
      const snapshot = Object.assign({ stashedAt: Date.now() }, t);
      if (idx >= 0) list[idx] = snapshot; else list.unshift(snapshot);
      this.safeSet('unfinishedTasks', list.slice(0, 20));
    } catch (e) {}
  },
  getUnfinishedTasks() { try { return wx.getStorageSync('unfinishedTasks') || []; } catch (e) { return []; } },
  removeUnfinishedTask(community, room) {
    try {
      const list = (wx.getStorageSync('unfinishedTasks') || [])
        .filter(x => !(x.community === community && x.room === room));
      wx.setStorageSync('unfinishedTasks', list);
    } catch (e) {}
  },
  getReports() { try { return wx.getStorageSync('reports') || []; } catch(e) { return []; } },
  pushReport(r) { const l = this.getReports(); l.unshift(r); this.safeSet('reports', l); this.learnFromReport(r); },
  // ===== 个人经验自沉淀：按小区×问题类型自动累计 =====
  learnFromReport(r) {
    try {
      // 幂等保护：同一报告号只累计一次，避免调用方重复调用导致统计翻倍
      const learned = wx.getStorageSync('learnedNos') || [];
      if (r && r.reportNo) {
        if (learned.indexOf(r.reportNo) >= 0) return;
        learned.unshift(r.reportNo);
        this.safeSet('learnedNos', learned.slice(0, 500));
      }
      const my = wx.getStorageSync('myCases') || {};
      const key = (r.community || '未知小区').trim();
      if (!my[key]) my[key] = { count: 0, problems: {} };
      my[key].count += 1;
      my[key].lastDate = r.date;
      (r.problems || []).forEach(p => {
        const name = p.name || '未知';
        my[key].problems[name] = (my[key].problems[name] || 0) + 1;
      });
      this.safeSet('myCases', my);
    } catch (e) {}
  },
  // 查某小区历史经验（新建任务时提示用）
  getCommunityExperience(community) {
    try {
      const my = wx.getStorageSync('myCases') || {};
      const hit = my[(community || '').trim()];
      if (!hit || !hit.count) return null;
      const top = Object.keys(hit.problems)
        .map(k => ({ name: k, n: hit.problems[k] }))
        .sort((a, b) => b.n - a.n).slice(0, 5);
      return { count: hit.count, lastDate: hit.lastDate, top };
    } catch (e) { return null; }
  },
  updateReport(reportNo, patch) {
    const l = this.getReports();
    const i = l.findIndex(r => r.reportNo === reportNo);
    if (i < 0) return;
    l[i] = Object.assign({}, l[i], patch);
    this.safeSet('reports', l);
  },
  // 复检跟踪：取所有未整改的问题
  getRechecks() {
    const out = [];
    this.getReports().forEach(r => {
      (r.problems || []).forEach((p, pi) => {
        if (p.recheck !== 'fixed') {
          out.push({ reportNo: r.reportNo, community: r.community, room: r.room, date: r.date, pi, ...p });
        }
      });
    });
    return out;
  }
});

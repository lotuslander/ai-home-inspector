// pages/review/review.js - 语音草稿矫正页
const app = getApp();
const { matchItem, mergeDraft } = require('../../utils/voiceParser.js');
const fs = require('../../utils/fileStore.js');

Page({
  data: { task: null, drafts: [], pendingCount: 0, confirmedCount: 0, riskText: { high: '严重', mid: '一般', low: '轻微' } },

  onShow() { this.reload(); },

  reload() {
    const task = app.globalData.currentTask;
    const drafts = (task && task.voiceDrafts) || [];
    this.setData({
      task,
      drafts,
      pendingCount: drafts.filter(d => !d.confirmed).length,
      confirmedCount: drafts.filter(d => d.confirmed).length
    });
  },

  save(drafts) {
    const task = app.globalData.currentTask;
    if (!task) return;
    task.voiceDrafts = drafts;
    app.saveTask(task);
    this.reload();
  },

  // 确认并入清单：走公共mergeDraft（防覆盖合并，与口述自动归档同一逻辑）
  confirmDraft(e) {
    const id = e.currentTarget.dataset.id;
    const drafts = this.data.drafts.slice();
    const d = drafts.find(x => x.id === id);
    if (!d || !app.globalData.currentTask) return;
    if (!d.itemId) {
      wx.showModal({
        title: '该条未匹配检查项',
        content: 'AI没找到对应检查项，请先「修正」选择类别与条目，或删除。',
        showCancel: false
      });
      return;
    }
    const task = app.globalData.currentTask;
    const r = mergeDraft(task, d);
    app.saveTask(task);
    this.save(drafts);
    if (r.ok) wx.showToast({ title: '已并入「' + d.itemName + '」' + (r.count > 1 ? '（第' + r.count + '处）' : ''), icon: 'success' });
  },

  confirmAll() {
    const drafts = this.data.drafts.slice();
    let n = 0, miss = 0;
    const task = app.globalData.currentTask;
    if (!task) { wx.showToast({ title: '请先新建验房任务', icon: 'none' }); return; }
    drafts.forEach(d => {
      if (d.confirmed) return;
      if (!d.itemId) { miss++; return; }
      const r = mergeDraft(task, d);
      if (r.ok) n++;
    });
    app.saveTask(task);
    this.save(drafts);
    if (miss) wx.showModal({ title: '完成', content: '已并入 ' + n + ' 条，' + miss + ' 条未匹配需手动修正。', showCancel: false });
    else wx.showToast({ title: '已并入 ' + n + ' 条', icon: 'success' });
  },

  // 修正：改房间 / 重选检查项 / 改问题描述
  fixDraft(e) {
    const id = e.currentTarget.dataset.id;
    const d = this.data.drafts.find(x => x.id === id);
    if (!d) return;
    const self = this;
    wx.showActionSheet({
      itemList: ['修改问题描述', '重新选择检查项', '修改房间'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({ title: '问题描述', editable: true, content: d.problem, placeholderText: '描述问题…', success: (m) => {
            if (m.confirm && m.content) {
              d.problem = m.content;
              const dm = matchItem({ item: d.itemName, category: d.catName, problem: d.problem });
              if (dm) { d.catId = dm.catId; d.catName = dm.catName; d.itemId = dm.itemId; d.itemName = dm.itemName; d.matched = true; }
              self.save(self.data.drafts.slice());
            }
          }});
        } else if (res.tapIndex === 1) {
          self.pickItem(d);
        } else {
          wx.showActionSheet({
            itemList: ['入户', '客厅', '主卧', '次卧', '厨房', '卫生间', '阳台', '书房', '餐厅'],
            success: (m2) => {
              d.room = ['入户', '客厅', '主卧', '次卧', '厨房', '卫生间', '阳台', '书房', '餐厅'][m2.tapIndex];
              self.save(self.data.drafts.slice());
            }
          });
        }
      }
    });
  },

  // 选择检查项（分类→条目两级）
  // wx.showActionSheet 最多 6 项，而检查类别有 18 类、单类最多 9 项，
  // 原来直接 slice(0,6) 会导致后 12 类、以及"门窗/墙面"等前 6 类里第 7 项之后的内容永远选不到。
  // 这里改为分页：每次最多列 5 项 + "更多"，直到选完。
  pickItem(d) {
    if (!d) return;
    const { CATEGORIES } = require('../../utils/inspectData.js');
    const self = this;
    const PAGE = 5;
    const pickFromList = (list, onDone) => {
      const pageOf = (offset) => {
        const slice = list.slice(offset, offset + PAGE);
        const hasMore = offset + PAGE < list.length;
        const itemList = slice.map(x => x.label);
        if (hasMore) itemList.push('更多…（还有 ' + (list.length - offset - PAGE) + ' 项）');
        wx.showActionSheet({
          itemList,
          success: (res) => {
            if (hasMore && res.tapIndex === slice.length) return pageOf(offset + PAGE);
            const chosen = slice[res.tapIndex];
            if (chosen) onDone(chosen);
          }
        });
      };
      pageOf(0);
    };
    pickFromList(CATEGORIES.map(c => ({ label: c.name, data: c })), (catPick) => {
      const cat = catPick.data;
      pickFromList(cat.items.map(it => ({ label: it.name, data: it })), (itPick) => {
        const it = itPick.data;
        d.catId = cat.id; d.catName = cat.name; d.itemId = it.id; d.itemName = it.name; d.matched = true;
        self.save(self.data.drafts.slice());
        wx.showToast({ title: '已归类到「' + it.name + '」', icon: 'none' });
      });
    });
  },

  delDraft(e) {
    const id = e.currentTarget.dataset.id;
    const self = this;
    wx.showModal({ title: '删除该草稿？', content: '删除后不可恢复', confirmText: '删除', confirmColor: '#FF3B30', success: (m) => {
      if (m.confirm) self.save(self.data.drafts.filter(x => x.id !== id));
    }});
  },

  // 补照片（可多选，统一对象格式含拍摄时间戳，与全项目一致）
  addPhoto(e) {
    const id = e.currentTarget.dataset.id;
    const self = this;
    wx.chooseMedia({
      count: 9, mediaType: ['image'], sourceType: ['album', 'camera'],
      success: async (r) => {
        // 持久化：临时文件过期后照片会打不开
        const shotAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const paths = await Promise.all(r.tempFiles.map(f => fs.persist(f.tempFilePath)));
        const photos = paths.map(url => ({ url, shotAt }));
        const drafts = self.data.drafts.slice();
        const d = drafts.find(x => x.id === id);
        if (d) d.photos = (d.photos || []).concat(photos);
        self.save(drafts);
      }
    });
  },

  previewPhoto(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    wx.previewImage({ urls: [src], current: src });
  },

  goChecklist() { wx.navigateTo({ url: '/pages/checklist/checklist' }); }
});

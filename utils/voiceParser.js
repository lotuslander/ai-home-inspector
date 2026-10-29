// utils/voiceParser.js - 语音转结构化条目（纯端侧）
// 把ASR转写文本 → {room, catId, itemId, itemName, location, problem, risk}
// 用RAG/LLM抽取语义，再本地匹配检查项ID；匹配不到则留待矫正页手工归类
const { CATEGORIES } = require('./inspectData.js');
const { askSmart } = require('./aiEngine.js');

// 房间别名归一
const ROOM_ALIAS = {
  '入户': ['入户','门口','玄关','大门'], '客厅': ['客厅','厅'], '主卧': ['主卧','主卧室'],
  '次卧': ['次卧','次卧室','卧室'], '厨房': ['厨房','厨'], '卫生间': ['卫生间','厕所','洗手间','卫'],
  '阳台': ['阳台','晾台'], '书房': ['书房'], '餐厅': ['餐厅','饭厅']
};

// 语音草稿的风险等级 → 清单检查项状态（全项目统一用 ok/mid/bad）
const RISK_TO_STATUS = { high: 'bad', mid: 'mid', low: 'mid' };
// 多处描述拼接分隔符（全角竖线，避免与描述内部的"；"冲突）
const SEP = '｜';
function segText(draft) { return (draft.location ? draft.location + '；' : '') + (draft.problem || ''); }

function normRoom(name) {
  if (!name) return '';
  const n = String(name).trim();
  for (const k in ROOM_ALIAS) {
    if (ROOM_ALIAS[k].some(a => n.indexOf(a) >= 0)) return k;
  }
  return n;
}

// 用LLM抽取结构化信息
async function parseText(text, roomHint) {
  const prompt = '你是验房记录助手。把下面这句验房师口述，抽取为结构化JSON（只输出JSON）：\n'
    + '{"room":"房间名（如 主卧/客厅/卫生间）","category":"所属检查类别（如 墙面/地面/防水/水电/门窗）","item":"检查项名","location":"具体位置描述","problem":"问题描述","risk":"high/mid/low（严重/一般/轻微）"}\n'
    + '口述：' + (roomHint ? ('（当前在' + roomHint + '）') : '') + text;
  try {
    const r = await askSmart(prompt);
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return {
      room: normRoom(j.room),
      category: (j.category || '').trim(),
      item: (j.item || '').trim(),
      location: (j.location || '').trim(),
      problem: (j.problem || text).trim(),
      risk: ['high', 'mid', 'low'].indexOf(j.risk) >= 0 ? j.risk : 'mid'
    };
  } catch (e) { return null; }
}

// 在检查项库里匹配 catId + itemId（文本相似）
function matchItem(parsed) {
  if (!parsed) return null;
  const q = (parsed.item + parsed.category + parsed.problem).replace(/\s/g, '');
  let best = null, bestScore = 0;
  CATEGORIES.forEach(c => {
    c.items.forEach(it => {
      const name = String(it.name || '').replace(/\s/g, '');
      const catName = String(c.name || '').replace(/\s/g, '');
      let score = 0;
      if (q.indexOf(name) >= 0) score += 2;
      if (name && q.indexOf(name.slice(0, 2)) >= 0) score += 0.5;
      if (catName && q.indexOf(catName) >= 0) score += 1;
      // 关键词：问题描述里出现检查项关键词
      if (score > bestScore) { bestScore = score; best = { catId: c.id, catName: c.name, itemId: it.id, itemName: it.name }; }
    });
  });
  return bestScore >= 1.5 ? best : null;
}

// 完整管线：文本 → 草稿对象
async function buildDraft(text, roomHint) {
  const parsed = await parseText(text, roomHint);
  if (!parsed) return null;
  const m = matchItem(parsed);
  return {
    id: 'v' + Date.now() + Math.floor(Math.random() * 1000),
    room: parsed.room || roomHint || '',
    catId: m ? m.catId : '',
    catName: m ? m.catName : (parsed.category || ''),
    itemId: m ? m.itemId : '',
    itemName: m ? m.itemName : (parsed.item || ''),
    location: parsed.location,
    problem: parsed.problem,
    risk: parsed.risk,
    ts: new Date().toLocaleString('zh-CN', { hour12: false }),
    photos: [],
    confirmed: false,
    matched: !!m,
    raw: text
  };
}

// 自动归档到清单（voice页与checklist页共用）
// 防覆盖：同一检查项已存在时合并描述（去重）、照片合并、等级取更严重
// 返回 {ok, count}：ok=是否匹配并入，count=该检查项累计描述处数
function mergeDraft(task, draft) {
  if (!task) return { ok: false, count: 0 };
  const drafts = (task.voiceDrafts || []).slice();
  if (!drafts.some(x => x.id === draft.id)) drafts.push(draft); // 防重复（review页确认时草稿已存在）
  task.voiceDrafts = drafts;
  if (!(draft.matched && draft.itemId)) return { ok: false, count: 0 };
  const records = task.records || {};
  const seg = segText(draft);
  // 状态用 'ok'|'mid'|'bad'（清单/报告全项目统一），草稿的 risk 是 'high'|'mid'|'low'，
  // 必须先换算，否则会把 'high'/'low' 直接写进 status，导致清单图标不显示、报告统计漏项。
  const level = { ok: 1, mid: 2, bad: 3 };
  const status = RISK_TO_STATUS[draft.risk] || 'bad';
  const prev = records[draft.itemId];
  if (prev && prev.status) {
    const dup = (prev.note || '').indexOf(seg) >= 0;
    const rec = {
      status: (level[prev.status] || 1) >= (level[status] || 1) ? prev.status : status,
      note: dup ? prev.note : ((prev.note ? prev.note + SEP : '') + seg),
      photos: (prev.photos || []).concat(draft.photos || []),
      fromVoice: true
    };
    // 保留原测量值（测数值标记不能丢）
    if (prev.metricTip) rec.metricTip = prev.metricTip;
    if (prev.metricValue) rec.metricValue = prev.metricValue;
    records[draft.itemId] = rec;
  } else {
    records[draft.itemId] = { status, note: seg, photos: draft.photos || [], fromVoice: true };
  }
  task.records = records;
  draft.confirmed = true;
  return { ok: true, count: (records[draft.itemId].note || '').split(SEP).length };
}

// 撤销自动并入：从records移除本条描述，草稿保留待重新归类
// 注意：note 的拼接分隔符是 '｜'（全角竖线），不能再用 '；'——
// 因为每一条描述本身形如"位置；问题"，用 '；' 当分隔符会把单条描述切碎，撤销时误删/残留。
function unmergeDraft(task, draft) {
  if (!task || !draft) return false;
  const rec = draft.itemId && task.records && task.records[draft.itemId];
  if (rec) {
    const seg = segText(draft);
    const parts = (rec.note || '').split(SEP).filter(p => p && p !== seg);
    if (parts.length) rec.note = parts.join(SEP);
    else delete task.records[draft.itemId];
  }
  draft.confirmed = false;
  return true;
}

module.exports = { buildDraft, matchItem, normRoom, mergeDraft, unmergeDraft, ROOM_ALIAS };

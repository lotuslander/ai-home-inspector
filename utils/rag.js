// utils/rag.js - 本地RAG检索引擎 v2
const { NORMS, CASES, LEGAL, TEST_METHODS, GLOSSARY } = require('./inspectData.js');
const llm = require('./llmConfig.js');

const SYNONYMS = {
  '漏水': ['渗水','渗漏','滴水','水渍','发霉','霉斑','返潮','阴湿','泡水'],
  '空鼓': ['空响','脱层','脱落','起鼓','敲着空'],
  '裂缝': ['开裂','裂纹','裂','斜缝','裂痕'],
  '插座': ['电源','插孔','没电','相位','插板'],
  '防水': ['闭水','蓄水','防水层','防水高度','闭水试验'],
  '栏杆': ['护栏','扶手','防护栏','窗台','栏板'],
  '隔音': ['隔声','噪音','噪声','吵'],
  '甲醛': ['环保','污染','VOC','TVOC','苯','气味','味道'],
  '地暖': ['暖气','采暖','分水器','压力表','地热'],
  '玻璃': ['3C','钢化','落地窗'],
  '入户门': ['门','门套','合页','门锁','门缝','门歪'],
  '外窗': ['窗','推拉窗','密封条','打胶','窗户','窗漏'],
  '墙面': ['墙','抹灰','腻子','墙皮','墙裂'],
  '地面': ['地','地板','地砖','找平','起砂'],
  '顶面': ['顶','吊顶','天花板','顶裂'],
  '卫生间': ['厕所','淋浴','洗手间'],
  '厨房': ['烟道','止逆阀','橱柜'],
  '配电箱': ['电箱','空开','漏保','RCD','接地','电闸'],
  '水管': ['给水','排水','水龙头','地漏','下水管','上水'],
  '燃气': ['煤气','天然气','排烟管','燃气表'],
  '层高': ['净高','高度'],
  '面积': ['公摊','套内','平方'],
  '消防': ['防火','灭火器','疏散','消防通道'],
  '验房': ['收房','看房','验屋','收楼'],
  '毛坯': ['清水房'],
  '精装': ['精装修','拎包住'],
  '整改': ['维修','返工'],
  '保修': ['质保','保修期'],
  '开发商': ['楼盘','物业'],
  '等电位': ['LEB'],
  '烟道': ['排烟','串味'],
  '地暖': ['盘管','地热','采暖','分集水器','打压'],
  '新风': ['新风量','送风','回风','换气','风量'],
  '玻璃': ['3C','钢化','自爆'],
  '防盗门': ['防火门','入户门','甲级','乙级','铭牌'],
  '地漏': ['返臭','防臭','水封','返味'],
  '排烟管': ['燃气','热水器','PVC','金属管'],
  '楼板': ['厚度','测厚'],
  '裂缝': ['斜向','竖向','沉降缝','结构'],
  '防水': ['闭水','蓄水','防水层','防水高度','闭水试验','渗漏'],
  '空鼓': ['空响','脱层','脱落','起鼓','敲着空','空鼓率'],
  '隔声': ['隔音','噪音','噪声','吵','分户墙'],
  '气密': ['密封','漏风','结露','水密'],
  '采暖': ['暖气','供暖','试压','保压'],
  '验收': ['收房','交付','分户验收','竣工验收'],
  '承重墙': ['结构','拆墙','砸墙','飘窗','阳台改'],
  '电': ['插座','漏保','空开','配电箱','接地','相位','等电位']
};

function expandQuery(q) {
  const words = [q];
  Object.keys(SYNONYMS).forEach(k => {
    if (q.includes(k)) SYNONYMS[k].forEach(s => words.push(s));
    SYNONYMS[k].forEach(s => { if (q.includes(s)) words.push(k); });
  });
  return [...new Set(words)];
}

function score(text, queries, isTitle) {
  let s = 0;
  let hitCount = 0;
  let bigramHits = 0;
  queries.forEach(q => {
    if (q.length < 2) return;
    if (text.includes(q)) { s += isTitle ? 15 : 8; hitCount++; }
    for (let i = 0; i < q.length - 1; i++) {
      const bg = q.slice(i, i + 2);
      if (text.includes(bg)) { s += isTitle ? 3 : 1.5; bigramHits++; }
    }
  });
  // 与查询毫无实质交集时不参与排序。
  // 原来"强条"是无条件加 8 分，导致任何强条条文在完全不相关的问题上也能拿到 mid 置信度，
  // 从而把"知识库没覆盖"的问题误判成"已命中"，用户拿到一堆驴唇不对马嘴的条文。
  // 另外中文二字词（如"存在"）极易偶然命中，单个 bigram 不足以判定相关，至少要 2 个。
  if (!hitCount && bigramHits < 2) return 0;
  // 强条/高风险条文额外加权（仅在确实命中后，提升权威条文的排序）
  if (text.includes('强条') || text.includes('必须') || text.includes('严禁')) s += 8;
  // 多词同时命中显著加分（问题往往由多个关键词构成）
  if (hitCount >= 3) s += 6;
  else if (hitCount === 2) s += 3;
  return s;
}

function confidence(s) { return s >= 20 ? 'high' : s >= 8 ? 'mid' : 'low'; }

function search(q) {
  if (!q || !q.trim()) return { norms: [], cases: [], legal: [], methods: [], terms: [] };
  const queries = expandQuery(q.trim());
  const results = { norms: [], cases: [], legal: [], methods: [], terms: [] };

  NORMS.forEach(n => {
    let bestPoint = null, bestScore = 0;
    n.points.forEach(p => {
      const s = score(p, queries, false);
      if (s > bestScore) { bestScore = s; bestPoint = p; }
    });
    if (bestScore > 0) results.norms.push({ code: n.code, name: n.name, point: bestPoint, score: bestScore, conf: confidence(bestScore) });
  });
  results.norms.sort((a, b) => b.score - a.score);

  CASES.forEach(c => {
    const ts = score((c.title||'') + (c.judge||''), queries, true);
    const bs = score((c.scene||'') + (c.say||'') + (c.text||''), queries, false);
    const s = ts + bs;
    if (s > 0) results.cases.push({ ...c, score: s, conf: confidence(s) });
  });
  results.cases.sort((a, b) => b.score - a.score);

  if (LEGAL) LEGAL.forEach(l => {
    let bestPoint = null, bestScore = 0;
    l.points.forEach(p => {
      const s = score(p, queries, false);
      if (s > bestScore) { bestScore = s; bestPoint = p; }
    });
    if (bestScore > 0) results.legal.push({ law: l.law, point: bestPoint, score: bestScore, conf: confidence(bestScore) });
  });

  if (TEST_METHODS) TEST_METHODS.forEach(m => {
    const s = score((m.problem||'') + (m.tool||'') + (m.method||'') + (m.pass||''), queries, false);
    if (s > 0) results.methods.push({ ...m, score: s, conf: confidence(s) });
  });
  results.methods.sort((a, b) => b.score - a.score);

  if (GLOSSARY) GLOSSARY.forEach(t => {
    const text = (t.term||'') + (t.explain||'');
    let s = 0, hitCount = 0;
    queries.forEach(q => {
      if (q.length < 2) return;
      if (text.includes(q)) { s += (text.startsWith(q) || text.includes(t.term + '：' + q) || t.term.includes(q)) ? 20 : 10; hitCount++; }
    });
    if (hitCount === 0) {
      // 术语通道不允许bigram模糊命中，避免噪声
      return;
    }
    results.terms.push({ ...t, score: s, conf: confidence(s) });
  });
  results.terms.sort((a, b) => b.score - a.score);

  return results;
}

function recommend(q) {
  const r = search(q);
  const recs = new Set();
  r.cases.slice(0,2).forEach(c => recs.add(c.title));
  r.methods.slice(0,2).forEach(m => recs.add(m.problem));
  return [...recs].slice(0,3);
}

// 本地缓存（24h有效，带版本号以便知识库升级时自动失效）
const CACHE_KEY = 'ragCache_v3';
function getCache(){ try { return wx.getStorageSync(CACHE_KEY)||{}; } catch(e){ return {}; } }
function setCache(obj){ try { wx.setStorageSync(CACHE_KEY, obj); } catch(e){} }

function answer(q) {
  // 查缓存
  const cache = getCache();
  const now = Date.now();
  const cacheKey = q.trim();
  if (cache[cacheKey] && (now - cache[cacheKey].ts < 86400000)) {
    return cache[cacheKey].data;
  }
  const result = _answerInner(q);
  // 写缓存（最多存50条）
  const keys = Object.keys(cache);
  if (keys.length > 50) delete cache[keys[0]];
  cache[cacheKey] = { ts: now, data: result };
  setCache(cache);
  return result;
}

function formatNorms(arr) {
  return arr.map((n, i) => (i + 1) + '. ' + n.code + '《' + n.name + '》' + (String(n.point).indexOf('【强条】') >= 0 ? ' ⭐强条' : '') + '\n   ' + n.point).join('\n');
}

function _answerInner(q) {
  const r = search(q);
  const total = r.norms.length + r.cases.length + r.legal.length + r.methods.length + r.terms.length;
  if (total === 0) {
    return { found: false, conf: 'none', text: '知识库暂未覆盖"' + q + '"。建议：1）换个关键词试试；2）咨询专业验房师或CMA检测机构。', recs: [] };
  }
  let maxScore = 0;
  Object.values(r).forEach(arr => arr.forEach(item => { if(item.score>maxScore) maxScore=item.score; }));
  const conf = confidence(maxScore);

  let t = '';
  if (r.terms.length) {
    t += '【术语解释】\n';
    r.terms.slice(0,2).forEach(term => { t += '• ' + term.term + '：' + term.explain + '\n'; });
    t += '\n';
  }
  const normRefs = r.norms.slice(0, 3).map(n => ({ code: n.code, name: n.name, point: n.point, score: n.score, conf: n.conf }));
  if (r.norms.length) {
    t += '【规范依据】\n';
    t += formatNorms(normRefs);
    t += '\n\n';
  }
  if (r.methods.length) {
    t += '【怎么测】\n';
    r.methods.slice(0,2).forEach(m => { t += '• ' + m.tool + '：' + m.method + '（合格：' + m.pass + '）\n'; });
    t += '\n';
  }
  if (r.cases.length) {
    t += '【类似案例】\n';
    r.cases.slice(0,2).forEach(c => { t += '• ' + (c.title||'') + '：' + (c.judge||'') + '\n'; });
    t += '\n';
  }
  if (r.legal.length) {
    t += '【法律依据】\n';
    r.legal.slice(0,2).forEach(l => { t += '• ' + l.law + '：' + l.point + '\n'; });
  }
  if (conf === 'low') t += '\n（注：匹配度较低，仅供参考）';

  return { found: true, conf, text: t.trim(), recs: recommend(q), normRefs };
}

// ===== LLM重排增强 =====
// 本地RAG命中后，若用户已配大模型：从候选条文中挑最相关的3条重新排序（未配/失败则用本地结果）
// 统一走 llmConfig 模块：兼容扁平/多模型两种存储结构
function getLLM(){ return llm.getActive() || {}; }

function callLLM(question, cfg){
  return new Promise((resolve, reject) => {
    wx.request({
      url: cfg.apiUrl, method: 'POST', timeout: 15000,
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      data: { model: cfg.model || 'gpt-4o-mini', messages: [{ role: 'user', content: question }], temperature: 0.1, max_tokens: 120 },
      success: (res) => {
        const t = res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content;
        t ? resolve({ text: t }) : reject(new Error('empty'));
      },
      fail: reject
    });
  });
}

function extractIndexes(txt, max) {
  const nums = (txt.match(/\d+/g) || []).map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= max);
  return [...new Set(nums)].slice(0, 3);
}

// 用新规范列表重建答案文本（替换【规范依据】段，保留其他段）
function rebuildWithNorms(local, normRefs) {
  const block = '【规范依据】\n' + formatNorms(normRefs) + '\n\n';
  const re = /【规范依据】[\s\S]*?(?=\n【|\n（注|$)/;
  if (re.test(local.text)) return local.text.replace(re, block.trimEnd());
  return local.text;
}

// 异步增强版：本地检索 + 大模型重排（缓存24h）
async function answerRanked(q) {
  const local = answer(q);
  if (!local.found || !local.normRefs || local.normRefs.length <= 3) return local;
  const cache = getCache();
  const key = q.trim() + '_r';
  if (cache[key] && (Date.now() - cache[key].ts < 86400000)) return cache[key].data;
  const cfg = getLLM();
  let out = local;
  if (cfg.apiUrl && cfg.apiKey) {
    try {
      const cand = local.normRefs;
      const prompt = '验房问题："' + q + '"\n以下是检索到的规范条文候选，选出与问题最相关的3条，只输出它们的编号（1-' + cand.length + '），逗号分隔：\n' +
        cand.map((c, i) => (i + 1) + '. ' + c.code + ' ' + c.point).join('\n');
      const rr = await callLLM(prompt, cfg);
      const idxs = extractIndexes(rr.text, cand.length);
      if (idxs.length) {
        const picked = idxs.map(i => cand[i - 1]).filter(Boolean);
        out = { ...local, text: rebuildWithNorms(local, picked), normRefs: picked };
      }
    } catch (e) { /* 重排失败回退本地结果 */ }
  }
  cache[key] = { ts: Date.now(), data: out };
  setCache(cache);
  return out;
}

module.exports = { search, answer, answerRanked, expandQuery, recommend };

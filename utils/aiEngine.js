// utils/aiEngine.js - AI 验房大脑 v3
const { CATEGORIES, NORMS, CASES, GLOSSARY, TEST_METHODS } = require('./inspectData.js');
const rag = require('./rag.js');
const llm = require('./llmConfig.js');
const ALL_ITEMS = CATEGORIES.reduce((a,c)=>{ c.items.forEach(i=>a.push({...i,category:c.name})); return a; },[]);

const BASE_SYSTEM = '你是AI验房师，经验丰富的注册验房工程师。专业简洁200字内，引用GB50210/GB50096/GB50242等规范，格式：部位+现象+程度+依据。知识库没有覆盖的明确说不知道，不编造条文。';

function buildSystem() {
  // 注入全部规范的第一条（压缩量可控），RAG全量检索由rag.js负责
  const normText = NORMS.slice(0, 14).map(n => n.code + ' ' + n.name + '：' + n.points.slice(0, 2).join('；')).join('\n');
  const termText = GLOSSARY.slice(0, 12).map(t => t.term + '：' + t.explain).join('；');
  return BASE_SYSTEM + '\n\n【可参考的国标条文】\n' + normText + '\n\n【常用术语】\n' + termText;
}

// 统一走 llmConfig 模块：兼容扁平/多模型两种存储结构
function getConfig(){ return llm.getActive() || {}; }

// ===== 远程调用（支持多轮历史+重试）=====
function callRemote(question, system, history){
  const cfg = getConfig();
  if(!cfg.apiUrl||!cfg.apiKey) return Promise.reject(new Error('not configured'));
  const msgs = [{role:'system',content:system||buildSystem()}];
  if(history) msgs.push(...history.slice(-4));
  msgs.push({role:'user',content:question});
  return new Promise((resolve,reject)=>{
    wx.request({
      url:cfg.apiUrl, method:'POST', timeout:15000,
      header:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.apiKey},
      data:{ model:cfg.model||'gpt-4o-mini', messages:msgs, stream:false, temperature:0.3 },
      success(res){
        const t = res.data&&res.data.choices&&res.data.choices[0]&&res.data.choices[0].message.content;
        t ? resolve({text:t}) : reject(new Error('empty'));
      },
      fail:reject
    });
  });
}

// 先查本地RAG（含大模型重排），命中直接返回；没命中调用户自配的大模型API（带重试）
// 返回结构统一 {text, recs, offline}，兼容所有调用方
function askSmart(q, history){
  return Promise.resolve()
    .then(() => rag.answerRanked(q))
    .then(local => {
      if (local.found) {
        // 术语类问题本地足够可靠；低置信度时仍走用户大模型补充
        if (local.conf !== 'low') return {text: local.text, recs: local.recs, offline: true};
        return callRemote(q, null, history)
          .then(r => ({text: r.text + '\n\n【本地知识库参考】\n' + local.text, recs: local.recs, offline: false}))
          .catch(() => ({text: local.text, recs: local.recs, offline: true}));
      }
      return callRemote(q, null, history)
        .catch(() => callRemote(q, BASE_SYSTEM, history))
        .catch(() => ({text:'未配置大模型或网络异常。可在我的→大模型接口配置。本地知识库已优先回答。', offline:true}));
    })
    .catch(() => {
      // 重排异常（如缓存损坏）回退同步answer，保证永远有答案
      const local = rag.answer(q);
      if (local.found) return {text: local.text, recs: local.recs, offline: true};
      return callRemote(q, null, history)
        .catch(() => callRemote(q, BASE_SYSTEM, history))
        .catch(() => ({text:'未配置大模型或网络异常。可在我的→大模型接口配置。', offline:true}));
    });
}

function polishProblem(item){
  return callRemote('把这个验房问题写成专业描述：'+item.name+'，现场情况：'+(item.note||'无')).catch(()=>({text:item.name+'：'+(item.fix||'详见规范')}));
}
function genConclusion(problems){
  const txt = problems.map(p=>p.category+'·'+p.name).join('、');
  return callRemote('根据以下问题清单写验房结论（100字）：'+txt).catch(()=>({text:'本次验房共发现'+problems.length+'项问题，建议按报告整改。'}));
}
function genOwnerScript(problem){
  return callRemote('用通俗的话跟业主解释这个问题，语气友好：'+problem.name).catch(()=>({text:problem.name+'，建议整改。'}));
}
function dailyTip(){
  const tips = [
    '今天验房重点查墙面空鼓和防水。','别忘了带空鼓锤和验电插座。','窗户密封下雨天最好查。','拍照要拍全景和特写两张。',
    '淋浴房玻璃一定要看3C标。','地暖房收房时记得要打压记录。','卫生间等电位端子别漏查。','燃气排烟管是PVC就是大隐患。',
    '厨房烟道串味先看止逆阀。','地漏返臭看水封够不够深。','斜向裂缝比竖缝更危险。','入户门防火等级看铭牌。'
  ];
  return Promise.resolve({text: tips[Math.floor(Math.random()*tips.length)]});
}
function askVision(imagePath, context){
  const cfg = getConfig();
  if(!cfg.apiUrl||!cfg.apiKey) return Promise.reject(new Error('未配置'));
  return new Promise((resolve,reject)=>{
    wx.getFileSystemManager().readFile({
      filePath:imagePath, encoding:'base64',
      success(res){
        const b64 = 'data:image/jpeg;base64,'+res.data;
        wx.request({
          url:cfg.apiUrl, method:'POST', timeout:20000,
          header:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.apiKey},
          data:{ model:cfg.model||'qwen-vl-plus', messages:[{role:'user',content:[
            {type:'text',text:'我是验房师，拍了一张'+(context||'现场')+'照片。找出可见缺陷：裂缝、渗水、划痕、不平整等。150字内。'},
            {type:'image_url',image_url:{url:b64}}
          ]}]},
          success(r){
            const t=r.data&&r.data.choices&&r.data.choices[0]&&r.data.choices[0].message.content;
            t?resolve({text:t}):reject(new Error('fail'));
          }, fail:reject
        });
      }, fail:reject
    });
  });
}

const HOT_QUESTIONS = ['卫生间漏水谁负责？','空鼓多大算问题？','阳台栏杆多高合格？','插座怎么验？','闭水试验怎么做？','甲醛超标怎么办？','承重墙能拆吗？','等电位是干嘛的？','燃气报警器必须装吗？','飘窗护栏能拆吗？','窗户打胶怎么看？','验房要带什么工具？','开发商不认问题怎么办？','冷热水接反了？','地板起拱谁负责？','斜向裂缝危险吗？','保修期从哪天算？','验房能拒收吗？','新房要除甲醛吗？','阳台能改厨房吗？','地暖盘管要加密吗？','淋浴房玻璃没3C？','燃气排烟管能用PVC吗？','卫生间地漏返臭？','防盗门什么等级？','新风风量怎么测？','楼板厚度怎么查？','烟道串味怎么办？'];

module.exports = { askSmart, polishProblem, genConclusion, genOwnerScript, dailyTip, askVision, HOT_QUESTIONS, GREETING:'你好，我是AI验房助手。点下方问题试试，或直接输入你遇到的验房问题。' };

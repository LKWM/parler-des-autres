const { JSDOM } = require('jsdom');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FILES_A = ['1','2','3','4','5','6','7','8','9','10','11'].map(x=>x+'.html');
const FILES_B = ['10-1.html','11-1.html','12.html'];
function makeDom(file, log) {
  return new JSDOM(fs.readFileSync(file, 'utf8'), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://lkwm.github.io/parler-des-autres/' + file,
    beforeParse(w) {
      const universal = () => { const u = new Proxy(function(){}, { get: () => u, set: () => true, apply: () => u, construct: () => u }); return u; };
      w.Tone = new Proxy({ context: { state: 'running', resume(){} } }, { get: (t,p) => p==='context' ? t[p] : universal(), set: () => true });
      w.playLog = [];
      w.Audio = class { constructor(s){ this.src = s || ''; } play(){ w.playLog.push(this.src); return Promise.resolve(); } pause(){} load(){} catch(){ return Promise.resolve(); } stop(){} };
      w.addEventListener('unhandledrejection', e => log.push('UNHANDLED:' + ((e.reason && e.reason.message) || String(e.reason))));
      w.fetch = (u, opts) => {
        const body = opts && opts.body ? JSON.parse(opts.body) : {};
        log.push({ url: String(u), body });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ text: '안녕하세요' }) });
      };
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
    } });
}
const checkPayload = (log, sysExpected) => {
  const bad = log.filter(x => x && x.UNHANDLED !== undefined && typeof x === 'string');
  const calls = log.filter(x => x && x.url);
  if (!calls.length) return 'API 호출 없음';
  const issues = [];
  for (const c of calls) {
    if (!c.url.includes('GeminiChatSecure')) issues.push('엔드포인트 오류:' + c.url);
    if (c.body.model !== 'gemini-3.5-flash-lite') issues.push('모델 오류:' + c.body.model);
    if (!c.body.permit || !c.body.lesson_id) issues.push('permit/lesson_id 누락');
    const parts = (c.body.contents||[])[0]?.parts || [];
    if (parts.length !== 1 || !parts[0].inline_data || parts[0].text !== undefined) issues.push('parts 비표준:' + JSON.stringify(parts).slice(0,60));
    if (sysExpected && c.body.systemInstruction !== sysExpected) issues.push('systemInstruction 불일치:' + (c.body.systemInstruction||'').slice(0,30));
  }
  return issues.length ? issues.join(' | ') : 'OK';
};
(async () => {
  for (const file of FILES_A) {
    const log = [];
    const dom = makeDom(file, log);
    const w = dom.window;
    await sleep(150);
    w.postMessage({ type: 'coreeno:permit', permit: 'P', lesson_id: 'L' }, '*');
    await sleep(100);
    // API 경로
    let apiResult = 'processSpeech 없음';
    if (w.processSpeech) { try { await w.processSpeech('QQ', '안녕하세요', 0); apiResult = checkPayload(log, '유저 발화를 한글로 전사하시오.'); } catch(e) { apiResult = 'EXC:' + e.message; } }
    else apiResult = checkPayload(log, null);
    // 자동재생 (1-9: repeat 페이지)
    let auto = '해당없음';
    const ld = w.eval('typeof lessonData !== "undefined" ? lessonData : null'); const rn = w.eval('typeof render === "function" ? render : null'); if (ld && rn && ['1','2','3','4','5','6','7','8','9'].includes(file.replace('.html',''))) {
      const idx = ld.findIndex(x => x.type === 'repeat');
      if (idx >= 0) {
        w.eval('currentIndex = ' + idx); rn(); await sleep(1400);
        const first = w.playLog.filter(Boolean);
        rn(); await sleep(400);
        const second = w.playLog.filter(Boolean).length;
        auto = (first.length >= 1 ? '재생:' + String(first[0]).slice(-28) : '미재생') + ' / 재진입 추가재생:' + (second > first.length ? '발생(오류)' : '없음');
      }
    }
    const errs = log.filter(x => typeof x === 'string').length;
    console.log(file.padEnd(9), '| API:', apiResult, '| 자동재생:', auto, '| 오류:', errs + '건');
    dom.window.close();
  }
  for (const file of FILES_B) {
    const log = [];
    const dom = makeDom(file, log);
    const w = dom.window;
    await sleep(150);
    w.postMessage({ type: 'coreeno:permit', permit: 'P', lesson_id: 'L' }, '*');
    await sleep(100);
    let r = '호출불가';
    try {
      if (file === '10-1.html') await w.sendToGemini('QQ', 'Transcribe this audio in Korean.');
      else if (file === '11-1.html') await w.sendToGemini('QQ');
      else await w.sendToGemini('QQ', 'instr', w.document.createElement('p'));
      r = checkPayload(log, file === '10-1.html' ? 'Transcribe this audio in Korean.' : (file === '11-1.html' ? 'Transcribe this audio in Korean. Do not add any comment, just transcribe' : 'instr'));
    } catch(e) { r = 'EXC:' + e.message; }
    const errs = log.filter(x => typeof x === 'string').length;
    console.log(file.padEnd(9), '| API:', r, '| 오류:', errs + '건');
    dom.window.close();
  }
  // final.html STT 경로
  const log = [];
  const dom = makeDom('final.html', log);
  const w = dom.window;
  await sleep(150);
  w.postMessage({ type: 'coreeno:permit', permit: 'P', lesson_id: 'L' }, '*');
  await sleep(100);
  let r = 'EXC';
  try { await w.processClovaSpeech('QQ', ['안녕하세요'], w.document.createElement('div'), 0, w.document.createElement('button')); r = checkPayload(log, '유저 발화를 한글로 전사하시오.'); } catch(e) { r = 'EXC:' + e.message; }
  console.log('final.html'.padEnd(9), '| API(STT):', r, '| 오류:', log.filter(x=>typeof x==='string').length + '건');
  dom.window.close();
  // final.html EVAL 경로 정적 확인
  const src = fs.readFileSync('final.html','utf8');
  const okEval = src.includes('model:"gemini-3.5-flash-lite",\n                        permit:lessonPermit') && src.includes('inline_data:{mime_type:mimeType,data:base64data}') && !src.includes('inlineData');
  console.log('final.html | API(EVAL 정적):', okEval ? 'OK' : '확인필요');
})();

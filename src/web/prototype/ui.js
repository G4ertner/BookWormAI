
/* BookWormAI — dependency-free interactive prototype.
   Demo answers are curated, not model-generated. Live answers use the optional
   same-origin server; no provider API key is ever accepted by this client. */
(() => {
  'use strict';
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const uid = () => window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  // Retain the original private storage namespace so renaming the product does not
  // reset saved books, insights, or preferences when served from the same origin.
  const STORE = 'bookworm-audio-demo-v1-';
  function load(key, fallback) { try { const value=JSON.parse(localStorage.getItem(STORE+key)); return value ?? fallback; } catch {return fallback;} }
  let storageWarned=false;
  function store(key,value) { try { localStorage.setItem(STORE+key,JSON.stringify(value)); return true; } catch { if(!storageWarned){storageWarned=true;toast('Browser storage is full or unavailable. Your changes will last for this session only.',true);}return false;} }
  const originalBooks=window.BOOKWORMAI_BOOKS;
  const validBook=b=>b && typeof b.id==='string' && typeof b.title==='string' && Array.isArray(b.chapters) && b.chapters.length>0 && b.chapters.every(c=>typeof c.title==='string' && Array.isArray(c.paragraphs) && c.paragraphs.length && c.paragraphs.every(p=>typeof p.text==='string'&&p.text.trim()));
  let uploads=load('uploads',[]); if(!Array.isArray(uploads))uploads=[]; uploads=uploads.filter(validBook);
  let books=[...originalBooks,...uploads];
  let insights=load('insights',[]); if(!Array.isArray(insights)) insights=[]; insights=insights.filter(i=>i&&typeof i.id==='string'&&typeof i.bookId==='string'&&typeof i.quote==='string');
  let positions=load('positions',{}); if(!positions||typeof positions!=='object'||Array.isArray(positions)) positions={};
  let settings=Object.assign({rate:1,voice:'',autoSpeak:false,spoilerSafe:true,textSize:0,liveConsent:false},load('settings',{}));
  if(![.75,1,1.25,1.5,1.75,2].includes(settings.rate))settings.rate=1;
  if(![0,1,2].includes(settings.textSize))settings.textSize=0;
  const state={view:'listen',bookId:books.some(b=>b.id===load('current-book','wonder'))?load('current-book','wonder'):'wonder',index:0,playing:false,speakingAnswer:false,tab:'read',messages:{},busy:false,filter:'all',search:'',backend:false,model:'',voiceActive:false};
  let speechToken=0, utterance=null, pendingController=null, requestId=0, recognition=null, confirmCallback=null;
  let ticker=null, sentenceStarted=0, sentenceFraction=0, currentAnswerId=null;
  const audio = window.bookwormAudio;
  const hasSpeech = false; // Browser speech and microphone routes are outside this MVP.
  function sentenceParts(text){ return audio.split(text); }
  function compile(b){if(b._segments)return b;let elapsed=0;b._segments=[];b._starts=[];b.chapters.forEach((ch,c)=>{b._starts[c]=b._segments.length;ch.paragraphs.forEach((p,pi)=>{sentenceParts(p.text).forEach((text,s)=>{let words=text.split(/\s+/).length;let seconds=Math.max(1.2,words/2.55);b._segments.push({text,c,p:pi,s,start:elapsed,seconds});elapsed+=seconds;});});});b._duration=elapsed;return b;}
  books.forEach(compile);
  const book=()=>books.find(b=>b.id===state.bookId)||books[0];
  const segment=()=>book()._segments[state.index]||book()._segments[0];
  const paragraph=()=>book().chapters[segment().c].paragraphs[segment().p];
  const thread=()=>state.messages[state.bookId]||(state.messages[state.bookId]=[]);
  const live=()=>state.backend && settings.liveConsent;
  const mmss=seconds=>{let n=Math.max(0,Math.floor(seconds));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
  const minutes=seconds=>`${Math.max(1,Math.round(seconds/60))} min`;
  function cleanBook(b){const {_segments,_duration,_starts,...clean}=b;return clean;}
  function cover(b,size='mini') {
    // Cover title markup exists only in our built-in books; user titles are escaped.
    const title=b.uploaded?esc(b.title.slice(0,54)):(b.coverTitle||esc(b.title));
    return `<div class="book-cover cover-${esc(b.cover)} cover-${size}" aria-hidden="true"><span class="cover-top">${b.uploaded?'YOUR PERSONAL LIBRARY':'THE BOOKWORMAI ORIGINALS'}</span><div class="cover-title">${title}</div><div class="cover-art"><div class="cover-orbit"></div><div class="cover-sun"></div><div class="cover-line"></div></div><span class="cover-author">${b.uploaded?'A LITTLE MORE DISCOVERY':'A LITTLE MORE DISCOVERY'}</span></div>`;
  }
  function toast(text,error=false){const el=document.createElement('div');el.className='toast'+(error?' error':'');el.innerHTML=icon(error?'chat':'check')+`<span>${esc(text)}</span>`;$('#toasts').append(el);setTimeout(()=>el.remove(),error?7000:3800);}
  function savePosition(){positions[state.bookId]=state.index;store('positions',positions);store('current-book',state.bookId);}
  function saveSettings(){store('settings',settings);}
  function updateCounts(){$('#library-count').textContent=books.length;$('#insight-count').textContent=insights.length;}
  function renderShelf(){
    $('#shelf-list').innerHTML=books.slice(0,7).map(b=>`<button class="shelf-item" data-open-book="${esc(b.id)}" aria-label="Open ${esc(b.title)}">${cover(b)}<span class="shelf-info"><strong>${esc(b.title)}</strong><span>${b.id===state.bookId?'Currently reading':b.uploaded?'Your upload':'BookWormAI original'}</span></span></button>`).join('');updateCounts();
  }
  function renderHero(){const b=book();$('#hero-cover').innerHTML=cover(b,'large');$('#book-title').textContent=b.title;$('#book-author').textContent=b.author;$('#book-category').textContent=b.category.toUpperCase();$('#book-duration').textContent=`~${minutes(b._duration)}`;$('#book-chapters').textContent=`${b.chapters.length} chapters`;$('#chapters-tab-count').textContent=b.chapters.length;$('#player-cover').innerHTML=cover(b);$('#player-title').textContent=b.title;}
  function renderReader(){
    const b=book(),s=segment(),ch=b.chapters[s.c];
    $('#chapter-number').textContent=`CHAPTER ${String(s.c+1).padStart(2,'0')}`;$('#chapter-title').textContent=ch.title;
    $('#passages').innerHTML=ch.paragraphs.map((p,i)=>{
      const idx=b._segments.findIndex(q=>q.c===s.c&&q.p===i);
      const sentences=b._segments.map((q,j)=>({...q,j})).filter(q=>q.c===s.c&&q.p===i);
      return `<div class="passage ${i===s.p?'active':''}" data-passage="${idx}" tabindex="0" role="button" aria-label="Read passage ${i+1}" aria-current="${i===s.p?'true':'false'}"><p>${sentences.map(q=>`<span class="sentence ${q.j===state.index?'current':''}" data-sentence="${q.j}">${esc(q.text)}</span>`).join(' ')}</p>${i===s.p?`<div class="passage-actions"><span><span class="mini-wave" aria-hidden="true"><i></i><i></i><i></i></span><span>${state.playing?'NOW READING':'YOUR PLACE IN THE BOOK'}</span></span><button class="passage-ask" data-action="ask" aria-label="Ask about passage ${i+1}">${icon('spark')}Ask about this</button></div>`:''}</div>`;
    }).join('');
    $('#next-chapter').hidden=s.c===b.chapters.length-1;
    $('#chapters-panel').innerHTML=b.chapters.map((chapter,c)=>{const duration=b._segments.filter(s=>s.c===c).reduce((n,s)=>n+s.seconds,0);return `<button class="chapter-row ${c===s.c?'active':''}" data-chapter="${c}" aria-label="Open chapter ${c+1}: ${esc(chapter.title)}"><span class="chapter-row-index">${String(c+1).padStart(2,'0')}</span><div><strong>${esc(chapter.title)}</strong><small>~${minutes(duration)} · ${chapter.paragraphs.length} passages</small></div>${icon(c===s.c?'volume':'arrow')}</button>`;}).join('');
    setTab(state.tab);updateCurrentContext();updatePlaybackUI();
  }
  function setTab(tab){state.tab=tab==='chapters'?'chapters':'read';$('#read-panel').hidden=state.tab!=='read';$('#chapters-panel').hidden=state.tab!=='chapters';$$('[data-tab]').forEach(el=>{const selected=el.dataset.tab===state.tab;el.classList.toggle('active',selected);el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1;});}
  function updateCurrentContext(){const s=segment();$('#context-location').textContent=`WITH YOU IN CHAPTER ${s.c+1}`;$('#context-text').textContent=`“${paragraph().text}”`;$('#player-chapter').textContent=`Chapter ${s.c+1} · ${book().chapters[s.c].title}`;}
  function updatePlaybackUI(){
    const a=audio.snapshot(),active=a.status==='playing'||a.status==='preparing';
    $('#hero-play').innerHTML=icon(active?'pause':'play')+`<span>${a.status==='preparing'?'Preparing audio…':active?'Pause listening':a.status==='error'?'Retry narration':a.status==='ended'?'Listen again':state.index>0||a.offsetMs>0?'Continue listening':'Start listening'}</span>`;
    $('#main-play').innerHTML=icon(active?'pause':'play');$('#main-play').setAttribute('aria-label',active?'Pause audiobook':'Play audiobook');
    $('#reading-state').textContent=({idle:'Ready to listen',preparing:'Preparing next passage…',playing:'Reading aloud',paused:'Your place is saved',ended:'End of book',error:'Narration paused'})[a.status];
    $('#reading-state').classList.toggle('playing',a.status==='playing');document.body.classList.toggle('is-speaking',a.status==='playing');
    $('#speed-button').textContent=`${settings.rate}×`;$('#companion-resume').hidden=active||!thread().length;
    const marker=$('.passage.active .passage-actions>span>span:last-child');if(marker)marker.textContent=a.status==='playing'?'NOW READING':a.status==='ended'?'END OF BOOK':'YOUR PLACE IN THE BOOK';
    $('#duration').textContent='~'+mmss(book()._duration/settings.rate);
    updateProgress();
  }
  function updateProgress(){
    const b=book(),s=segment(),a=audio.snapshot();
    const frac=a.durationMs?Math.min(1,a.offsetMs/a.durationMs):0;
    const elapsed=s.start+(a.durationMs?frac*s.seconds:a.offsetMs/1000);
    $('#elapsed').textContent=mmss(elapsed/settings.rate);$('#progress').max=Math.max(1,b._segments.length-1);$('#progress').value=state.index;
    const pct=elapsed/b._duration*100;$('#progress').style.background=`linear-gradient(to right,#7b9469 ${pct}%,#e0e5d6 ${pct}%)`;
    $('#progress').setAttribute('aria-valuetext',`Chapter ${s.c+1}, passage ${state.index+1}, ${mmss(a.offsetMs/1000)} into current audio`);
  }
  function selectedVoice(){ return null; }
  function stopSpeech(){ audio.pause(); state.playing=false; state.speakingAnswer=false; updatePlaybackUI(); }
  function pauseNarration(){ audio.pause(); savePosition(); }
  function failSpeech(error){ audio.pause(); toast(error || 'Narration could not start. Please retry.',true); }
  function speakCurrent(){ void audio.play(); }
  function play(){
    stopRecognition();
    const status=audio.snapshot().status;
    if(status==='playing'||status==='preparing') audio.pause(); else void audio.play();
  }
  function gotoIndex(index,auto=false){
    const n=Number(index); if(!Number.isFinite(n))return;
    if(!auto)audio.pause();
    audio.seek(Math.max(0,Math.min(book()._segments.length-1,Math.floor(n))));
    state.index=audio.snapshot().index;savePosition();renderReader();
  }
  function openBook(id,index){
    if(!books.some(b=>b.id===id))return;
    cancelQuestion();stopRecognition();stopSpeech();state.bookId=id;
    const saved=index??positions[id]??0;
    state.index=Math.max(0,Math.min(book()._segments.length-1,Number(saved)||0));
    loadAudioBook(index===undefined);state.tab='read';savePosition();
    renderShelf();renderHero();renderReader();renderChat();setView('listen');
  }
  function loadAudioBook(restore=true){
    const b=book();
    audio.load(b._segments.map((s,i)=>({bookId:b.id,chapterId:String(s.c),passageId:String(i),text:s.text})),state.index,restore);
    state.index=audio.snapshot().index;
  }
  function setView(view){if(!['listen','library','insights'].includes(view))view='listen';state.view=view;$$('.view').forEach(el=>{const active=el.id===`view-${view}`;el.hidden=!active;el.classList.toggle('active',active);});$$('.nav-item').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);if(el.dataset.view===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});$('#breadcrumb-current').textContent={listen:'Listening room',library:'My library',insights:'Saved insights'}[view];$('#sidebar').classList.remove('open');if(view==='library')renderLibrary();if(view==='insights')renderInsights();window.scrollTo({top:0,behavior:'instant'});history.replaceState(null,'',`#${view}`);}
  function askFocus(){pauseNarration();if(state.view!=='listen')setView('listen');const panel=$('#companion-panel');panel.classList.add('attention');panel.scrollIntoView({behavior:'smooth',block:'nearest'});$('#question-input').focus({preventScroll:true});setTimeout(()=>panel.classList.remove('attention'),1800);}
  function renderChat(){
    const messages=thread();const box=$('#chat-scroll');
    if(!messages.length){box.innerHTML=`<div class="chat-empty"><div class="companion-art" aria-hidden="true"><span class="art-ring"></span><span class="art-ring"></span><span class="art-ring"></span><span class="art-star">✧</span></div><h3>Some things are better<br>understood together.</h3><p>Pause on a thought. Follow a question.<br>I’ll keep your place while we explore.</p><div class="suggestions"><button class="suggestion" data-prompt="Explain this simply">${icon('spark')}Explain this simply${icon('arrow')}</button><button class="suggestion" data-prompt="Give me an everyday example">${icon('leaf')}Give me an everyday example${icon('arrow')}</button><button class="suggestion" data-prompt="Ask me a question about this">${icon('chat')}Give me something to think about${icon('arrow')}</button></div></div>`;}
    else box.innerHTML=messages.map(m=>m.role==='user'?`<div class="chat-message user-message">${esc(m.text)}</div>`:`<div class="chat-message assistant-message" data-message-id="${esc(m.id)}"><div class="assistant-label">${icon('spark')}${m.kind==='live'?'Reading companion · live AI':'Reading companion · prepared demo'}</div><div class="assistant-answer">${esc(m.answer)}</div>${m.quote?`<div class="answer-eyebrow">FROM THE ORIGINAL TEXT</div><blockquote class="answer-source">“${esc(m.quote)}”</blockquote><button class="answer-location" data-source-index="${m.index}">Chapter ${m.chapter+1} · Passage ${m.passage+1} ↗</button>`:''}<div class="message-actions"><button class="message-action" data-speak-message="${esc(m.id)}">${icon('volume')}Listen</button><button class="message-action ${insights.some(i=>i.messageId===m.id)?'saved':''}" data-save-message="${esc(m.id)}">${icon(insights.some(i=>i.messageId===m.id)?'check':'bookmark')}${insights.some(i=>i.messageId===m.id)?'Saved':'Save insight'}</button></div></div>`).join('');
    if(state.busy){const loader=document.createElement('div');loader.className='chat-thinking';loader.setAttribute('aria-label','Preparing an answer');loader.innerHTML='<span></span><span></span><span></span>';box.append(loader);}
    if(messages.length)box.scrollTop=box.scrollHeight;
    $('#send-button').disabled=state.busy;$('#question-input').disabled=state.busy;updatePlaybackUI();
  }
  function contextFor(snapshot){
    const b=books.find(b=>b.id===snapshot.bookId);const s=b._segments[snapshot.index];
    const all=[];let startIndex=0;
    b.chapters.forEach((ch,c)=>ch.paragraphs.forEach((p,pi)=>{const record={id:`c${c+1}-p${pi+1}`,chapter:c+1,passage:pi+1,title:ch.title,text:p.text,index:startIndex};startIndex+=sentenceParts(p.text).length;if(!settings.spoilerSafe||c<s.c||c===s.c&&pi<=s.p)all.push(record);}));
    const currentId=`c${s.c+1}-p${s.p+1}`;const recent=all.filter(p=>p.id!==currentId).slice(-11);const current=all.find(p=>p.id===currentId);return {title:b.title,currentPassageId:currentId,passages:[...recent,...(current?[current]:[])],spoilerSafe:settings.spoilerSafe};
  }
  function demoAnswer(question,snapshot){
    const b=books.find(b=>b.id===snapshot.bookId),s=b._segments[snapshot.index],p=b.chapters[s.c].paragraphs[s.p],q=question.toLowerCase();
    const base={kind:'demo',quote:sentenceParts(p.text).slice(0,2).join(' '),index:snapshot.index,chapter:s.c,passage:s.p};
    if(b.uploaded){return {...base,answer:'This is the passage you selected. In demo mode I can bring its exact words into the conversation, but I can’t generate an explanation of an uploaded book. The three BookWormAI originals have prepared explanations; live explanations are not included in this audio MVP.'};}
    if(/ending|ends?\b|spoiler|next chapter|who wrote|who is the author of the letter|mother.*letter/.test(q)&&b.id==='letter'&&s.c===0){return {...base,quote:'',answer:'That asks about something beyond your current place in the story. I’ll leave it open rather than reveal a later passage. For this demo, try “Explain this simply” to discuss only what is on the page.'};}
    if(/is (that|this) (what|from)|author (actually |really )?say|your (example|interpretation)|made (that|this) up|evidence|where.*say|quote|from the (text|book)|interpretation|fact or/.test(q)){
      const last=thread().filter(m=>m.role==='assistant'&&m.kind==='demo').at(-1);
      return {...base,answer:`The words shown under “From the original text” are directly from the book. The explanation${last?' in my previous reply':''} is prepared companion commentary, not a quotation. Any additional everyday example is an illustration, not evidence that the author described that event.`,quote:p.text};
    }
    if(b.id==='letter'&&s.c===0&&s.p===1&&/why|hid|hiding|hide|brother|daniel/.test(q)){return {...base,answer:'The text shows Maya putting the letter away as Daniel arrives. It does not tell us her motive. She may be hiding it, but that is an interpretation of the timing, not something the narrator has confirmed.',quote:sentenceParts(p.text)[0]};}
    if(/example|analogy|real life|everyday|illustrat|practical/.test(q))return {...base,answer:p.example};
    if(/ask me|question for me|think about|reflect|quiz|test me|something to/.test(q))return {...base,answer:p.reflect,quote:''};
    if(/explain|simpl|meaning|what does|what is|understand|summar|rephrase|child|kid|eli5|say that|main (idea|point)|available to it|unfinished|curtain/.test(q))return {...base,answer:p.simple};
    return {...base,quote:'',answer:'You’ve reached the edge of this prepared demo—not the edge of the book. Try “Explain this simply,” “Give me an everyday example,” or “Ask me a question about this.” Connect a live model in settings for open-ended conversation.'};
  }
  function cancelQuestion(){requestId++;pendingController?.abort();pendingController=null;state.busy=false;}
  async function ask(question){
    const text=String(question||'').trim().slice(0,1500);if(!text||state.busy)return;
    if(/^(continue( reading| listening)?|keep reading|resume( reading| listening)?)\.?$/i.test(text)){if(state.speakingAnswer)stopSpeech();if(!state.playing)play();$('#question-input').value='';return;}
    pauseNarration();stopRecognition();const snapshot={bookId:state.bookId,index:state.index};const id=++requestId;thread().push({role:'user',text,id:uid()});state.busy=true;$('#question-input').value='';$('#question-input').style.height='';renderChat();
    try{
      let result;
      if(live()){
        pendingController=new AbortController();const timeout=setTimeout(()=>pendingController?.abort(),45000);
        try{
          const res=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},signal:pendingController.signal,body:JSON.stringify({question:text,context:contextFor(snapshot),history:thread().slice(-7,-1).map(m=>({role:m.role,content:m.role==='user'?m.text:m.answer}))})});
          const json=await res.json();if(!res.ok)throw new Error(json.error||'The live model could not answer.');
          const s=segment();result={kind:'live',answer:String(json.answer||''),quote:String(json.quote||''),index:snapshot.index,chapter:s.c,passage:s.p};
          if(!result.answer)throw new Error('The model returned an empty answer.');
          if(json.sourceId){const source=contextFor(snapshot).passages.find(p=>p.id===json.sourceId);if(source){result.index=source.index;result.chapter=source.chapter-1;result.passage=source.passage-1;}}
        }finally{clearTimeout(timeout);}
      }else{
        // A short transition makes the prepared companion visibly conversational.
        await new Promise(resolve=>setTimeout(resolve,420));result=demoAnswer(text,snapshot);
      }
      if(id!==requestId||state.bookId!==snapshot.bookId)return;
      const msg={...result,id:uid(),role:'assistant',question:text};thread().push(msg);state.busy=false;renderChat();if(settings.autoSpeak)speakAnswer(msg);
    }catch(error){
      if(id!==requestId)return;state.busy=false;thread().push({id:uid(),role:'assistant',kind:live()?'live':'demo',answer:error.name==='AbortError'?'The live answer took too long. Your place is safe; please try again.':`I couldn’t reach the live companion. ${error.message} Your book and reading position are unchanged.`,quote:'',question:text,index:snapshot.index,chapter:segment().c,passage:segment().p});renderChat();
    }finally{if(id===requestId){pendingController=null;state.busy=false;$('#send-button').disabled=false;$('#question-input').disabled=false;}}
  }
  function speakAnswer(){toast('Spoken companion answers are a later feature. Book narration is ready through the player.');}
  function savePassage(){const s=segment();const existing=insights.find(i=>i.bookId===state.bookId&&i.index===state.index&&!i.question);if(existing){toast('This passage is already on your saved shelf.');return;}insights.unshift({id:uid(),bookId:state.bookId,bookTitle:book().title,chapter:s.c,passage:s.p,index:state.index,quote:paragraph().text,question:'',answer:'',createdAt:new Date().toISOString()});store('insights',insights);updateCounts();toast('Passage saved. Come back to it whenever you’re curious.');if(state.view==='insights')renderInsights();}
  function saveMessage(id){const msg=thread().find(m=>m.id===id&&m.role==='assistant');if(!msg)return;if(insights.some(i=>i.messageId===id)){toast('This conversation is already saved.');return;}insights.unshift({id:uid(),messageId:id,bookId:state.bookId,bookTitle:book().title,chapter:msg.chapter,passage:msg.passage,index:msg.index,question:msg.question,quote:msg.quote||book().chapters[msg.chapter].paragraphs[msg.passage].text,answer:msg.answer,kind:msg.kind,createdAt:new Date().toISOString()});store('insights',insights);updateCounts();renderChat();toast('A little moment of understanding, saved.');}
  function renderLibrary(){const filtered=books.filter(b=>(state.filter==='all'||state.filter==='uploads'&&b.uploaded||state.filter==='originals'&&!b.uploaded)&&`${b.title} ${b.author}`.toLowerCase().includes(state.search.toLowerCase()));$('#library-grid').innerHTML=filtered.map(b=>`<button class="library-card" data-open-book="${esc(b.id)}"><div class="library-card-art">${cover(b,'large')}</div><div class="library-card-body"><div class="eyebrow">${esc(b.category.toUpperCase())}</div><h3>${esc(b.title)}</h3><p>${esc(b.description)}</p><div class="library-card-bottom"><span>~${minutes(b._duration)} · ${b.chapters.length} chapters</span>${icon('arrow')}</div></div></button>`).join('')+(!filtered.length&&state.search?'<p class="no-results">No books match that search. Try a different title.</p>':'')+(!state.search?`<button class="upload-card" data-action="upload">${icon('plus')}<strong>Your next discovery.</strong><span>Add an e-book or a piece of writing.<br>Make it a conversation.</span></button>`:'');$$('[data-filter]').forEach(el=>el.classList.toggle('active',el.dataset.filter===state.filter));updateCounts();}
  function renderInsights(){
    $('#insight-summary').textContent=`${insights.length} ${insights.length===1?'moment':'moments'} worth keeping`;$('#export-insights').disabled=!insights.length;
    $('#insights-list').innerHTML=insights.length?insights.map(i=>`<article class="insight-card"><div class="insight-top">${icon('bookmark')}<span>${esc(i.bookTitle)} · Chapter ${Number(i.chapter)+1}</span><button class="icon-button" data-delete-insight="${esc(i.id)}" aria-label="Delete saved insight">${icon('trash')}</button></div>${i.question?`<h3>${esc(i.question)}</h3>`:''}<blockquote>“${esc(i.quote)}”</blockquote>${i.answer?`<div class="answer-eyebrow">${i.kind==='live'?'AI-GENERATED EXPLANATION':'PREPARED COMPANION COMMENTARY'}</div><p class="insight-answer">${esc(i.answer)}</p>`:''}<button class="text-button" data-return-book="${esc(i.bookId)}" data-return-index="${Number(i.index)||0}">Back to this passage${icon('arrow')}</button></article>`).join(''):`<div class="empty-collection">${icon('bookmark')}<h3>The good parts deserve a place.</h3><p>Save a passage or a conversation as you listen. Your discoveries will be waiting right here.</p><button class="button button-primary" data-view="listen">Back to the book${icon('arrow')}</button></div>`;
  }
  function exportInsights(){if(!insights.length)return;const content='# BookWormAI — Saved insights\n\n'+insights.map(i=>`## ${i.question||i.bookTitle}\n\n**${i.bookTitle} · Chapter ${Number(i.chapter)+1}**\n\n> ${i.quote.replace(/\n/g,'\n> ')}\n\n${i.answer?`${i.kind==='live'?'AI-generated explanation':'Prepared demo commentary'}:\n\n${i.answer}\n\n`:''}Saved ${new Date(i.createdAt).toLocaleDateString()}\n\n---\n`).join('\n');downloadFile('bookwormai-saved-insights.md',content,'text/markdown');toast('Your notes are ready to take with you.');}
  function downloadFile(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
  function showModal(id){$('#sidebar').classList.remove('open');if(id==='settings-dialog')renderSettings();if(id==='upload-dialog'){$('#upload-error').hidden=true;$('#file-input').value='';}const dialog=$('#'+id);if(!dialog.open)dialog.showModal();}
  function makeTextBook(title,text){
    const cleaned=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();if(cleaned.length<20)throw new Error('Please add at least 20 characters of readable text.');if(cleaned.length>3*1024*1024)throw new Error('Please use a text excerpt smaller than 3 MB.');
    let raw=cleaned.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);if(raw.length===1)raw=cleaned.split(/\n/).map(s=>s.trim()).filter(Boolean);
    const chapters=[];let current={title:'The first page',paragraphs:[]};
    const push=()=>{if(current.paragraphs.length)chapters.push(current);};
    for(let part of raw){
      const heading=part.match(/^#{1,2}\s+(.+)$/)||part.match(/^((?:chapter|part)\s+(?:[\divxlc]+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[:.\-–—]?\s+[^\n]{0,80})?)$/i);
      if(heading){push();current={title:heading[1].trim().slice(0,140),paragraphs:[]};continue;}
      part=part.replace(/\s+/g,' ');while(part.length>1400){let cut=part.lastIndexOf(' ',1300);if(cut<1)cut=1300;current.paragraphs.push({text:part.slice(0,cut).trim()});part=part.slice(cut).trim();}if(part)current.paragraphs.push({text:part});
      if(current.paragraphs.length>=35){push();current={title:`Continued · Part ${chapters.length+1}`,paragraphs:[]};}
    }
    push();if(!chapters.length)throw new Error('No reading text was found after the headings.');
    return {id:'upload-'+uid(),title:title.trim().slice(0,180)||'Untitled discovery',author:'From your personal library',category:'Your personal library',cover:'upload',uploaded:true,description:'Your own writing, with progressive narration and a space for questions.',chapters};
  }
  function addBook(b){if(!validBook(b))throw new Error('The book did not contain readable chapters.');compile(b);books.push(b);uploads.push(cleanBook(b));store('uploads',uploads);$('#upload-dialog').close();$('#paste-form').reset();renderShelf();openBook(b.id,0);toast('Your book is ready. Press Play to start listening.');}
  async function importFile(file){if(!file)return;const label=$('#dropzone strong');const original=label.textContent;label.textContent='Opening your book…';$('#upload-error').hidden=true;try{if(file.size>10*1024*1024)throw new Error('Please choose a file smaller than 10 MB.');const ext=file.name.split('.').pop().toLowerCase();if(!['epub','txt','md'].includes(ext))throw new Error('This prototype supports EPUB, TXT, and Markdown. PDF and encrypted books are not supported.');let b;if(ext==='epub')b=await window.parseBookWormAIEPUB(file);else{const text=await file.text();if(text.includes('\0'))throw new Error('This file does not look like plain UTF-8 text.');b=makeTextBook(file.name.replace(/\.[^.]+$/,''),text);}addBook(b);}catch(error){$('#upload-error').textContent=error.message||'The file could not be opened. Please try a plain text excerpt.';$('#upload-error').hidden=false;}finally{label.textContent=original;$('#file-input').value='';}}
  function fillVoices(){
    const select=$('#voice-select');select.innerHTML='<option>Fish Audio S2.1 Pro · server voice</option>';select.disabled=true;
  }
  function renderSettings(){fillVoices();$('#auto-speak-toggle').setAttribute('aria-checked',String(!!settings.autoSpeak));$('#spoiler-toggle').setAttribute('aria-checked',String(!!settings.spoilerSafe));$('#setting-text-size').textContent=['Comfortable','Larger','Largest'][settings.textSize];$('#live-consent-wrap').hidden=!state.backend;$('#live-consent').checked=!!settings.liveConsent;$('#connection-state').textContent=live()?'Live model':state.backend?'Available · opt in':'Demo mode';$('#connection-description').textContent=state.backend?`The server has a model configured${state.model?`: ${state.model}`:''}. Turn on live AI below to send selected passages and questions to the model provider. Book narration uses Fish Audio through OpenRouter.`:'Sample books have prepared, passage-specific answers. Uploaded books can be narrated and quoted; live explanations are not included in this audio MVP.';}
  function updateMode(){const isLive=live();$('#mode-badge').innerHTML=`<span></span>${isLive?'Live companion':'Demo companion'}`;$('#companion-disclaimer').textContent=isLive?'AI can make mistakes · check the original text':'Prepared demo answers · not a live AI model';}
  function changeTextSize(){settings.textSize=(settings.textSize+1)%3;document.documentElement.style.setProperty('--text-size',[17,19,21][settings.textSize]+'px');saveSettings();$('#setting-text-size').textContent=['Comfortable','Larger','Largest'][settings.textSize];toast(`Reading size: ${['comfortable','larger','largest'][settings.textSize]}.`);}
  function requestConfirm(title,description,button,callback){$('#confirm-title').textContent=title;$('#confirm-description').textContent=description;$('#confirm-button').textContent=button;confirmCallback=callback;$('#confirm-dialog').showModal();}
  function clearData(){requestConfirm('A fresh beginning?','This will remove uploaded books, saved insights, conversations, and reading positions from this browser. The three BookWormAI originals will remain.','Clear local data',()=>{cancelQuestion();stopSpeech();stopRecognition();void audio.clear();uploads=[];insights=[];positions={};books=[...originalBooks];state.messages={};for(const key of ['uploads','insights','positions','current-book'])try{localStorage.removeItem(STORE+key);}catch{}$('#settings-dialog').close();openBook('wonder',0);toast('Your local books and notes have been cleared.');});}
  function stopRecognition(){if(recognition){try{recognition.abort();}catch{}recognition=null;}state.voiceActive=false;$('#voice-notice').hidden=true;$('#mic-button').classList.remove('is-recording');$('#mic-button').setAttribute('aria-label','Ask using your microphone');}
  function startRecognition(){
    if(state.voiceActive){try{recognition?.stop();}catch{}return;}
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){toast('Voice input is unavailable in this browser. Type your question instead.',true);askFocus();return;}
    pauseNarration();let recog;try{recog=new Recognition();}catch{toast('Your browser could not start voice input. Please type your question.',true);return;}
    recognition=recog;recog.lang=selectedVoice()?.lang||'en-US';recog.continuous=false;recog.interimResults=true;let finalText='';
    recog.onstart=()=>{state.voiceActive=true;$('#voice-notice').hidden=false;$('#mic-button').classList.add('is-recording');$('#mic-button').setAttribute('aria-label','Stop recording');};
    recog.onresult=e=>{let partial='';for(let i=0;i<e.results.length;i++){if(e.results[i].isFinal)finalText=e.results[i][0].transcript;else partial+=e.results[i][0].transcript;}$('#question-input').value=finalText||partial;};
    recog.onerror=e=>{if(e.error==='aborted')return;toast(e.error==='not-allowed'?'Microphone access was not granted. Type your question instead.':e.error==='no-speech'?'No speech was heard. Try again or type your question.':'Voice input could not connect. Type your question instead.',true);};
    recog.onend=()=>{recognition=null;state.voiceActive=false;$('#voice-notice').hidden=true;$('#mic-button').classList.remove('is-recording');$('#mic-button').setAttribute('aria-label','Ask using your microphone');if(finalText)ask(finalText);};
    try{recog.start();}catch{stopRecognition();toast('Voice input could not start. You can still type a question.',true);}
  }
  function mic(){toast('Microphone questions are not included in this audio MVP. You can type a question for the prepared demo companion.');}
  let muted=false;
  const actions={
    upload:()=>showModal('upload-dialog'),settings:()=>showModal('settings-dialog'),play,ask:askFocus,
    continue:()=>{if(!state.playing)play();},'save-passage':savePassage,
    previous:()=>gotoIndex(state.index-1,true),next:()=>gotoIndex(state.index+1,true),
    'next-chapter':()=>{const next=segment().c+1;if(next<book().chapters.length){gotoIndex(book()._starts[next],true);$('#chapter-title').scrollIntoView({behavior:'smooth',block:'center'});}},
    speed:()=>{const rates=[.75,1,1.25,1.5,1.75,2];settings.rate=rates[(rates.indexOf(settings.rate)+1)%rates.length];saveSettings();audio.setRate(settings.rate);updatePlaybackUI();toast(`Narration speed: ${settings.rate}×.`);},
    mute:()=>{muted=!muted;$('#mute-button').innerHTML=icon(muted?'mute':'volume');$('#mute-button').setAttribute('aria-label',muted?'Unmute narration':'Mute narration');audio.setMuted(muted);},
    'text-size':changeTextSize,export:exportInsights,mic,'clear-data':clearData,
    menu:()=>$('#sidebar').classList.toggle('open')
  };
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,label[data-action]');if(!el)return;
    if(el.dataset.action&&actions[el.dataset.action]){e.preventDefault();e.stopPropagation();actions[el.dataset.action]();return;}
    if(el.dataset.close){$('#'+el.dataset.close).close();return;}
    if(el.dataset.view){setView(el.dataset.view);return;}
    if(el.dataset.openBook){openBook(el.dataset.openBook);return;}
    if(el.dataset.tab){setTab(el.dataset.tab);return;}
    if(el.dataset.chapter!==undefined){gotoIndex(book()._starts[Number(el.dataset.chapter)],true);setTab('read');return;}
    if(el.dataset.prompt){ask(el.dataset.prompt);return;}
    if(el.dataset.speakMessage){speakAnswer(thread().find(m=>m.id===el.dataset.speakMessage));return;}
    if(el.dataset.saveMessage){saveMessage(el.dataset.saveMessage);return;}
    if(el.dataset.sourceIndex!==undefined){gotoIndex(Number(el.dataset.sourceIndex));$('.passage.active')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    if(el.dataset.filter){state.filter=el.dataset.filter;renderLibrary();return;}
    if(el.dataset.returnBook){openBook(el.dataset.returnBook,Number(el.dataset.returnIndex));setTimeout(()=>$('.passage.active')?.scrollIntoView({behavior:'smooth',block:'center'}),30);return;}
    if(el.dataset.deleteInsight){const id=el.dataset.deleteInsight;insights=insights.filter(i=>i.id!==id);store('insights',insights);renderInsights();updateCounts();toast('Insight removed.');return;}
    if(el.classList.contains('brand')){e.preventDefault();setView('listen');}
  });
  $('#passages').addEventListener('click',e=>{if(e.target.closest('button'))return;const el=e.target.closest('[data-passage]');if(el)gotoIndex(Number(el.dataset.passage),true);});
  $('#passages').addEventListener('keydown',e=>{if(e.target.closest('button'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();const el=e.target.closest('[data-passage]');if(el)gotoIndex(Number(el.dataset.passage),true);}});
  $('.reader-tabs').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();setTab(state.tab==='read'?'chapters':'read');$(`#tab-${state.tab}`).focus();}});
  $('#question-form').addEventListener('submit',e=>{e.preventDefault();ask($('#question-input').value);});
  $('#question-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask(e.target.value);}});
  $('#question-input').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=Math.min(84,e.target.scrollHeight)+'px';});
  $('#progress').addEventListener('change',e=>gotoIndex(Number(e.target.value),true));
  $('#library-search').addEventListener('input',e=>{state.search=e.target.value;renderLibrary();});
  $('#file-input').addEventListener('change',e=>importFile(e.target.files[0]));
  $('#paste-form').addEventListener('submit',e=>{e.preventDefault();try{addBook(makeTextBook($('#paste-title').value,$('#paste-text').value));}catch(err){$('#upload-error').textContent=err.message;$('#upload-error').hidden=false;}});
  const drop=$('#dropzone');['dragenter','dragover'].forEach(event=>drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragover');}));['dragleave','drop'].forEach(event=>drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragover');}));drop.addEventListener('drop',e=>importFile(e.dataTransfer.files[0]));
  $('#voice-select').addEventListener('change',e=>{settings.voice=e.target.value;saveSettings();const was=state.playing;stopSpeech();if(was)play();});
  $('#auto-speak-toggle').addEventListener('click',()=>{settings.autoSpeak=!settings.autoSpeak;saveSettings();renderSettings();});
  $('#spoiler-toggle').addEventListener('click',()=>{settings.spoilerSafe=!settings.spoilerSafe;saveSettings();renderSettings();});
  $('#live-consent').addEventListener('change',e=>{settings.liveConsent=e.target.checked;saveSettings();updateMode();renderSettings();toast(live()?'Live companion enabled. Questions and selected passages will be sent to the model.':'Live AI disabled. Prepared demo mode is active.');});
  $('#confirm-button').addEventListener('click',()=>{$('#confirm-dialog').close();const callback=confirmCallback;confirmCallback=null;callback?.();});
  $('#sidebar-scrim').addEventListener('click',()=>$('#sidebar').classList.remove('open'));
  $$('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}}));
  document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable||$('dialog[open]'))return;if(e.code==='Space'){e.preventDefault();play();}else if(e.key.toLowerCase()==='q'){e.preventDefault();askFocus();}else if(e.key==='Escape'){stopRecognition();$('#sidebar').classList.remove('open');}});
  window.addEventListener('beforeunload',()=>{savePosition();audio.checkpoint();});
  window.addEventListener('pagehide',()=>audio.checkpoint());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.checkpoint();});
  window.addEventListener('hashchange',()=>setView(location.hash.slice(1)));
  if(hasSpeech)window.speechSynthesis.addEventListener('voiceschanged',fillVoices);
  document.documentElement.style.setProperty('--text-size',[17,19,21][settings.textSize]+'px');
  const savedIndex=Number(positions[state.bookId]||0);state.index=Math.max(0,Math.min(book()._segments.length-1,Number.isFinite(savedIndex)?savedIndex:0));
  loadAudioBook(); audio.setRate(settings.rate);
  audio.subscribe(a=>{
    const changed=state.index!==a.index;state.index=a.index;
    state.playing=a.status==='playing'||a.status==='preparing';
    if(changed){savePosition();renderReader();updateCurrentContext();}else updatePlaybackUI();
  });
  $('#auto-speak-toggle').disabled=true;$('#mic-button').disabled=true;
  renderShelf();renderHero();renderReader();renderChat();updateMode();setView(location.hash.slice(1)||'listen');
  if(/^https?:$/.test(location.protocol)){fetch('/api/config').then(r=>r.ok?r.json():null).then(config=>{if(config){state.backend=!!config.available;state.model=String(config.model||'');updateMode();}}).catch(()=>{});}
  // Deliberately small public interface for integration tests / hackathon extensions.
  window.bookwormai={getState:()=>({view:state.view,bookId:state.bookId,index:state.index,chapter:segment().c,passage:segment().p,playing:state.playing,speakingAnswer:state.speakingAnswer,messages:thread().map(m=>({...m})),bookCount:books.length,insightCount:insights.length,live:live(),rate:settings.rate}),context:()=>contextFor({bookId:state.bookId,index:state.index}),openBook,gotoIndex,ask,makeTextBook,stop:pauseNarration};
})();

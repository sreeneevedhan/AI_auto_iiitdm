<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <style>
    :root { --bg:#f6f7fb; --card:#fff; --text:#1d2433; --muted:#667085; --accent:#4f46e5;
            --accent2:#eef2ff; --border:#e4e7ec; --danger:#d92d20; --ok:#067647; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--text); }
    .wrap { max-width:820px; margin:0 auto; padding:28px 16px 60px; }
    h1 { font-size:28px; margin:0 0 4px; }
    h2 { font-size:20px; margin:0 0 12px; }
    .sub { color:var(--muted); margin:0 0 22px; }
    .card { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:20px; margin-bottom:16px; }
    textarea, input { width:100%; font:inherit; padding:10px 12px; border:1px solid var(--border); border-radius:10px; background:#fff; color:var(--text); }
    textarea { min-height:150px; resize:vertical; }
    label { font-weight:600; font-size:14px; display:block; margin:14px 0 6px; }
    .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .chip { background:var(--accent2); color:var(--accent); border:none; border-radius:999px; padding:6px 12px; cursor:pointer; font-size:13px; }
    .btn { background:var(--accent); color:#fff; border:none; border-radius:10px; padding:12px 18px; font-weight:600; font-size:15px; cursor:pointer; margin:16px 8px 0 0; }
    .btn:disabled { opacity:.6; cursor:wait; }
    .btn.secondary { background:#fff; color:var(--accent); border:1px solid var(--accent); }
    .sec { border-left:4px solid var(--accent); padding-left:10px; margin:22px 0 8px; }
    .sec input { font-weight:700; border:none; padding:6px 0; font-size:16px; }
    .q { display:flex; gap:10px; align-items:flex-start; border:1px solid var(--border); border-radius:10px; padding:10px; margin:8px 0; }
    .q .body { flex:1; min-width:0; }
    .q .body input { border:none; padding:4px 0; }
    .badge { font-size:11px; font-weight:700; background:var(--accent2); color:var(--accent); border-radius:6px; padding:4px 7px; white-space:nowrap; margin-top:4px; }
    .opts { font-size:13px; color:var(--muted); margin-top:2px; }
    .del { background:none; border:none; color:var(--danger); font-size:18px; cursor:pointer; }
    .err { color:var(--danger); margin-top:12px; }
    .meta { color:var(--muted); font-size:14px; }
    .result a { word-break:break-all; color:var(--accent); }
    .result h2 { color:var(--ok); }
    .row { display:flex; gap:20px; flex-wrap:wrap; align-items:center; }
    .row img { border:1px solid var(--border); border-radius:10px; padding:6px; background:#fff; }
    .hidden { display:none; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>📝 EventForm AI</h1>
  <p class="sub">Describe your event → AI designs a tailored feedback form → get a live Google Form, response sheet and QR code in seconds.</p>

  <div class="card">
    <label for="desc">Event description</label>
    <textarea id="desc" placeholder="Purpose, activities/sessions, speakers, tools or tech used, audience, venue, duration..."></textarea>
    <div class="chips">
      <span class="meta">Try a sample:</span>
      <button class="chip" onclick="sample(0)">Python workshop</button>
      <button class="chip" onclick="sample(1)">Cultural fest</button>
      <button class="chip" onclick="sample(2)">Health camp</button>
    </div>
    <label for="email">Organizer email (optional, the links will be emailed to you)</label>
    <input id="email" type="email" placeholder="you@example.com">
    <button class="btn" id="genBtn" onclick="generate()">✨ Generate questions</button>
    <div class="err" id="err1"></div>
  </div>

  <div class="card hidden" id="previewCard">
    <h2>Review &amp; edit before creating</h2>
    <p class="meta" id="count"></p>
    <div id="preview"></div>
    <button class="btn" id="createBtn" onclick="create()">🚀 Create Google Form</button>
    <button class="btn secondary" onclick="generate()">↻ Regenerate</button>
    <div class="err" id="err2"></div>
  </div>

  <div class="card hidden result" id="resultCard"></div>
</div>

<script>
  const SAMPLES = [
    "2-day hands-on Python for Data Science workshop for 2nd-year students. Day 1: Python basics, Jupyter setup with Anaconda, NumPy and Pandas. Day 2: data visualization with Matplotlib and a mini Kaggle-style project in teams of 3. Speakers: two industry data scientists. Students brought their own laptops; Wi-Fi was provided.",
    "College cultural fest 'Aura 2026': one day, about 800 attendees. Events: dance battle, battle of the bands, food stalls, treasure hunt and a DJ night. Registration and entry used online QR tickets. Held across the open-air theatre and main ground.",
    "Free health check-up and blood donation camp organised by the NSS unit in the college auditorium, 4 hours. Activities: blood donation, BMI and blood-pressure checks, and a talk on student nutrition by a doctor. Student volunteers guided donors through registration."
  ];
  const LABELS = { SCALE:'Rating 1–5', NPS:'Recommend 0–10', MULTIPLE_CHOICE:'Single choice',
                   CHECKBOX:'Multi-select', SHORT_TEXT:'Short answer', PARAGRAPH:'Long answer', GRID:'Grid' };
  let spec = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function setBusy(id, busy, label) { $(id).disabled = busy; $(id).textContent = label; }
  function sample(i) { $('desc').value = SAMPLES[i]; }

  function generate() {
    $('err1').textContent = '';
    setBusy('genBtn', true, '⏳ AI is designing your form...');
    google.script.run
      .withSuccessHandler(s => { spec = s; render(); setBusy('genBtn', false, '✨ Generate questions'); })
      .withFailureHandler(e => { $('err1').textContent = e.message; setBusy('genBtn', false, '✨ Generate questions'); })
      .generateQuestions($('desc').value);
  }

  function render() {
    $('previewCard').classList.remove('hidden');
    $('resultCard').classList.add('hidden');
    let html = `<label>Form title</label><input value="${esc(spec.title)}" oninput="spec.title=this.value">`;
    let n = 0;
    spec.sections.forEach((s, si) => {
      html += `<div class="sec"><input value="${esc(s.title)}" oninput="spec.sections[${si}].title=this.value"></div>`;
      s.questions.forEach((q, qi) => {
        n++;
        let extra = '';
        if (q.options.length) extra = 'Options: ' + q.options.join(' · ');
        else if (q.type === 'GRID') extra = 'Rows: ' + q.rows.join(' · ') + ' | Scale: ' + q.columns.join(' · ');
        else if (q.type === 'SCALE') extra = '1 = ' + q.lowLabel + ' … 5 = ' + q.highLabel;
        html += `<div class="q">
          <span class="badge">${LABELS[q.type]}</span>
          <div class="body">
            <input value="${esc(q.title)}" oninput="spec.sections[${si}].questions[${qi}].title=this.value">
            ${extra ? `<div class="opts">${esc(extra)}${q.required ? ' · required' : ''}</div>` : ''}
          </div>
          <button class="del" title="Remove question" onclick="removeQ(${si},${qi})">✕</button>
        </div>`;
      });
    });
    $('preview').innerHTML = html;
    $('count').textContent = n + ' questions in ' + spec.sections.length + ' sections. Click any text to edit it.';
  }

  function removeQ(si, qi) {
    spec.sections[si].questions.splice(qi, 1);
    if (!spec.sections[si].questions.length) spec.sections.splice(si, 1);
    render();
  }

  function create() {
    $('err2').textContent = '';
    setBusy('createBtn', true, '⏳ Creating your Google Form...');
    google.script.run
      .withSuccessHandler(showResult)
      .withFailureHandler(e => { $('err2').textContent = e.message; setBusy('createBtn', false, '🚀 Create Google Form'); })
      .createForm(spec, $('email').value);
  }

  function showResult(r) {
    setBusy('createBtn', false, '🚀 Create Google Form');
    const qr = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(r.shareUrl);
    $('resultCard').innerHTML = `
      <h2>✅ Form created: ${esc(r.title)}</h2>
      <div class="row">
        <img src="${qr}" width="180" height="180" alt="QR code for the form">
        <div>
          <p><b>Share with attendees:</b><br><a href="${r.shareUrl}" target="_blank">${esc(r.shareUrl)}</a></p>
          <p><b>Edit form:</b> <a href="${r.editUrl}" target="_blank">Open in Google Forms editor</a></p>
          <p><b>Responses:</b> <a href="${r.sheetUrl}" target="_blank">Open linked Google Sheet</a></p>
          <p class="meta">${r.questionCount} questions · ${r.sectionCount} sections${r.emailed ? ' · links emailed to organizer' : ''}</p>
        </div>
      </div>`;
    $('resultCard').classList.remove('hidden');
    $('resultCard').scrollIntoView({ behavior: 'smooth' });
  }
</script>
</body>
</html>

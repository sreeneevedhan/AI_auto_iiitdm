/**
 * EventForm AI — turns an event description into a ready-to-share Google Form.
 * Runs entirely on Google Apps Script (frontend + AI call + form creation + hosting).
 *
 * Setup: Project Settings → Script Properties → add GEMINI_API_KEY
 */

const MODEL = 'gemini-2.5-flash'; // If AI Studio lists a newer Flash model, put its exact name here.

const TYPES = ['SCALE', 'NPS', 'MULTIPLE_CHOICE', 'CHECKBOX', 'SHORT_TEXT', 'PARAGRAPH', 'GRID'];

/* ---------- Web app entry point ---------- */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('EventForm AI')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- Step 1: AI designs the questions ---------- */
function generateQuestions(description) {
  description = String(description || '').trim();
  if (description.length < 20) {
    throw new Error('Please describe the event in a bit more detail (purpose, activities, tools used).');
  }

  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY is missing in Script Properties.');

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL +
              ':generateContent?key=' + key;
  const payload = {
    contents: [{ parts: [{ text: buildPrompt_(description.slice(0, 4000)) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('AI request failed (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 300));
  }

  const data = JSON.parse(res.getContentText());
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content &&
                data.candidates[0].content.parts;
  if (!parts || !parts[0] || !parts[0].text) throw new Error('AI returned an empty answer. Please try again.');

  const text = parts[0].text.replace(/^\s*```(json)?/i, '').replace(/```\s*$/, '');
  return sanitize_(JSON.parse(text));
}

function buildPrompt_(description) {
  return `You are an expert event-feedback designer. Read the event description and design a Google Form that collects useful, specific feedback.

EVENT DESCRIPTION:
"""${description}"""

Rules:
- Identify the event's purpose, each activity/session, speakers, and any technical details (tools, software, venue, logistics).
- Section 1 "About You": 1-2 short questions about the respondent (e.g. role, year or department as MULTIPLE_CHOICE when it can be inferred). Never ask for phone numbers.
- Create ONE section per major activity/session mentioned, each with 2-4 specific questions that mention that activity by name.
- Ask about the technical details mentioned (e.g. setup difficulty, tool clarity, audio/visual quality, pace, venue).
- Final section "Overall Experience": overall rating (SCALE), likelihood to recommend (NPS), what they liked most (PARAGRAPH), what to improve (PARAGRAPH), interest in future events (MULTIPLE_CHOICE).
- 10 to 18 questions in total. Clear, neutral, non-leading wording.
- Question types: SCALE (1-5 rating, give lowLabel/highLabel), NPS (0-10), MULTIPLE_CHOICE (one answer, 3-6 options), CHECKBOX (many answers, 3-7 options), SHORT_TEXT, PARAGRAPH, GRID (rate several items on one scale: rows = items, columns = 3-5 scale labels).
- Ratings and key questions are required; open-text questions are not required.

Return ONLY JSON in exactly this shape:
{"title":"...","description":"1-2 friendly sentences shown at the top of the form","sections":[{"title":"...","description":"...","questions":[{"type":"SCALE","title":"...","helpText":"","required":true,"options":[],"rows":[],"columns":[],"lowLabel":"Poor","highLabel":"Excellent"}]}]}`;
}

/* ---------- Validation: never let bad AI output crash form creation ---------- */
function cleanList_(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = {};
  return arr.map(x => String(x).trim()).filter(x => x && !seen[x] && (seen[x] = true));
}

function sanitize_(spec) {
  if (!spec || !Array.isArray(spec.sections)) {
    throw new Error('AI returned an unexpected format. Please click Generate again.');
  }
  const sections = spec.sections
    .filter(s => s && Array.isArray(s.questions))
    .map(s => ({
      title: String(s.title || 'Feedback').slice(0, 200),
      description: String(s.description || ''),
      questions: s.questions
        .filter(q => q && String(q.title || '').trim())
        .map(q => {
          let type = TYPES.indexOf(q.type) >= 0 ? q.type : 'SHORT_TEXT';
          const options = cleanList_(q.options);
          const rows = cleanList_(q.rows);
          const columns = cleanList_(q.columns);
          if ((type === 'MULTIPLE_CHOICE' || type === 'CHECKBOX') && options.length < 2) type = 'SHORT_TEXT';
          if (type === 'GRID' && (rows.length < 1 || columns.length < 2)) type = 'SCALE';
          return {
            type: type,
            title: String(q.title).trim().slice(0, 500),
            helpText: String(q.helpText || ''),
            required: !!q.required,
            options: options,
            rows: rows,
            columns: columns,
            lowLabel: String(q.lowLabel || 'Poor'),
            highLabel: String(q.highLabel || 'Excellent')
          };
        })
    }))
    .filter(s => s.questions.length);

  if (!sections.length) throw new Error('No usable questions were generated. Please try again.');
  return {
    title: String(spec.title || 'Event Feedback Form').slice(0, 200),
    description: String(spec.description || 'We would love to hear your feedback!'),
    sections: sections
  };
}

/* ---------- Step 2: build the real Google Form ---------- */
function createForm(spec, organizerEmail) {
  spec = sanitize_(spec);

  const form = FormApp.create(spec.title);
  form.setDescription(spec.description)
      .setProgressBar(true)
      .setConfirmationMessage('Thanks for sharing your feedback! 🙌');
  try { form.setRequireLogin(false); } catch (e) {} // only exists on Workspace accounts

  spec.sections.forEach((sec, i) => {
    if (i === 0) form.addSectionHeaderItem().setTitle(sec.title).setHelpText(sec.description);
    else form.addPageBreakItem().setTitle(sec.title).setHelpText(sec.description);
    sec.questions.forEach(q => addQuestion_(form, q));
  });

  // Responses go straight into a Google Sheet
  const ss = SpreadsheetApp.create(spec.title + ' – Responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // Newer Forms versions create forms unpublished; publish if the method exists
  try { form.setPublished(true); } catch (e) {}
  try { form.setAcceptingResponses(true); } catch (e) {}

  const publishedUrl = form.getPublishedUrl();
  let shareUrl = publishedUrl;
  try { shareUrl = form.shortenFormUrl(publishedUrl); } catch (e) {}

  const result = {
    title: spec.title,
    shareUrl: shareUrl,
    editUrl: form.getEditUrl(),
    sheetUrl: ss.getUrl(),
    sectionCount: spec.sections.length,
    questionCount: spec.sections.reduce((n, s) => n + s.questions.length, 0),
    emailed: false
  };

  organizerEmail = String(organizerEmail || '').trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(organizerEmail)) {
    try {
      MailApp.sendEmail({
        to: organizerEmail,
        subject: 'Your feedback form is ready: ' + spec.title,
        htmlBody:
          '<p>Your AI-generated feedback form is live.</p>' +
          '<p><b>Share with attendees:</b> <a href="' + shareUrl + '">' + shareUrl + '</a></p>' +
          '<p><b>Edit the form:</b> <a href="' + result.editUrl + '">Open editor</a></p>' +
          '<p><b>Responses sheet:</b> <a href="' + result.sheetUrl + '">Open Google Sheet</a></p>'
      });
      result.emailed = true;
    } catch (e) {}
  }
  return result;
}

function addQuestion_(form, q) {
  let item;
  switch (q.type) {
    case 'SCALE':
      item = form.addScaleItem().setBounds(1, 5).setLabels(q.lowLabel, q.highLabel);
      break;
    case 'NPS':
      item = form.addScaleItem().setBounds(0, 10).setLabels('Not likely', 'Very likely');
      break;
    case 'MULTIPLE_CHOICE':
      item = form.addMultipleChoiceItem().setChoiceValues(q.options);
      break;
    case 'CHECKBOX':
      item = form.addCheckboxItem().setChoiceValues(q.options);
      break;
    case 'GRID':
      item = form.addGridItem().setRows(q.rows).setColumns(q.columns);
      break;
    case 'PARAGRAPH':
      item = form.addParagraphTextItem();
      break;
    default:
      item = form.addTextItem();
  }
  item.setTitle(q.title).setRequired(q.required);
  if (q.helpText) item.setHelpText(q.helpText);
}

/* ---------- Run this once from the editor to grant permissions & smoke-test ---------- */
function testRun() {
  const spec = generateQuestions(
    'A 1-day hands-on Git and GitHub workshop for first-year CSE students. Session 1: Git basics and ' +
    'installing Git on Windows. Session 2: branching and pull requests on GitHub. Ended with a team ' +
    'mini-hackathon. Speaker: a senior open-source contributor. Held in Lab 3 with college PCs.'
  );
  Logger.log(JSON.stringify(spec, null, 2));
  Logger.log(JSON.stringify(createForm(spec, ''), null, 2));
}

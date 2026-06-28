import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_SCREENSHOT_LIMIT = 1;
const PROMPT_TEMPLATE_FILE = path.resolve('config/ai-failure-analysis-prompt.md');
const PLAYWRIGHT_JSON_REPORT_FILE = path.resolve('test-results/results.json');

/// find error-context.md and screenshot files recursively in the given directory
export function findFiles(dir, matcher) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return findFiles(fullPath, matcher);
    }

    return matcher(fullPath) ? [fullPath] : [];
  });
}

// parse a positive integer from a string, or return the fallback value if invalid  
//using for AI_SCREENSHOT_LIMIT environment variable
export function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

// select the most recent files based on modification time, limited to the specified number
//it's used to select the most recent screenshots for AI analysis
export function selectMostRecentFiles(files, limit) {
  return [...files]
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, limit);
}

// determine the MIME type based on file extension, defaulting to image/png
function getMimeType(file) {
  const extension = path.extname(file).toLowerCase();

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  return 'image/png';
}

// build a combined error context string from the contents of all error-context.md files
function buildErrorContext(errorFiles) {
  return errorFiles
    .map((file) => {
      const relativePath = path.relative(process.cwd(), file);
      const content = fs.readFileSync(file, 'utf8');

      return `## ${relativePath}\n\n${content}`;
    })
    .join('\n\n');
}

// build image parts for the AI model
function buildImageParts(screenshots) {
  return screenshots.map((file) => ({
    inlineData: {
      mimeType: getMimeType(file),
      data: fs.readFileSync(file).toString('base64'),
    },
  }));
}

// build the prompt for the AI model, including error context and selected screenshots
function buildPrompt(
  errorContext,
  selectedScreenshots,
  reportData,
  technicalEvidence,
) {
  const screenshotList = selectedScreenshots
    .map((file) => `- ${path.relative(process.cwd(), file)}`)
    .join('\n');
  const template = fs.readFileSync(PROMPT_TEMPLATE_FILE, 'utf8');

  return template
    .replace('{{selectedScreenshots}}', screenshotList || '- No screenshots found')
    .replace('{{errorContext}}', errorContext || 'No error context file found.')
    .replace('{{failureDetails}}', JSON.stringify(reportData.failedTest, null, 2))
    .replace('{{technicalEvidence}}', JSON.stringify(technicalEvidence, null, 2));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const CLASSIFICATION_LABELS = {
  TEST_CODE: 'Test Code Error',
  APPLICATION: 'Application Problem',
  TEST_DATA: 'Test Data Problem',
  ENVIRONMENT: 'Environment Problem',
  NETWORK: 'Network Problem',
  FLAKY: 'Flaky Test',
};

export function getClassificationLabel(classification) {
  return CLASSIFICATION_LABELS[classification] || classification;
}

function emptyTechnicalEvidence() {
  return {
    page: { url: 'Not reported', title: 'Not reported', readyState: 'unknown' },
    navigation: null,
    failedRequests: [],
    httpErrors: [],
    consoleErrors: [],
  };
}

function collectSpecs(suites) {
  return suites.flatMap((suite) => [
    ...(suite.specs || []),
    ...collectSpecs(suite.suites || []),
  ]);
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function getLineValue(message, label) {
  return message.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'))?.[1];
}

export function extractReportData(report) {
  const specs = collectSpecs(report.suites || []);
  const failedSpec = specs.find((spec) =>
    spec.tests.some((test) =>
      test.results.some((result) => ['failed', 'timedOut'].includes(result.status)),
    ),
  );

  if (!failedSpec) {
    throw new Error('No failed test found in the Playwright JSON report.');
  }

  const failedTest = failedSpec.tests.find((test) =>
    test.results.some((result) => ['failed', 'timedOut'].includes(result.status)),
  );
  const failedResult = [...failedTest.results]
    .reverse()
    .find((result) => ['failed', 'timedOut'].includes(result.status));
  const error = failedResult.errors?.[0] || {};
  const errorMessage = stripAnsi(error.message || 'Error details were not reported.');
  const errorLines = [...errorMessage.matchAll(/^Error:\s*(.+)$/gm)];
  const relativeFile = failedSpec.file.startsWith('tests/')
    ? failedSpec.file
    : path.posix.join('tests', failedSpec.file);
  const errorLine = error.location?.line || failedSpec.line;
  const total =
    report.stats.expected +
    report.stats.unexpected +
    report.stats.flaky +
    report.stats.skipped;

  return {
    stats: {
      passed: report.stats.expected,
      failed: report.stats.unexpected,
      flaky: report.stats.flaky,
      skipped: report.stats.skipped,
      total,
      duration: report.stats.duration,
      startedAt: report.stats.startTime,
    },
    failedTest: {
      title: failedSpec.title,
      file: relativeFile,
      line: errorLine,
      project: failedTest.projectName,
      duration: failedResult.duration,
      retryResult:
        failedResult.retry > 0
          ? `Failed after retry ${failedResult.retry}`
          : 'Not retried',
      errorType: errorLines[0]?.[1] || errorMessage.split('\n')[0],
      locator: getLineValue(errorMessage, 'Locator') || 'Not reported',
      expected: getLineValue(errorMessage, 'Expected') || 'Not reported',
      actual:
        getLineValue(errorMessage, 'Received') ||
        getLineValue(errorMessage, 'Actual') ||
        errorLines.at(-1)?.[1] ||
        'Not reported',
      reproductionCommand: `npx playwright test ${relativeFile}:${failedSpec.line} --project=${failedTest.projectName}`,
    },
  };
}

function formatDuration(duration) {
  return duration >= 1000
    ? `${(duration / 1000).toFixed(1)}s`
    : `${Math.round(duration)}ms`;
}

export function buildHtmlReport(
  analysis,
  reportData,
  technicalEvidence,
  screenshots,
) {
  const screenshotSections = screenshots
    .map((file, index) => {
      const mimeType = getMimeType(file);
      const imageData = fs.readFileSync(file).toString('base64');
      const dataUrl = `data:${mimeType};base64,${imageData}`;

      return `<img src="${dataUrl}" alt="Failure screenshot ${index + 1}">`;
    })
    .join('\n');
  const { failedTest, stats } = reportData;
  const actions = analysis.recommendedActions
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join('');
  const networkIssues = [
    ...technicalEvidence.failedRequests.map(
      (issue) =>
        `${issue.method} ${issue.url} - ${issue.errorText}`,
    ),
    ...technicalEvidence.httpErrors.map(
      (issue) => `${issue.method} ${issue.url} - HTTP ${issue.status}`,
    ),
  ];
  const networkEvidence = networkIssues.length
    ? `<ul class="evidence-list">${networkIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>`
    : '<p class="evidence-status">No failed requests or HTTP errors were captured.</p>';
  const consoleEvidence = technicalEvidence.consoleErrors.length
    ? `<ul class="evidence-list">${technicalEvidence.consoleErrors.map((issue) => `<li>${escapeHtml(`${issue.text} - ${issue.url}`)}</li>`).join('')}</ul>`
    : '<p class="evidence-status">No browser console errors were captured.</p>';
  const navigation = technicalEvidence.navigation
    ? `${technicalEvidence.navigation.status} ${technicalEvidence.navigation.url}`
    : 'No navigation response captured';
  const environment = escapeHtml(process.env.TEST_ENV || 'local');
  const startedAt = new Date(stats.startedAt).toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Failure Intelligence - ${escapeHtml(failedTest.title)}</title>
  <style>
    :root { --ink:#1f252c; --muted:#68717d; --line:#dfe3e8; --surface:#fff; --canvas:#f5f7f9; --danger:#b93832; --danger-soft:#fbe9e7; --success:#247a55; --success-soft:#e8f5ee; --link:#1f6596; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:var(--canvas); font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:15px; line-height:1.55; }
    h1,h2,h3,p { margin-top:0; }
    h1 { margin-bottom:5px; font-size:25px; line-height:1.25; letter-spacing:0; }
    h2 { margin-bottom:18px; font-size:18px; line-height:1.3; letter-spacing:0; }
    h3 { margin-bottom:7px; font-size:14px; line-height:1.4; letter-spacing:0; }
    code { overflow-wrap:anywhere; font-family:"SFMono-Regular",Consolas,monospace; font-size:13px; }
    .shell { width:min(1120px,calc(100% - 40px)); margin:0 auto; }
    .topbar { color:#fff; background:#20252b; }
    .topbar-inner { min-height:58px; display:flex; align-items:center; justify-content:space-between; gap:20px; }
    .brand { font-size:14px; font-weight:720; }
    .run-meta { color:#bec5cd; font-size:12px; font-variant-numeric:tabular-nums; }
    .hero { padding:32px 0 26px; background:var(--surface); border-bottom:1px solid var(--line); }
    .hero-row { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; }
    .eyebrow,.metric-label { color:var(--muted); font-size:11px; font-weight:750; text-transform:uppercase; }
    .eyebrow { margin-bottom:7px; }
    .subtitle { margin-bottom:0; color:var(--muted); }
    .status { flex:0 0 auto; padding:6px 9px; color:var(--danger); background:var(--danger-soft); border:1px solid #efc6c2; border-radius:4px; font-size:12px; font-weight:800; }
    .metrics { display:grid; grid-template-columns:repeat(4,1fr); background:var(--surface); border-bottom:1px solid var(--line); }
    .metric { padding:17px 20px; border-right:1px solid var(--line); }
    .metric:last-child { border-right:0; }
    .metric-label,.metric-value { display:block; }
    .metric-value { margin-top:3px; font-size:14px; font-weight:720; }
    main { padding:30px 0 48px; }
    .section { padding:26px 0 30px; border-bottom:1px solid var(--line); }
    .detail-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 32px; }
    .detail { padding:11px 0; border-bottom:1px solid #e8ebee; }
    .detail-label { display:block; margin-bottom:3px; color:var(--muted); font-size:11px; font-weight:700; text-transform:uppercase; }
    .detail-value { overflow-wrap:anywhere; }
    .evidence-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }
    .evidence-block { min-width:0; padding:14px; background:#fff; border:1px solid var(--line); }
    .evidence-block.wide { grid-column:span 2; }
    .evidence-block p { margin-bottom:0; overflow-wrap:anywhere; }
    .evidence-list { margin:0; padding-left:18px; overflow-wrap:anywhere; }
    .evidence-status { color:var(--muted); }
    .analysis-grid { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr); gap:34px; }
    .finding { padding:0 0 17px 14px; border-left:3px solid var(--danger); }
    .finding + .finding { margin-top:17px; border-left-color:#8190a0; }
    .finding p { margin-bottom:0; color:#3c444d; }
    .steps { margin:0; padding:0; list-style:none; counter-reset:step; }
    .steps li { position:relative; min-height:36px; padding:0 0 18px 42px; color:#3c444d; counter-increment:step; }
    .steps li::before { content:counter(step); position:absolute; left:0; top:0; width:27px; height:27px; display:grid; place-items:center; color:var(--success); background:var(--success-soft); border:1px solid #badfca; border-radius:50%; font-size:12px; font-weight:800; }
    .screenshots { display:grid; gap:18px; }
    img { display:block; width:100%; height:auto; border:1px solid #d7dde3; }
    .command { display:block; margin-top:18px; padding:12px 14px; color:#dce3ea; background:#20252b; border-radius:4px; }
    .report-heading { display:flex; align-items:center; justify-content:space-between; gap:20px; }
    .report-heading p { margin-bottom:0; color:var(--muted); }
    .open-link { flex:0 0 auto; padding:9px 13px; color:#fff; background:var(--link); border-radius:4px; font-size:13px; font-weight:700; text-decoration:none; }
    iframe { width:100%; height:760px; margin-top:18px; background:#fff; border:1px solid var(--line); }
    @media (max-width:760px) {
      .shell { width:min(calc(100% - 28px),1120px); }
      .topbar-inner,.hero-row,.report-heading { align-items:flex-start; flex-direction:column; padding-top:12px; padding-bottom:12px; }
      .metrics { grid-template-columns:1fr 1fr; }
      .detail-grid { grid-template-columns:1fr; }
      .evidence-grid { grid-template-columns:1fr; }
      .evidence-block.wide { grid-column:auto; }
      .metric:nth-child(2) { border-right:0; }
      .metric:nth-child(-n+2) { border-bottom:1px solid var(--line); }
      .analysis-grid { grid-template-columns:1fr; }
      iframe { height:620px; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="shell topbar-inner">
      <div class="brand">Playwright QA Automation</div>
      <div class="run-meta">${escapeHtml(failedTest.project)} / ${escapeHtml(startedAt)}</div>
    </div>
  </header>
  <section class="hero">
    <div class="shell hero-row">
      <div><div class="eyebrow">Failure intelligence</div><h1>${escapeHtml(failedTest.title)}</h1><p class="subtitle">AI-assisted diagnosis with complete Playwright execution evidence.</p></div>
      <div class="status">FAILED</div>
    </div>
  </section>
  <div class="metrics shell">
    <div class="metric"><span class="metric-label">Classification</span><span class="metric-value">${escapeHtml(getClassificationLabel(analysis.classification))}</span></div>
    <div class="metric"><span class="metric-label">Browser / Project</span><span class="metric-value">${escapeHtml(failedTest.project)}</span></div>
    <div class="metric"><span class="metric-label">Tests</span><span class="metric-value">${stats.total} total / ${stats.failed} failed</span></div>
    <div class="metric"><span class="metric-label">Environment</span><span class="metric-value">${environment}</span></div>
  </div>
  <main class="shell">
    <section class="section">
      <h2>Failure details</h2>
      <div class="detail-grid">
        <div class="detail"><span class="detail-label">Error</span><span class="detail-value">${escapeHtml(failedTest.errorType)}</span></div>
        <div class="detail"><span class="detail-label">Spec location</span><code class="detail-value">${escapeHtml(`${failedTest.file}:${failedTest.line}`)}</code></div>
        <div class="detail"><span class="detail-label">Locator</span><code class="detail-value">${escapeHtml(failedTest.locator)}</code></div>
        <div class="detail"><span class="detail-label">Retry result</span><span class="detail-value">${escapeHtml(failedTest.retryResult)}</span></div>
        <div class="detail"><span class="detail-label">Expected</span><span class="detail-value">${escapeHtml(failedTest.expected)}</span></div>
        <div class="detail"><span class="detail-label">Actual</span><span class="detail-value">${escapeHtml(failedTest.actual)}</span></div>
        <div class="detail"><span class="detail-label">Test duration</span><span class="detail-value">${formatDuration(failedTest.duration)}</span></div>
        <div class="detail"><span class="detail-label">Suite duration</span><span class="detail-value">${formatDuration(stats.duration)}</span></div>
      </div>
    </section>
    <section class="section">
      <h2>Technical evidence</h2>
      <div class="evidence-grid">
        <div class="evidence-block"><h3>Page state</h3><p>${escapeHtml(`${technicalEvidence.page.readyState} - ${technicalEvidence.page.title}`)}</p></div>
        <div class="evidence-block"><h3>Current URL</h3><p>${escapeHtml(technicalEvidence.page.url)}</p></div>
        <div class="evidence-block"><h3>Navigation</h3><p>${escapeHtml(navigation)}</p></div>
        <div class="evidence-block wide"><h3>Network evidence</h3>${networkEvidence}</div>
        <div class="evidence-block"><h3>Console evidence</h3>${consoleEvidence}</div>
      </div>
    </section>
    <section class="section">
      <h2>AI diagnosis</h2>
      <div class="analysis-grid">
        <div>
          <div class="finding"><h3>Probable root cause</h3><p>${escapeHtml(analysis.probableRootCause)}</p></div>
          <div class="finding"><h3>Observed page state</h3><p>${escapeHtml(analysis.observedPageState)}</p></div>
        </div>
        <div><h3>Recommended actions</h3><ol class="steps">${actions}</ol></div>
      </div>
    </section>
    <section class="section">
      <h2>Failure evidence</h2>
      ${screenshotSections ? `<div class="screenshots">${screenshotSections}</div>` : '<p>No failure screenshot was captured.</p>'}
      <code class="command">${escapeHtml(failedTest.reproductionCommand)}</code>
    </section>
    <section class="section">
      <div class="report-heading">
        <div><h2>Complete Playwright report</h2><p>${stats.passed} passed / ${stats.failed} failed / ${stats.flaky} flaky / ${stats.skipped} skipped</p></div>
        <a class="open-link" href="../playwright-report/index.html" target="_blank">Open full report</a>
      </div>
      <iframe src="../playwright-report/index.html" title="Playwright Test Report"></iframe>
    </section>
  </main>
</body>
</html>`;
}

export async function analyzeFailure() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const screenshotLimit = parsePositiveInteger(
    process.env.AI_SCREENSHOT_LIMIT,
    DEFAULT_SCREENSHOT_LIMIT,
  );

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY. Create a local .env file first.');
  }

  if (!fs.existsSync(PLAYWRIGHT_JSON_REPORT_FILE)) {
    throw new Error('Missing Playwright JSON report. Run the full test suite first.');
  }

  const testResultsDir = path.resolve('test-results');
  const outputDir = path.resolve('ai-report');
  const outputFile = path.join(outputDir, 'failure-analysis.html');

  const errorFiles = findFiles(testResultsDir, (file) =>
    file.endsWith('error-context.md'),
  );
  const screenshots = findFiles(testResultsDir, (file) =>
    /\.(png|jpg|jpeg)$/i.test(file),
  );
  const technicalEvidenceFiles = findFiles(testResultsDir, (file) =>
    file.endsWith('technical-evidence.json'),
  );
  const selectedScreenshots = selectMostRecentFiles(screenshots, screenshotLimit);
  const technicalEvidenceFile = selectMostRecentFiles(
    technicalEvidenceFiles,
    1,
  )[0];
  const technicalEvidence = technicalEvidenceFile
    ? JSON.parse(fs.readFileSync(technicalEvidenceFile, 'utf8'))
    : emptyTechnicalEvidence();

  if (errorFiles.length === 0 && selectedScreenshots.length === 0) {
    throw new Error('No failure artifacts found. Run a failing Playwright test first.');
  }

  const errorContext = buildErrorContext(errorFiles);
  const imageParts = buildImageParts(selectedScreenshots);
  const playwrightReport = JSON.parse(
    fs.readFileSync(PLAYWRIGHT_JSON_REPORT_FILE, 'utf8'),
  );
  const reportData = extractReportData(playwrightReport);
  const prompt = buildPrompt(
    errorContext,
    selectedScreenshots,
    reportData,
    technicalEvidence,
  );
  const ai = new GoogleGenAI({ apiKey });

  // generate the AI failure analysis report
  const response = await ai.models.generateContent({
    model,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          classification: {
            type: Type.STRING,
            enum: [
              'TEST_CODE',
              'APPLICATION',
              'TEST_DATA',
              'ENVIRONMENT',
              'NETWORK',
              'FLAKY',
            ],
          },
          probableRootCause: { type: Type.STRING },
          observedPageState: { type: Type.STRING },
          recommendedActions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            maxItems: 3,
          },
        },
        required: [
          'classification',
          'probableRootCause',
          'observedPageState',
          'recommendedActions',
        ],
      },
    },
    contents: [
      {
        text: prompt,
      },
      ...imageParts,
    ],
  });
  const analysis = JSON.parse(response.text || '{}');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    outputFile,
    buildHtmlReport(
      analysis,
      reportData,
      technicalEvidence,
      selectedScreenshots,
    ),
  );

  console.log(
    `Selected ${selectedScreenshots.length} recent screenshot(s), configured limit: ${screenshotLimit}.`,
  );
  console.log(`AI failure analysis written to ${outputFile}`);
}

const currentFile = pathToFileURL(fileURLToPath(import.meta.url)).href;

if (process.argv[1] && pathToFileURL(process.argv[1]).href === currentFile) {
  analyzeFailure().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

const POSTMARK_URL = "https://api.postmarkapp.com/email";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clean(value, fallback = "-") {
  const v = String(value ?? "").trim();
  return v ? v : fallback;
}

function toScoreNumber(value) {
  return Number(String(value || "0").replace("/100", "").trim()) || 0;
}

function parsePhaseScores(raw = "") {
  const text = String(raw || "");
  const parts = text.split("|").map((s) => s.trim()).filter(Boolean);

  const result = {
    input: 0,
    activation: 0,
    action: 0,
    output: 0,
  };

  for (const part of parts) {
    const [label, valuePart] = part.split(":").map((s) => s.trim());
    const value = Number(String(valuePart || "0").replace("/100", "").trim()) || 0;

    if (/input/i.test(label)) result.input = value;
    else if (/aktivacija|activation/i.test(label)) result.activation = value;
    else if (/akcija|action/i.test(label)) result.action = value;
    else if (/output/i.test(label)) result.output = value;
  }

  return result;
}

function parseList(raw = "") {
  const text = String(raw || "").trim();
  if (!text || text === "-") return [];
  return text
    .split("||")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatDateME(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("sr-Latn-ME", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function slugifyFileName(value = "report") {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "report";
}

function getScoreColor(score) {
  if (score < 50) return { hex: "#E05555", rgb: rgb(224 / 255, 85 / 255, 85 / 255) };
  if (score < 68) return { hex: "#C9A028", rgb: rgb(201 / 255, 160 / 255, 40 / 255) };
  if (score < 85) return { hex: "#3A8FD4", rgb: rgb(58 / 255, 143 / 255, 212 / 255) };
  return { hex: "#27AE60", rgb: rgb(39 / 255, 174 / 255, 96 / 255) };
}

function getPrioritiesFromPhaseScores(phaseScores) {
  const items = [
    {
      label: "INPUT",
      value: Number(phaseScores.input || 0),
      text: "Razjasniti ICP, poziciju i poruku na svim touchpointima.",
    },
    {
      label: "AKTIVACIJA",
      value: Number(phaseScores.activation || 0),
      text: "Uvesti lead magnet, nurturing i automatizovani first-touch.",
    },
    {
      label: "AKCIJA",
      value: Number(phaseScores.action || 0),
      text: "Postaviti offer ladder, sales materijale i CRM follow-up disciplinu.",
    },
    {
      label: "OUTPUT",
      value: Number(phaseScores.output || 0),
      text: "Aktivirati retention, referral i review sistem kao kanal rasta.",
    },
  ];

  return items
    .sort((a, b) => a.value - b.value)
    .slice(0, 2)
    .map((item) => `${item.label}: ${item.text}`);
}

async function sendPostmarkEmail({
  serverToken,
  from,
  to,
  subject,
  htmlBody,
  textBody,
  attachments = [],
}) {
  const response = await fetch(POSTMARK_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverToken,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: "outbound",
      Attachments: attachments,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Postmark error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function buildOwnerHtml(data) {
  return `
  <div style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,sans-serif;color:#0b1929;">
    <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dde7ef;border-radius:16px;overflow:hidden;">
      <div style="background:#0b1929;padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7fa9c8;font-weight:700;margin-bottom:10px;">
          Wellbeing Compass
        </div>
        <div style="font-size:30px;line-height:1.15;color:#ffffff;font-weight:700;">
          Nova dijagnostika
        </div>
      </div>

      <div style="padding:28px 32px;">
        <table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.7;">
          <tr><td style="padding:8px 0;font-weight:700;width:170px;">Ime:</td><td style="padding:8px 0;">${escapeHtml(data.name)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;">Email:</td><td style="padding:8px 0;">${escapeHtml(data.email)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;">Kompanija:</td><td style="padding:8px 0;">${escapeHtml(data.company)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;">Branša:</td><td style="padding:8px 0;">${escapeHtml(data.industry)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;">Score:</td><td style="padding:8px 0;">${escapeHtml(String(data.score))}/100</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;">Izazovi:</td><td style="padding:8px 0;">${escapeHtml(data.challenges)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;">Poruka:</td><td style="padding:8px 0;">${escapeHtml(data.message)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;">Jezik:</td><td style="padding:8px 0;">${escapeHtml(data.language)}</td></tr>
        </table>

        <div style="margin-top:24px;padding:18px 20px;background:#f7fbff;border:1px solid #d9e8f4;border-radius:12px;">
          <div style="font-size:13px;font-weight:700;color:#2b5878;margin-bottom:8px;">Phase scores</div>
          <div style="font-size:14px;color:#29455a;line-height:1.7;">
            INPUT: ${data.phaseScores.input}/100 |
            AKTIVACIJA: ${data.phaseScores.activation}/100 |
            AKCIJA: ${data.phaseScores.action}/100 |
            OUTPUT: ${data.phaseScores.output}/100
          </div>
        </div>

        <div style="margin-top:20px;padding:18px 20px;background:#fff8f8;border:1px solid #f0d2d2;border-radius:12px;">
          <div style="font-size:13px;font-weight:700;color:#a43c3c;margin-bottom:8px;">Critical gaps</div>
          <div style="font-size:14px;color:#5c3b3b;line-height:1.7;">${escapeHtml(data.criticalGaps.join(" || ") || "-")}</div>
        </div>

        <div style="margin-top:20px;padding:18px 20px;background:#f8fffa;border:1px solid #d3ecd9;border-radius:12px;">
          <div style="font-size:13px;font-weight:700;color:#2b7a4b;margin-bottom:8px;">Strengths</div>
          <div style="font-size:14px;color:#30513e;line-height:1.7;">${escapeHtml(data.strengths.join(" || ") || "-")}</div>
        </div>
      </div>
    </div>
  </div>
  `;
}

function buildOwnerText(data) {
  return [
    "Nova Wellbeing Compass dijagnostika",
    `Ime: ${data.name}`,
    `Email: ${data.email}`,
    `Kompanija: ${data.company}`,
    `Branša: ${data.industry}`,
    `Score: ${data.score}/100`,
    `Izazovi: ${data.challenges}`,
    `Poruka: ${data.message}`,
    `Jezik: ${data.language}`,
    `Phase scores: INPUT ${data.phaseScores.input}/100 | AKTIVACIJA ${data.phaseScores.activation}/100 | AKCIJA ${data.phaseScores.action}/100 | OUTPUT ${data.phaseScores.output}/100`,
    `Critical gaps: ${data.criticalGaps.join(" || ") || "-"}`,
    `Strengths: ${data.strengths.join(" || ") || "-"}`,
  ].join("\n");
}

function buildClientHtml(data) {
  return `
  <div style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#0b1929;">
    <div style="max-width:720px;margin:0 auto;padding:32px 20px;">

      <div style="background:#0b1929;border-radius:18px;overflow:hidden;border:1px solid #16314d;">
        <div style="padding:42px 40px 36px 40px;background:linear-gradient(180deg,#0b1929 0%,#10233a 100%);">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7fa9c8;font-weight:700;margin-bottom:14px;">
            Wellbeing Compass · Growth Method™
          </div>

          <h1 style="margin:0 0 10px 0;font-size:36px;line-height:1.1;color:#f4f8fc;font-weight:700;">
            Vaš dijagnostički izvještaj
          </h1>

          <p style="margin:0 0 28px 0;font-size:16px;line-height:1.7;color:#b9d2e6;">
            Hvala što ste završili Wellbeing Compass dijagnostiku.
          </p>

          <div style="background:#15304f;border:1px solid #24496d;border-radius:14px;padding:22px 24px;max-width:320px;">
            <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8db6d6;margin-bottom:8px;">
              Vaš score
            </div>
            <div style="font-size:48px;line-height:1;color:#56a6ff;font-weight:700;">
              ${escapeHtml(String(data.score))}/100
            </div>
          </div>

          <div style="margin-top:28px;font-size:16px;line-height:1.8;color:#d7e6f2;">
            Zdravo ${escapeHtml(data.name)},<br><br>
            detaljan Wellbeing Compass izvještaj nalazi se u <strong>PDF prilogu</strong> ovog maila.
            Pregledaćemo vašu prijavu i javiti vam se sa sljedećim korakom.
          </div>
        </div>
      </div>

      <div style="padding:18px 6px 0 6px;font-size:13px;line-height:1.7;color:#5e7387;text-align:center;">
        Wellbeing Compass · ${escapeHtml(data.replyEmail)}
      </div>
    </div>
  </div>
  `;
}

function buildClientText(data) {
  return [
    `Zdravo ${data.name},`,
    "",
    "Hvala što ste završili Wellbeing Compass dijagnostiku.",
    `Vaš score: ${data.score}/100`,
    "Detaljan izvještaj nalazi se u PDF prilogu ovog maila.",
    "Pregledaćemo vašu prijavu i javiti vam se sa sljedećim korakom.",
    "",
    "Wellbeing Compass",
  ].join("\n");
}

async function buildPdfBase64(reportData) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontPath = path.join(__dirname, "NotoSans-Regular.ttf");
  const boldFontPath = path.join(__dirname, "NotoSans-Bold.ttf");

  if (!fs.existsSync(regularFontPath) || !fs.existsSync(boldFontPath)) {
    throw new Error("Missing NotoSans font files in netlify/functions");
  }

  const fontRegularBytes = fs.readFileSync(regularFontPath);
  const fontBoldBytes = fs.readFileSync(boldFontPath);

  const fontRegular = await pdfDoc.embedFont(fontRegularBytes);
  const fontBold = await pdfDoc.embedFont(fontBoldBytes);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const M = 42;

  const C = {
    bg: rgb(11 / 255, 25 / 255, 41 / 255),
    panel: rgb(15 / 255, 32 / 255, 53 / 255),
    panel2: rgb(18 / 255, 32 / 255, 64 / 255),
    border: rgb(35 / 255, 63 / 255, 96 / 255),
    text: rgb(216 / 255, 236 / 255, 248 / 255),
    muted: rgb(138 / 255, 174 / 255, 200 / 255),
    dim: rgb(90 / 255, 122 / 255, 148 / 255),
    blue: rgb(58 / 255, 143 / 255, 212 / 255),
    green: rgb(39 / 255, 174 / 255, 96 / 255),
    red: rgb(224 / 255, 85 / 255, 85 / 255),
    white: rgb(234 / 255, 244 / 255, 255 / 255),
  };

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const drawPageBg = (p) => {
    p.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_W,
      height: PAGE_H,
      color: C.bg,
    });
  };

  drawPageBg(page);

  const addPage = () => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    drawPageBg(page);
    y = PAGE_H - M;
  };

  const ensureSpace = (needed) => {
    if (y - needed < M) addPage();
  };

  const drawText = (text, x, yy, size = 12, color = C.text, font = fontRegular) => {
    page.drawText(String(text || ""), { x, y: yy, size, font, color });
  };

  const wrapText = (text, maxWidth, font, size) => {
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let current = "";

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(test, size);
      if (width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }

    if (current) lines.push(current);
    return lines;
  };

  const drawWrappedText = (
    text,
    x,
    yy,
    maxWidth,
    size = 12,
    lineHeight = 17,
    color = C.text,
    font = fontRegular
  ) => {
    const lines = wrapText(text, maxWidth, font, size);
    let currentY = yy;

    for (const line of lines) {
      page.drawText(line, { x, y: currentY, size, font, color });
      currentY -= lineHeight;
    }

    return currentY;
  };

  const drawPanel = (x, yy, w, h, fill = C.panel, border = C.border) => {
    page.drawRectangle({
      x,
      y: yy - h,
      width: w,
      height: h,
      color: fill,
      borderColor: border,
      borderWidth: 1,
    });
  };

  const drawSectionLabel = (label, yy, color = C.blue) => {
    drawText(label.toUpperCase(), M, yy, 10, color, fontBold);
    return yy - 20;
  };

  const drawBulletList = (items, options = {}) => {
    const {
      x = M + 18,
      startY = y,
      width = PAGE_W - M * 2 - 30,
      size = 12,
      lineHeight = 17,
      bulletColor = C.text,
      textColor = C.text,
      gap = 8,
    } = options;

    let currentY = startY;

    for (const item of items) {
      const lines = wrapText(item, width - 14, fontRegular, size);
      const needed = lines.length * lineHeight + gap;
      ensureSpace(needed + 20);

      page.drawCircle({
        x: x - 8,
        y: currentY + 4,
        size: 2.4,
        color: bulletColor,
      });

      for (const line of lines) {
        drawText(line, x, currentY, size, textColor, fontRegular);
        currentY -= lineHeight;
      }

      currentY -= gap;
    }

    y = currentY;
  };

  ensureSpace(90);
  drawText("WELLBEING COMPASS · GROWTH METHOD™", M, y, 9, C.dim, fontBold);
  y -= 22;
  drawText("Marketing & Prodaja", M, y, 24, C.white, fontBold);
  y -= 30;
  drawText("Dijagnostički izvještaj", M, y, 22, C.blue, fontBold);
  drawText(formatDateME(new Date()), PAGE_W - 110, PAGE_H - M - 22, 11, C.muted, fontRegular);
  y -= 28;

  ensureSpace(120);
  const scoreCardH = 108;
  drawPanel(M, y, PAGE_W - M * 2, scoreCardH, C.panel2, C.border);

  drawText("UKUPNI SCORE", M + 18, y - 20, 10, C.muted, fontBold);

  const score = Number(reportData.score || 0);
  const scoreCol = getScoreColor(score);

  page.drawRectangle({
    x: M + 18,
    y: y - 82,
    width: 132,
    height: 46,
    color: rgb(
      Math.max(scoreCol.rgb.red * 0.28, 0.12),
      Math.max(scoreCol.rgb.green * 0.28, 0.12),
      Math.max(scoreCol.rgb.blue * 0.28, 0.12)
    ),
    borderColor: scoreCol.rgb,
    borderWidth: 0.6,
  });

  drawText(`${score}/100`, M + 30, y - 70, 26, scoreCol.rgb, fontBold);

  drawWrappedText(
    reportData.scoreSummary || "Sažeti pregled rezultata dijagnostike.",
    M + 170,
    y - 22,
    PAGE_W - (M + 170) - M - 16,
    12,
    17,
    C.text,
    fontRegular
  );

  y -= scoreCardH + 20;

  ensureSpace(110);
  y = drawSectionLabel("Osnovni podaci", y);

  const infoH = 104;
  drawPanel(M, y, PAGE_W - M * 2, infoH, C.panel, C.border);

  let infoY = y - 22;
  const infoRows = [
    `Ime: ${reportData.name || "-"}`,
    `Email: ${reportData.email || "-"}`,
    `Kompanija: ${reportData.company || "-"}`,
    `Branša: ${reportData.industry || "-"}`,
    `Izazovi: ${reportData.challenges || "-"}`,
    `Poruka: ${reportData.message || "-"}`,
  ];

  for (const row of infoRows) {
    infoY = drawWrappedText(row, M + 18, infoY, PAGE_W - M * 2 - 36, 12, 17, C.text, fontRegular);
  }

  y -= infoH + 22;

  ensureSpace(135);
  y = drawSectionLabel("Pregled po fazama", y);

  const gap = 10;
  const cardW = (PAGE_W - M * 2 - gap * 3) / 4;
  const cardH = 86;

  (reportData.phaseScores || []).forEach((phase, index) => {
    const x = M + index * (cardW + gap);
    drawPanel(x, y, cardW, cardH, C.panel2, C.border);
    drawText(phase.label, x + 12, y - 20, 10, C.muted, fontBold);
    drawText(`${phase.value}/100`, x + 12, y - 56, 16, getScoreColor(phase.value).rgb, fontBold);
  });

  y -= cardH + 24;

  if (Array.isArray(reportData.criticalGaps) && reportData.criticalGaps.length) {
    ensureSpace(110);
    y = drawSectionLabel("Kritični gapovi", y, C.red);

    const boxTopY = y;
    const estimateHeight = Math.min(270, reportData.criticalGaps.length * 54 + 26);
    drawPanel(M, boxTopY, PAGE_W - M * 2, estimateHeight, C.panel, C.border);
    y = boxTopY - 24;

    drawBulletList(reportData.criticalGaps, {
      x: M + 24,
      startY: y,
      width: PAGE_W - M * 2 - 30,
      size: 12,
      lineHeight: 17,
      bulletColor: C.red,
      textColor: C.text,
      gap: 8,
    });

    y -= 8;
  }

  addPage();

  if (Array.isArray(reportData.strengths) && reportData.strengths.length) {
    ensureSpace(110);
    y = drawSectionLabel("Sistemske snage", y, C.green);

    const boxTopY = y;
    const estimateHeight = Math.min(320, reportData.strengths.length * 54 + 26);
    drawPanel(M, boxTopY, PAGE_W - M * 2, estimateHeight, C.panel, C.border);
    y = boxTopY - 24;

    drawBulletList(reportData.strengths, {
      x: M + 24,
      startY: y,
      width: PAGE_W - M * 2 - 30,
      size: 12,
      lineHeight: 17,
      bulletColor: C.green,
      textColor: C.text,
      gap: 8,
    });

    y -= 10;
  }

  if (Array.isArray(reportData.priorities) && reportData.priorities.length) {
    ensureSpace(120);
    y = drawSectionLabel("Prvi prioriteti", y);

    const pTop = y;
    const pHeight = Math.min(220, reportData.priorities.length * 50 + 26);
    drawPanel(M, pTop, PAGE_W - M * 2, pHeight, C.panel2, C.border);
    y = pTop - 24;

    drawBulletList(reportData.priorities, {
      x: M + 24,
      startY: y,
      width: PAGE_W - M * 2 - 30,
      size: 12,
      lineHeight: 17,
      bulletColor: C.blue,
      textColor: C.text,
      gap: 10,
    });

    y -= 8;
  }

  ensureSpace(120);
  y = drawSectionLabel("Naredni korak", y);

  const nextH = 102;
  drawPanel(M, y, PAGE_W - M * 2, nextH, C.panel2, C.border);

  let nextY = y - 24;
  nextY = drawWrappedText(
    "Na osnovu ove dijagnostike, preporuka je da sljedeći razgovor fokusirate na zatvaranje kritičnih gapova, jačanje sistemskih snaga i definisanje jasne marketinško-prodajne arhitekture.",
    M + 18,
    nextY,
    PAGE_W - M * 2 - 36,
    12,
    18,
    C.text,
    fontRegular
  );

  drawText("Wellbeing Compass", M + 18, nextY - 6, 12, C.blue, fontBold);

  for (const p of pdfDoc.getPages()) {
    p.drawLine({
      start: { x: M, y: 26 },
      end: { x: PAGE_W - M, y: 26 },
      thickness: 1,
      color: C.border,
    });

    p.drawText("Wellbeing Compass · Jelena Milatović · Podgorica", {
      x: M,
      y: 12,
      size: 10,
      font: fontRegular,
      color: C.dim,
    });

    p.drawText("wellbeingcompass.me", {
      x: PAGE_W - 140,
      y: 12,
      size: 10,
      font: fontRegular,
      color: C.dim,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString("base64");
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const payload = body.payload || {};
    const data = payload.data || {};

    const postmarkToken = clean(process.env.POSTMARK_SERVER_TOKEN, "");
    const fromEmail = clean(process.env.POSTMARK_FROM_EMAIL, "");
    const ownerEmail = clean(process.env.WC_OWNER_EMAIL || process.env.OWNER_EMAIL, "");

    if (!postmarkToken) throw new Error("Missing POSTMARK_SERVER_TOKEN");
    if (!fromEmail) throw new Error("Missing POSTMARK_FROM_EMAIL");
    if (!ownerEmail) throw new Error("Missing WC_OWNER_EMAIL");

    const name = clean(data.ime);
    const email = clean(data.email);
    const company = clean(data.kompanija);
    const industry = clean(data.bransa);
    const score = toScoreNumber(data.score);
    const challenges = clean(data.izazovi);
    const message = clean(data.poruka);
    const language = clean(data.jezik, "Crnogorski");

    const phaseScores = parsePhaseScores(data.phase_scores);
    const criticalGaps = parseList(data.critical_gaps);
    const strengths = parseList(data.strengths);
    const priorities = getPrioritiesFromPhaseScores(phaseScores);

    const reportData = {
      score,
      scoreSummary: `Ukupni score: ${score}/100. Faze: INPUT ${phaseScores.input}/100, AKTIVACIJA ${phaseScores.activation}/100, AKCIJA ${phaseScores.action}/100, OUTPUT ${phaseScores.output}/100.`,
      name,
      email,
      company,
      industry,
      challenges,
      message,
      language,
      phaseScores: [
        { label: "INPUT", value: phaseScores.input },
        { label: "AKTIVACIJA", value: phaseScores.activation },
        { label: "AKCIJA", value: phaseScores.action },
        { label: "OUTPUT", value: phaseScores.output },
      ],
      criticalGaps,
      strengths,
      priorities,
    };

    const pdfBase64 = await buildPdfBase64(reportData);

    const fileBase = slugifyFileName(company !== "-" ? company : name);
    const pdfFileName = `${fileBase}-report.pdf`;

    const ownerPayload = {
      name,
      email,
      company,
      industry,
      score,
      challenges,
      message,
      language,
      phaseScores,
      criticalGaps,
      strengths,
    };

    await sendPostmarkEmail({
      serverToken: postmarkToken,
      from: fromEmail,
      to: ownerEmail,
      subject: "Nova Wellbeing Compass Dijagnostika",
      htmlBody: buildOwnerHtml(ownerPayload),
      textBody: buildOwnerText(ownerPayload),
    });

    await sendPostmarkEmail({
      serverToken: postmarkToken,
      from: fromEmail,
      to: email,
      subject: "Vaš Wellbeing Compass dijagnostički izvještaj",
      htmlBody: buildClientHtml({
        name,
        score,
        replyEmail: fromEmail,
      }),
      textBody: buildClientText({ name, score }),
      attachments: [
        {
          Name: pdfFileName,
          Content: pdfBase64,
          ContentType: "application/pdf",
        },
      ],
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    console.error("submission-created error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message,
      }),
    };
  }
};

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

function parseEvent(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

function getSubmission(body) {
  const payload = body.payload || {};
  const data = payload.data || body.data || {};
  const formName =
    payload.form_name ||
    payload.formName ||
    data["form-name"] ||
    data.form_name ||
    "";

  return { payload, data, formName };
}

function safe(value, fallback = "-") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function langOf(data) {
  const lang = safe(data.jezik, "").toLowerCase();
  return lang.includes("eng") ? "en" : "mn";
}

function splitPipes(text) {
  return safe(text, "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitDoublePipes(text) {
  return safe(text, "")
    .split("||")
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeSummaryText(value) {
  return safe(value, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\|\s+/g, " | ")
    .trim();
}

function wrapText(text, font, fontSize, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, fontSize);

    if (width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawWrappedText(page, text, opts) {
  const { x, y, font, size, color, maxWidth, lineHeight } = opts;
  const lines = wrapText(text, font, size, maxWidth);
  let cursorY = y;

  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cursorY,
      size,
      font,
      color,
    });
    cursorY -= lineHeight;
  }

  return cursorY;
}

function drawBullets(page, items, opts) {
  const {
    x,
    y,
    font,
    bulletFont,
    size,
    color,
    maxWidth,
    lineHeight,
    bulletGap = 10,
    itemGap = 4,
  } = opts;

  let cursorY = y;
  const bulletWidth = bulletFont.widthOfTextAtSize("•", size);

  for (const item of items) {
    const itemText = String(item || "").trim();
    if (!itemText) continue;

    const textX = x + bulletWidth + bulletGap;
    const textWidth = maxWidth - bulletWidth - bulletGap;
    const lines = wrapText(itemText, font, size, textWidth);

    page.drawText("•", {
      x,
      y: cursorY,
      size,
      font: bulletFont,
      color,
    });

    let lineY = cursorY;
    for (const line of lines) {
      page.drawText(line, {
        x: textX,
        y: lineY,
        size,
        font,
        color,
      });
      lineY -= lineHeight;
    }

    cursorY = lineY - itemGap;
  }

  return cursorY;
}

function ensureSpace(page, cursorY, neededHeight, createPage) {
  if (cursorY - neededHeight < 60) {
    return createPage();
  }
  return { page, y: cursorY };
}

async function buildPdfBase64(data, lang) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontPath = path.join(__dirname, "NotoSans-Regular.ttf");
  const boldFontPath = path.join(__dirname, "NotoSans-Bold.ttf");

  if (!fs.existsSync(regularFontPath) || !fs.existsSync(boldFontPath)) {
    throw new Error("Missing NotoSans font files in netlify/functions/");
  }

  const regularBytes = fs.readFileSync(regularFontPath);
  const boldBytes = fs.readFileSync(boldFontPath);

  const font = await pdfDoc.embedFont(regularBytes);
  const fontBold = await pdfDoc.embedFont(boldBytes);

  const colors = {
    bg: rgb(0.035, 0.086, 0.152),
    panel: rgb(0.055, 0.118, 0.204),
    border: rgb(0.137, 0.259, 0.431),
    text: rgb(0.90, 0.94, 0.98),
    muted: rgb(0.67, 0.76, 0.86),
    blue: rgb(0.28, 0.57, 0.96),
    blueSoft: rgb(0.12, 0.22, 0.37),
    red: rgb(0.89, 0.36, 0.38),
    green: rgb(0.24, 0.77, 0.43),
    white: rgb(1, 1, 1),
  };

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const left = 42;
  const right = pageWidth - 42;
  const contentWidth = right - left;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 42;

  const createNewPage = () => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: colors.bg,
    });
    return { page, y: pageHeight - 42 };
  };

  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: colors.bg,
  });

  const score = safe(data.score);
  const phaseScores = splitPipes(data.phase_scores);
  const criticalGaps = splitDoublePipes(data.critical_gaps);
  const strengths = splitDoublePipes(data.strengths);
  const summaryText = normalizeSummaryText(data.summary_text);

  const title1 = lang === "en" ? "Marketing & Sales" : "Marketing & Prodaja";
  const title2 = lang === "en" ? "Diagnostic Report" : "Dijagnostički izvještaj";
  const keyDetailsTitle = lang === "en" ? "Key details" : "Osnovni podaci";
  const phaseTitle = lang === "en" ? "Phase breakdown" : "Pregled po fazama";
  const gapsTitle = lang === "en" ? "Critical gaps" : "Kritični gapovi";
  const strengthsTitle = lang === "en" ? "System strengths" : "Sistemske snage";
  const noGapsText = lang === "en" ? "No critical gaps detected." : "Nema detektovanih kritičnih gapova.";
  const noStrengthText = lang === "en" ? "No standout strengths recorded yet." : "Još nema izdvojenih sistemskih snaga.";

  const dateText = new Date().toLocaleDateString(
    lang === "en" ? "en-GB" : "sr-Latn-ME",
    { day: "numeric", month: "numeric", year: "numeric" }
  );

  page.drawText("WELLBEING COMPASS · GROWTH METHOD™", {
    x: left,
    y,
    size: 8,
    font: fontBold,
    color: colors.muted,
  });
  y -= 18;

  page.drawText(title1, {
    x: left,
    y,
    size: 22,
    font: fontBold,
    color: colors.white,
  });
  y -= 24;

  page.drawText(title2, {
    x: left,
    y,
    size: 22,
    font: fontBold,
    color: colors.blue,
  });

  page.drawText(dateText, {
    x: right - 58,
    y: y + 2,
    size: 10,
    font,
    color: colors.muted,
  });

  y -= 26;

  page.drawRectangle({
    x: left,
    y: y - 110,
    width: contentWidth,
    height: 110,
    color: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  });

  page.drawRectangle({
    x: left + 16,
    y: y - 86,
    width: 138,
    height: 62,
    color: colors.blueSoft,
    borderColor: colors.border,
    borderWidth: 1,
  });

  page.drawText(lang === "en" ? "OVERALL SCORE" : "UKUPNI SCORE", {
    x: left + 24,
    y: y - 18,
    size: 9,
    font: fontBold,
    color: colors.muted,
  });

  page.drawText(score, {
    x: left + 24,
    y: y - 64,
    size: 28,
    font: fontBold,
    color: colors.blue,
  });

  const summaryX = left + 170;
  let summaryY = y - 18;
  drawWrappedText(page, summaryText || "-", {
    x: summaryX,
    y: summaryY,
    font,
    size: 10,
    color: colors.muted,
    maxWidth: contentWidth - 188,
    lineHeight: 13,
  });

  y -= 132;

  page.drawText(keyDetailsTitle.toUpperCase(), {
    x: left,
    y,
    size: 10,
    font: fontBold,
    color: colors.blue,
  });
  y -= 18;

  const detailLines = [
    `Ime: ${safe(data.ime)}`,
    `Email: ${safe(data.email)}`,
    `Kompanija: ${safe(data.kompanija)}`,
    `Branša: ${safe(data.bransa)}`,
    `Izazovi: ${safe(data.izazovi)}`,
    `Poruka: ${safe(data.poruka)}`,
  ];

  page.drawRectangle({
    x: left,
    y: y - 108,
    width: contentWidth,
    height: 108,
    color: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  });

  let detailsY = y - 18;
  for (const line of detailLines) {
    page.drawText(line, {
      x: left + 16,
      y: detailsY,
      size: 10,
      font,
      color: colors.text,
    });
    detailsY -= 17;
  }

  y -= 128;

  page.drawText(phaseTitle.toUpperCase(), {
    x: left,
    y,
    size: 10,
    font: fontBold,
    color: colors.blue,
  });
  y -= 18;

  page.drawRectangle({
    x: left,
    y: y - 78,
    width: contentWidth,
    height: 78,
    color: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  });

  const phaseColumns = [
    { label: "INPUT", value: phaseScores[0] || "-" },
    { label: "AKTIVACIJA", value: phaseScores[1] || "-" },
    { label: "AKCIJA", value: phaseScores[2] || "-" },
    { label: "OUTPUT", value: phaseScores[3] || "-" },
  ];

  const colWidth = (contentWidth - 32) / 4;
  let colX = left + 16;

  for (const col of phaseColumns) {
    page.drawText(col.label, {
      x: colX,
      y: y - 20,
      size: 9,
      font: fontBold,
      color: colors.muted,
    });

    page.drawText(String(col.value), {
      x: colX,
      y: y - 48,
      size: 16,
      font: fontBold,
      color: colors.white,
    });

    colX += colWidth;
  }

  y -= 98;

  page.drawText(gapsTitle.toUpperCase(), {
    x: left,
    y,
    size: 10,
    font: fontBold,
    color: colors.red,
  });
  y -= 18;

  let estimatedGapHeight = criticalGaps.length
    ? Math.min(criticalGaps.length, 6) * 36 + 24
    : 42;

  ({ page, y } = ensureSpace(page, y, estimatedGapHeight + 30, createNewPage));

  page.drawRectangle({
    x: left,
    y: y - estimatedGapHeight,
    width: contentWidth,
    height: estimatedGapHeight,
    color: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  });

  let gapsY = y - 18;
  if (criticalGaps.length) {
    drawBullets(page, criticalGaps.slice(0, 6), {
      x: left + 16,
      y: gapsY,
      font,
      bulletFont: fontBold,
      size: 10,
      color: colors.text,
      maxWidth: contentWidth - 32,
      lineHeight: 15,
    });
  } else {
    page.drawText(noGapsText, {
      x: left + 16,
      y: gapsY,
      size: 10,
      font,
      color: colors.muted,
    });
  }

  y -= estimatedGapHeight + 20;

  ({ page, y } = ensureSpace(page, y, 150, createNewPage));

  page.drawText(strengthsTitle.toUpperCase(), {
    x: left,
    y,
    size: 10,
    font: fontBold,
    color: colors.green,
  });
  y -= 18;

  let estimatedStrengthHeight = strengths.length
    ? Math.min(strengths.length, 6) * 34 + 24
    : 42;

  page.drawRectangle({
    x: left,
    y: y - estimatedStrengthHeight,
    width: contentWidth,
    height: estimatedStrengthHeight,
    color: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
  });

  let strengthsY = y - 18;
  if (strengths.length) {
    drawBullets(page, strengths.slice(0, 6), {
      x: left + 16,
      y: strengthsY,
      font,
      bulletFont: fontBold,
      size: 10,
      color: colors.text,
      maxWidth: contentWidth - 32,
      lineHeight: 15,
    });
  } else {
    page.drawText(noStrengthText, {
      x: left + 16,
      y: strengthsY,
      size: 10,
      font,
      color: colors.muted,
    });
  }

  const footerY = 26;
  page.drawLine({
    start: { x: left, y: footerY + 10 },
    end: { x: right, y: footerY + 10 },
    thickness: 1,
    color: colors.border,
  });

  page.drawText("Wellbeing Compass · Jelena Milatović · Podgorica", {
    x: left,
    y: footerY,
    size: 9,
    font,
    color: colors.muted,
  });

  page.drawText("wellbeingcompass.me", {
    x: right - 110,
    y: footerY,
    size: 9,
    font,
    color: colors.muted,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString("base64");
}

async function sendPostmarkEmail({
  token,
  from,
  to,
  subject,
  htmlBody,
  textBody,
  attachments = [],
}) {
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      Attachments: attachments,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Postmark error ${response.status}: ${text}`);
  }

  return text;
}

exports.handler = async function(event) {
  try {
    const body = parseEvent(event);
    const { data, formName } = getSubmission(body);

    if (formName && formName !== "dijagnostika-kontakt") {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, ignored: true }),
      };
    }

    const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
    const OWNER_EMAIL = process.env.DIAGNOSTIC_OWNER_EMAIL;
    const FROM_EMAIL = process.env.DIAGNOSTIC_FROM_EMAIL;

    if (!POSTMARK_SERVER_TOKEN) throw new Error("Missing POSTMARK_SERVER_TOKEN");
    if (!OWNER_EMAIL) throw new Error("Missing DIAGNOSTIC_OWNER_EMAIL");
    if (!FROM_EMAIL) throw new Error("Missing DIAGNOSTIC_FROM_EMAIL");

    const clientEmail = safe(data.email, "");
    if (!clientEmail || clientEmail === "-") {
      throw new Error("Missing client email in submission");
    }

    const lang = langOf(data);
    const score = safe(data.score);
    const companyOrName =
      safe(data.kompanija, "") !== "-" ? safe(data.kompanija) : safe(data.ime);

    const pdfBase64 = await buildPdfBase64(data, lang);
    const filename = `${companyOrName.replace(/[^a-z0-9-_]+/gi, "_") || "diagnostic"}-report.pdf`;

    const ownerSubject = `Nova Wellbeing Compass dijagnostika — ${companyOrName}`;
    const clientSubject =
      lang === "en"
        ? "Your Wellbeing Compass diagnostic report"
        : "Vaš Wellbeing Compass dijagnostički izvještaj";

    const ownerHtml = `
      <div style="font-family:Georgia,serif;background:#0B1929;color:#C8DCF0;padding:24px">
        <h1 style="color:#E8F2FF;margin-top:0">Nova dijagnostika je stigla</h1>
        <p><strong>Ime:</strong> ${escapeHtml(safe(data.ime))}</p>
        <p><strong>Email:</strong> ${escapeHtml(safe(data.email))}</p>
        <p><strong>Kompanija:</strong> ${escapeHtml(safe(data.kompanija))}</p>
        <p><strong>Branša:</strong> ${escapeHtml(safe(data.bransa))}</p>
        <p><strong>Score:</strong> ${escapeHtml(score)}</p>
        <p><strong>Izazovi:</strong> ${escapeHtml(safe(data.izazovi))}</p>
        <p><strong>Poruka:</strong> ${escapeHtml(safe(data.poruka))}</p>
        <p><strong>Phase scores:</strong><br>${escapeHtml(safe(data.phase_scores)).replaceAll("|", "<br>")}</p>
        <p><strong>Critical gaps:</strong><br>${escapeHtml(safe(data.critical_gaps)).replaceAll("||", "<br>")}</p>
        <p><strong>Strengths:</strong><br>${escapeHtml(safe(data.strengths)).replaceAll("||", "<br>")}</p>
        <p><strong>Summary:</strong><br>${escapeHtml(safe(data.summary_text)).replaceAll("\n", "<br>")}</p>
      </div>
    `;

    const clientHtml =
      lang === "en"
        ? `
      <div style="font-family:Georgia,serif;background:#0B1929;color:#C8DCF0;padding:24px">
        <h1 style="color:#E8F2FF;margin-top:0">Thank you for completing the diagnostic.</h1>
        <p>Your score: <strong>${escapeHtml(score)}</strong></p>
        <p>Your report is attached as a PDF.</p>
        <p>We’ll review your submission and reach out with the next step.</p>
        <p style="margin-top:24px">Wellbeing Compass</p>
      </div>
    `
        : `
      <div style="font-family:Georgia,serif;background:#0B1929;color:#C8DCF0;padding:24px">
        <h1 style="color:#E8F2FF;margin-top:0">Hvala što ste završili dijagnostiku.</h1>
        <p>Vaš score: <strong>${escapeHtml(score)}</strong></p>
        <p>Vaš izvještaj je u prilogu kao PDF.</p>
        <p>Pregledaćemo prijavu i javiti vam se sa sljedećim korakom.</p>
        <p style="margin-top:24px">Wellbeing Compass</p>
      </div>
    `;

    const attachment = [
      {
        Name: filename,
        Content: pdfBase64,
        ContentType: "application/pdf",
      },
    ];

    await sendPostmarkEmail({
      token: POSTMARK_SERVER_TOKEN,
      from: FROM_EMAIL,
      to: OWNER_EMAIL,
      subject: ownerSubject,
      htmlBody: ownerHtml,
      textBody: `Nova dijagnostika je stigla.\nIme: ${safe(data.ime)}\nEmail: ${safe(data.email)}\nScore: ${score}`,
      attachments: attachment,
    });

    await sendPostmarkEmail({
      token: POSTMARK_SERVER_TOKEN,
      from: FROM_EMAIL,
      to: clientEmail,
      subject: clientSubject,
      htmlBody: clientHtml,
      textBody:
        lang === "en"
          ? `Thank you for completing the diagnostic. Your score is ${score}. Your PDF report is attached.`
          : `Hvala što ste završili dijagnostiku. Vaš score je ${score}. PDF izvještaj je u prilogu.`,
      attachments: attachment,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        sent: true,
      }),
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

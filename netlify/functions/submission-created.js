const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

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

function cleanPdfText(value) {
  return safe(value, "").replace(/[čćžšđČĆŽŠĐ]/g, "");
}

function escapeHtml(str) {
  return String(str)
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

async function buildPdfBase64(data, lang) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const colors = {
    bg: rgb(0.043, 0.098, 0.161),
    panel: rgb(0.059, 0.125, 0.208),
    border: rgb(0.122, 0.227, 0.353),
    text: rgb(0.784, 0.863, 0.941),
    muted: rgb(0.478, 0.607, 0.690),
    blue: rgb(0.227, 0.561, 0.831),
    green: rgb(0.153, 0.682, 0.376),
    red: rgb(0.878, 0.333, 0.333),
  };

  page.drawRectangle({ x: 0, y: 0, width, height, color: colors.bg });

  let y = height - 42;
  const left = 42;
  const right = width - 42;
  const contentWidth = right - left;

  function drawText(text, x, yPos, size = 11, color = colors.text, bold = false) {
    page.drawText(String(text), {
      x,
      y: yPos,
      size,
      color,
      font: bold ? fontBold : font,
    });
  }

  function wrapText(text, maxChars = 78) {
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function paragraph(text, options = {}) {
    const {
      size = 10,
      color = colors.text,
      bold = false,
      maxChars = 78,
      lineGap = 4,
      indent = 0,
    } = options;

    const lines = wrapText(text, maxChars);
    for (const line of lines) {
      drawText(line, left + indent, y, size, color, bold);
      y -= size + lineGap;
    }
  }

  function sectionTitle(title, color = colors.blue) {
    drawText(title.toUpperCase(), left, y, 9, color, true);
    y -= 16;
  }

  function panel(heightPx) {
    page.drawRectangle({
      x: left,
      y: y - heightPx + 10,
      width: contentWidth,
      height: heightPx,
      color: colors.panel,
      borderColor: colors.border,
      borderWidth: 1,
    });
  }

  const title1 = lang === "en" ? "Marketing & Sales" : "Marketing & Prodaja";
  const title2 = lang === "en" ? "Diagnostic Report" : "Dijagnosticki izvjestaj";
  const dateText = new Date().toLocaleDateString(lang === "en" ? "en-GB" : "sr-Latn-ME");

  drawText("WELLBEING COMPASS · GROWTH METHOD™", left, y, 8, colors.muted, true);
  y -= 18;
  drawText(title1, left, y, 22, colors.text, true);
  y -= 24;
  drawText(title2, left, y, 22, colors.blue, true);
  drawText(dateText, right - 70, height - 42, 10, colors.muted, false);
  y -= 30;

  panel(92);
  drawText(lang === "en" ? "OVERALL SCORE" : "UKUPNI SCORE", left + 18, y - 8, 9, colors.muted, true);
  drawText(safe(data.score), left + 18, y - 46, 30, colors.blue, true);

  const summary = cleanPdfText(data.summary_text);
  const summaryLines = wrapText(summary, 44);
  let sy = y - 10;
  for (const line of summaryLines.slice(0, 5)) {
    drawText(line, left + 160, sy, 10, colors.muted, false);
    sy -= 14;
  }
  y -= 108;

  sectionTitle(lang === "en" ? "Key details" : "Osnovni podaci");
  paragraph(`${lang === "en" ? "Name" : "Ime"}: ${cleanPdfText(data.ime)}`);
  paragraph(`Email: ${cleanPdfText(data.email)}`);
  paragraph(`${lang === "en" ? "Company" : "Kompanija"}: ${cleanPdfText(data.kompanija)}`);
  paragraph(`${lang === "en" ? "Industry" : "Bransa"}: ${cleanPdfText(data.bransa)}`);
  paragraph(`${lang === "en" ? "Challenges" : "Izazovi"}: ${cleanPdfText(data.izazovi)}`);
  paragraph(`${lang === "en" ? "Message" : "Poruka"}: ${cleanPdfText(data.poruka)}`);
  y -= 8;

  sectionTitle(lang === "en" ? "Phase breakdown" : "Pregled po fazama");
  for (const item of splitPipes(data.phase_scores)) {
    paragraph(`• ${cleanPdfText(item)}`, { indent: 8 });
  }
  y -= 8;

  sectionTitle(lang === "en" ? "Critical gaps" : "Kriticni gapovi", colors.red);
  const gaps = splitDoublePipes(data.critical_gaps);
  if (gaps.length) {
    for (const item of gaps.slice(0, 5)) {
      paragraph(`• ${cleanPdfText(item)}`, { indent: 8, maxChars: 72 });
    }
  } else {
    paragraph(lang === "en" ? "No critical gaps detected." : "Nema detektovanih kriticnih gapova.", {
      indent: 8,
      color: colors.muted,
    });
  }
  y -= 8;

  sectionTitle(lang === "en" ? "System strengths" : "Sistemske snage", colors.green);
  const strengths = splitDoublePipes(data.strengths);
  if (strengths.length) {
    for (const item of strengths.slice(0, 5)) {
      paragraph(`• ${cleanPdfText(item)}`, { indent: 8, maxChars: 72 });
    }
  } else {
    paragraph(lang === "en" ? "No standout strengths recorded yet." : "Jos nema izdvojenih sistemskih snaga.", {
      indent: 8,
      color: colors.muted,
    });
  }

  page.drawLine({
    start: { x: left, y: 28 },
    end: { x: right, y: 28 },
    thickness: 1,
    color: colors.border,
  });

  drawText("Wellbeing Compass · Jelena Milatovic · Podgorica", left, 16, 9, colors.muted);
  drawText("wellbeingcompass.me", right - 100, 16, 9, colors.muted);

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
      MessageStream: "outbound",
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
        : "Vas Wellbeing Compass dijagnosticki izvjestaj";

    const ownerHtml = `
      <div style="font-family:Georgia,serif;background:#0B1929;color:#C8DCF0;padding:24px">
        <h1 style="color:#E8F2FF;margin-top:0">Nova dijagnostika je stigla</h1>
        <p><strong>Ime:</strong> ${escapeHtml(safe(data.ime))}</p>
        <p><strong>Email:</strong> ${escapeHtml(safe(data.email))}</p>
        <p><strong>Kompanija:</strong> ${escapeHtml(safe(data.kompanija))}</p>
        <p><strong>Bransa:</strong> ${escapeHtml(safe(data.bransa))}</p>
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
        <h1 style="color:#E8F2FF;margin-top:0">Hvala sto ste zavrsili dijagnostiku.</h1>
        <p>Vas score: <strong>${escapeHtml(score)}</strong></p>
        <p>Vas izvjestaj je u prilogu kao PDF.</p>
        <p>Pregledacemo prijavu i javiti vam se sa sljedecim korakom.</p>
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
          : `Hvala sto ste zavrsili dijagnostiku. Vas score je ${score}. PDF izvjestaj je u prilogu.`,
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

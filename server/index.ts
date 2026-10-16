console.log(
  "n8n URL loaded:",
  Boolean(process.env.N8N_WEBHOOK_URL)
);
import "dotenv/config";

import express from "express";
import cors from "cors";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
app.use(cors({ origin: process.env.NODE_ENV === "production" ? false : true }));
app.use(express.json({ limit: "200kb" }));

const port = Number(process.env.PORT || 8787);

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      )
    : null;

// Validate incoming assessment data.
const AnswerSchema = z.object({
  role: z.string().max(40),
  stage: z.string().max(80),
  state: z.string().max(100),
  city: z.string().max(100),
  interests: z.array(z.string().max(80)).max(10),
  budget: z.string().max(80),
  preferences: z.array(z.string().max(100)).max(10),
});

const ReportRequestSchema = z.object({
  answers: AnswerSchema,
  language: z.enum(["en", "hi", "kn", "ta", "te", "ml"]),
});

const LeadSchema = z.object({
  name: z.string().max(100).optional().default(""),
  contact: z.string().min(3).max(200),
  consent: z.literal(true),
  source: z.string().max(200).optional().default("direct"),
  language: z.enum(["en", "hi", "kn", "ta", "te", "ml"]),
  answers: AnswerSchema,
  reportSummary: z.string().max(5000).optional().default(""),
});

type GrowthEvent =
  | "assessment_started"
  | "report_completed"
  | "qualified_lead";

// Keep a small in-memory event list for local debugging.
// This list resets whenever the server restarts.
const events: Array<{
  event: string;
  source: string;
  createdAt: string;
  mode?: string;
}> = [];

// Store an event in Supabase when configured.
// A logging failure must not prevent a report from being returned.
async function saveEvent(
  event: GrowthEvent,
  source = "direct",
  mode?: string
): Promise<boolean> {
  const createdAt = new Date().toISOString();

  events.push({ event, source, mode, createdAt });

  if (!supabase) {
    return false;
  }

  try {
    const { error } = await supabase.from("growth_events").insert({
      event_name: event,
      source,
      mode: mode ?? null,
      created_at: createdAt,
    });

    if (error) {
      console.error("Supabase event persistence failed:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Supabase event logging error:", error);
    return false;
  }
}

// Generate a safe fallback report if Gemini is unavailable.
function fallbackReport(a: any, lang: string) {
  const location =
    [a.city, a.state].filter(Boolean).join(", ") ||
    "your preferred location";

  const translations: Record<string, { title: string; summary: string }> = {
    en: {
      title: "Your campus-fit guide",
      summary: `You are exploring engineering pathways as a ${a.role} at the stage "${a.stage}". Your preferred location is ${location}. Your interests include ${(a.interests || []).join(", ") || "exploring options"}, with an approximate budget of ${a.budget}. Priorities: ${(a.preferences || []).join(", ") || "not specified"}. Use this as a decision aid, not an admissions recommendation.`,
    },
    hi: {
      title: "आपकी कॉलेज-चयन मार्गदर्शिका",
      summary: `आप ${a.role === "parent" ? "अभिभावक" : "विद्यार्थी"} के रूप में "${a.stage}" चरण में इंजीनियरिंग विकल्प खोज रहे हैं। पसंदीदा स्थान ${location} है। रुचियाँ: ${(a.interests || []).join(", ") || "विकल्पों की खोज"}। अनुमानित बजट ${a.budget}। इसे निर्णय-सहायता के रूप में उपयोग करें, प्रवेश की गारंटी नहीं।`,
    },
    kn: {
      title: "ನಿಮ್ಮ ಕಾಲೇಜು ಆಯ್ಕೆ ಮಾರ್ಗದರ್ಶಿ",
      summary: `ನೀವು "${a.stage}" ಹಂತದಲ್ಲಿ ಎಂಜಿನಿಯರಿಂಗ್ ಆಯ್ಕೆಗಳನ್ನು ಅನ್ವೇಷಿಸುತ್ತಿದ್ದೀರಿ. ಆದ್ಯತೆಯ ಸ್ಥಳ ${location}. ಆಸಕ್ತಿಗಳು: ${(a.interests || []).join(", ")}. ಅಂದಾಜು ಬಜೆಟ್ ${a.budget}. ಇದು ನಿರ್ಧಾರಕ್ಕೆ ಸಹಾಯಕ ಮಾತ್ರ; ಪ್ರವೇಶ ಖಾತರಿ ಅಲ್ಲ.`,
    },
    ta: {
      title: "உங்கள் கல்லூரித் தேர்வு வழிகாட்டி",
      summary: `"${a.stage}" நிலையில் பொறியியல் பாதைகளை ஆராய்கிறீர்கள். விருப்ப இடம் ${location}. ஆர்வங்கள்: ${(a.interests || []).join(", ")}. தோராய பட்ஜெட் ${a.budget}. இது முடிவெடுக்க உதவும் வழிகாட்டி மட்டுமே; சேர்க்கை உத்தரவாதம் அல்ல.`,
    },
    te: {
      title: "మీ కాలేజీ ఎంపిక మార్గదర్శి",
      summary: `"${a.stage}" దశలో ఇంజినీరింగ్ మార్గాలను పరిశీలిస్తున్నారు. మీ ప్రాధాన్య స్థలం ${location}. ఆసక్తులు: ${(a.interests || []).join(", ")}. అంచనా బడ్జెట్ ${a.budget}. ఇది నిర్ణయ సహాయం మాత్రమే; ప్రవేశ హామీ కాదు.`,
    },
    ml: {
      title: "നിങ്ങളുടെ കോളേജ് തിരഞ്ഞെടുപ്പ് ഗൈഡ്",
      summary: `"${a.stage}" ഘട്ടത്തിൽ എഞ്ചിനീയറിംഗ് വഴികൾ പരിശോധിക്കുന്നു. ഇഷ്ടമുള്ള സ്ഥലം ${location}. താൽപ്പര്യങ്ങൾ: ${(a.interests || []).join(", ")}. ഏകദേശ ബജറ്റ് ${a.budget}. ഇത് തീരുമാനസഹായം മാത്രമാണ്; പ്രവേശന ഉറപ്പല്ല.`,
    },
  };

  const common = {
    checklist: [
      "Ask for the complete 4-year cost, including tuition, hostel, deposits and compulsory fees.",
      "Confirm the exact degree-awarding university and degree title.",
      "Request the current curriculum and practical-learning examples.",
      "Verify campus address, approvals and accreditation directly with official sources.",
      "Ask for internship data with cohort size, dates, roles and employer evidence.",
      "For placement claims, request the denominator, median compensation and independently verifiable evidence.",
    ],
    questions: [
      "Which university awards the degree, and what exact degree title appears on it?",
      "Can I see the complete fee schedule and refund policy?",
      "What evidence supports internship and placement claims for the latest graduating cohort?",
      "Which approvals and accreditation apply to this exact campus and program?",
    ],
    nextSteps: [
      "Shortlist 3–5 options that fit your budget and location.",
      "Verify material claims on official university/regulator sources.",
      "Speak to current students and ask each admissions team the same questions.",
      "Compare total cost, curriculum, evidence and personal fit before paying any fee.",
    ],
  };

  return { ...translations[lang], ...common };
}

// Health check.
app.get("/api/health", (_req, res) => {
  res.json({
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    databaseConfigured: Boolean(supabase),
    automationConfigured: Boolean(process.env.N8N_WEBHOOK_URL),
    serverReachable: true,
    note: "Configuration flags indicate secrets exist; test each integration to verify service health.",
  });
});

// Record assessment lifecycle events sent by the frontend.
app.post("/api/event", async (req, res) => {
  const schema = z.object({
    event: z.enum(["assessment_started", "report_completed"]),
    source: z.string().max(200).optional().default("direct"),
    mode: z.string().max(30).optional(),
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid event" });
  }

  const persisted = await saveEvent(
    parsed.data.event,
    parsed.data.source,
    parsed.data.mode
  );

  res.json({ ok: true, persisted });
});

// Generate an AI report or use the fallback report.
app.post("/api/report", async (req, res) => {
  const parsed = ReportRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid assessment data" });
  }

  const { answers, language } = parsed.data;

  if (process.env.GEMINI_API_KEY) {
    console.log("Attempting Gemini API request...");

    try {
      const prompt = `You are a careful educational decision-support assistant. Generate a personalized report in language code ${language} using the student inputs below. Never invent school-specific facts, fees, accreditation, placements, eligibility, rankings, or admission guarantees. Do not assert any NIAT facts that are not provided. Clearly distinguish general advice from facts. Output valid JSON with keys title, summary, checklist (6 strings), questions (4 strings), nextSteps (4 strings). Explain the user should verify details with official sources. Inputs: ${JSON.stringify(answers)}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini API error:", response.status, errorBody);
        throw new Error(`Gemini status ${response.status}: ${errorBody}`);
      }

      const data: any = await response.json();
      const raw = data.candidates?.[0]?.content?.parts
        ?.map((part: any) => part.text || "")
        .join("");

      if (!raw) {
        throw new Error("Gemini returned no report");
      }

      const generated = JSON.parse(raw);
      const report = { ...fallbackReport(answers, language), ...generated };

      // Do not let database logging failure break the report response.
      await saveEvent("report_completed", "direct", "live-ai");

      return res.json({ mode: "live-ai", report });
    } catch (error) {
      console.error("Gemini report failed; falling back to demo:", error);
    }
  }

  const report = fallbackReport(answers, language);

  await saveEvent("report_completed", "direct", "demo");

  return res.json({ mode: "demo", report });
});

// Save a lead only when explicit consent is provided.
app.post("/api/lead", async (req, res) => {
  const parsed = LeadSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Please provide valid contact details and explicit consent.",
    });
  }

  // Do not tell the user their lead was saved if the database is unavailable.
  if (!supabase) {
    return res.status(503).json({
      error: "Lead storage is not configured. Please try again later.",
    });
  }

  const d = parsed.data;
  const consentAt = new Date().toISOString();

  const { error } = await supabase.from("consented_leads").insert({
    name: d.name,
    contact: d.contact,
    source: d.source,
    language: d.language,
    answers: d.answers,
    report_summary: d.reportSummary,
    consent: true,
    consent_at: consentAt,
    status: "new",
  });

  
if (error) {
  console.error("Lead persistence failed:", {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });

  return res.status(502).json({
    error: "Database save failed. Your request was not confirmed.",
  });
}


  let automation = "not_configured";

  // Trigger the automation only after the consented lead has been saved.
  if (process.env.N8N_WEBHOOK_URL) {
    try {
      const response = await fetch(process.env.N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "consented_student_lead",
          consent: true,
          consent_timestamp: consentAt,
          source: d.source,
          language: d.language,
          contact: { name: d.name, contact: d.contact },
          answers: d.answers,
          report_summary: d.reportSummary,
        }),
      });

      automation = response.ok ? "sent" : "failed";
    } catch (error) {
      console.error("n8n webhook delivery failed:", error);
      automation = "failed";
    }
  } else {
    automation = "demo_not_sent";
  }

  // The lead has already been saved, so an event logging failure should not
  // turn a successful lead submission into an apparent failure.
  await saveEvent("qualified_lead", d.source, automation);

  return res.json({
    ok: true,
    persisted: true,
    automation,
    message:
      automation === "sent"
        ? "Request saved; n8n accepted the workflow event."
        : automation === "failed"
          ? "Request saved, but the automation delivery failed. Please try again later."
          : "Request saved. Configure N8N_WEBHOOK_URL to trigger the real workflow.",
  });
});

// Production frontend hosting.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.resolve(__dirname, "../dist")));
  app.use((_req, res) =>
    res.sendFile(path.resolve(__dirname, "../dist/index.html"))
  );
}

app.listen(port, () => {
  console.log(`Campus Fit Finder API listening on :${port}`);
});

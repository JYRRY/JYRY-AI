import { z } from "zod";

// ─────────── Profile (shared context) ───────────
export const ProfileSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  birthdate: z.string().nullable(),
  german_level: z.enum(["A1","A2","B1","B2","C1","C2"]).nullable(),
  target_field: z.string().nullable(),
  bio: z.string().nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;

// ─────────── Advisor ───────────
export const AdvisorInputSchema = z.object({
  user_id: z.string().uuid(),
});
export const AdvisorOutputSchema = z.object({
  recommendations: z.array(z.object({
    field: z.string(),
    reason: z.string(),
    match_score: z.number().min(0).max(1),
    minimum_requirements: z.object({
      school: z.string(),
      german_level: z.string(),
    }),
    avg_salary_first_year_eur: z.string(),
  })).min(1).max(5),
  summary_for_user: z.string(),
});

// ─────────── CV Generator ───────────
export const CvInputSchema = z.object({
  user_id: z.string().uuid(),
  target_field_override: z.string().optional(),
});
export const CvOutputSchema = z.object({
  cv_markdown: z.string(),
  sections_present: z.array(z.string()),
});

// ─────────── Letter Writer ───────────
export const LetterInputSchema = z.object({
  user_id: z.string().uuid(),
  company_id: z.string().uuid(),
  ausbildung_type: z.string(),
  earliest_start: z.string().optional(),
});
export const LetterOutputSchema = z.object({
  letter_markdown: z.string(),
  subject: z.string(),
  tone_used: z.enum(["A2","B1","B2"]),
});

// ─────────── Send Application ───────────
export const SendApplicationInputSchema = z.object({
  application_id: z.string().uuid(),
  idempotency_key: z.string().uuid(),
});

// ─────────── Email Triage ───────────
export const EmailTriageInputSchema = z.object({
  email_message_id: z.string().uuid(),
});
export const EmailTriageOutputSchema = z.object({
  category: z.enum(["invitation","rejection","info_request","acknowledgment","offer","other"]),
  summary: z.string(),
  extracted_dates: z.array(z.string()).default([]),
  suggested_reply: z.string().nullable(),
  priority: z.enum(["high","normal","low"]),
});

// ─────────── German Teacher ───────────
export const TeacherInputSchema = z.object({
  user_id: z.string().uuid(),
  mode: z.enum(["interview_prep","text_correction","free_chat"]),
  message: z.string(),
  ui_language: z.enum(["de","ar","en"]).default("de"),
  history: z.array(z.object({
    role: z.enum(["user","assistant"]),
    content: z.string(),
  })).default([]),
});

// ─────────── Process Upload ───────────
export const ProcessUploadInputSchema = z.object({
  document_id: z.string().uuid(),
});

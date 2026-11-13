// Tipe data aplikasi. Nama kolom mengikuti skema database (supabase/migrations/0001_schema.sql).
export type RoleKey = 'superadmin' | 'admin'

export interface Profile { id: string; role_id: string; full_name: string; email: string | null; is_active: boolean; created_at: string }
export interface Role { id: string; key: RoleKey; name: string }
export interface AdminAssignment {
  id: string; admin_id: string; event_id: string
  can_manage_participants: boolean; can_manage_questions: boolean; can_control_competition: boolean; can_view_reports: boolean
}
export interface District { id: string; name: string; code: string | null; sort_order: number; is_active: boolean }
export interface EducationLevel { id: string; code: string; name: string; sort_order: number; is_active: boolean }
export interface EventRow {
  id: string; name: string; description: string | null; location: string | null; organizer: string | null
  logo_url: string | null; start_date: string | null; end_date: string | null
  status: 'draft' | 'published' | 'ongoing' | 'completed' | 'archived'; is_public: boolean
  participants_per_district: number; created_at: string
}
export type RoundingMode = 'round' | 'floor' | 'ceil'
export interface EventSettings {
  id: string; event_id: string; base_points: number; speed_bonus: number; wrong_penalty: number
  duration_seconds: number; lead_seconds: number; rounding_mode: RoundingMode; rounding_decimals: number; leaderboard_size: number
}
export interface Participant {
  id: string; participant_number: string; code: string; full_name: string; school: string
  education_level_id: string; district_id: string; photo_url: string | null; is_active: boolean
}
export interface EventParticipant {
  id: string; event_id: string; participant_id: string
  registration_status: 'pending' | 'verified' | 'rejected'
  participation_status: 'registered' | 'active' | 'withdrawn' | 'disqualified'
}
export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer'
export type Difficulty = 'easy' | 'medium' | 'hard'
export interface Question {
  id: string; event_id: string; category_id: string | null; education_level_id: string | null
  type: QuestionType; difficulty: Difficulty; question_text: string; image_url: string | null; explanation: string | null
  case_sensitive: boolean; ignore_whitespace: boolean; is_active: boolean; created_at: string
}
export interface QuestionOption { id: string; question_id: string; option_text: string; is_correct: boolean; sort_order: number }
export interface QuestionCategory { id: string; name: string }
export interface QuestionPackage {
  id: string; event_id: string; education_level_id: string | null; name: string; description: string | null
  shuffle_questions: boolean; shuffle_options: boolean
}
export interface PackageQuestion { id: string; package_id: string; question_id: string; sort_order: number }

export type SessionStatus = 'draft' | 'open' | 'running' | 'paused' | 'finished' | 'cancelled'
export type DisplayScreen = 'waiting' | 'question' | 'processing' | 'result' | 'leaderboard' | 'podium'
export interface CompetitionSession {
  id: string; event_id: string; education_level_id: string; name: string; code: string; status: SessionStatus
  display_screen: DisplayScreen; current_round_id: string | null; current_question_id: string | null
  results_published: boolean; scheduled_at: string | null; finished_at: string | null; created_at: string
}
export type RoundMode = 'normal' | 'speed' | 'elimination' | 'final' | 'tiebreak'
export type EliminationRule = 'none' | 'wrong_count' | 'score_threshold' | 'manual'
export type ParticipantScope = 'all' | 'survivors' | 'top_n' | 'manual'
export interface CompetitionRound {
  id: string; session_id: string; sequence: number; name: string; mode: RoundMode; status: 'pending' | 'active' | 'finished'
  base_points: number; speed_bonus: number; wrong_penalty: number; duration_seconds: number; lead_seconds: number
  rounding_mode: RoundingMode; rounding_decimals: number; shuffle_options: boolean
  participant_scope: ParticipantScope; top_n: number | null; reset_scores: boolean
  elimination_rule: EliminationRule; elimination_wrong_limit: number; elimination_score_threshold: number | null
  elimination_after_question: number; count_unanswered_as_wrong: boolean
}
export type CqStatus = 'pending' | 'active' | 'closed' | 'revealed' | 'cancelled'

// ---------- Snapshot dari RPC ----------
export interface LiveOption { id: string; label: string; text: string; is_correct?: boolean; count?: number }
export interface LiveQuestion {
  id: string; sequence: number; total: number; type: QuestionType; text: string; image_url: string | null
  category: string | null; difficulty: Difficulty; status: CqStatus; duration_seconds: number
  started_at: string; deadline_at: string; paused_at: string | null; options: LiveOption[]
  reveal: null | {
    correct_text: string | null; correct_label: string | null; accepted: string[] | null; explanation: string | null
    answered: number; correct_count: number
    fastest: null | { name: string; school: string; ms: number; points: number }
  }
}
export interface LeaderboardRow {
  rank: number; tied: boolean; participant_id: string; number: string; name: string; school: string; district: string
  photo_url: string | null; points: number; correct: number; wrong: number; unanswered: number
  correct_ms: number; total_ms: number; avg_ms: number | null; tiebreak_points: number; tiebreak_ms: number
  is_finalist: boolean; is_eliminated: boolean; elimination_reason?: string | null
}
export interface LiveState {
  ok?: boolean; code?: string; message?: string
  server_now: string
  session: {
    id: string; code: string; name: string; status: SessionStatus; display_screen: DisplayScreen
    results_published: boolean; scheduled_at: string | null; event_name: string; organizer: string | null
    logo_url: string | null; location: string | null; level: string
  }
  round: null | { id: string; name: string; mode: RoundMode; sequence: number; status: string; elimination_rule: EliminationRule; base_points: number; speed_bonus: number }
  question: LiveQuestion | null
  upcoming: null | { id: string; sequence: number; total: number; starts_at: string; duration_seconds: number }
  notice: string | null
  counts: { participants: number; online: number; active: number; eliminated: number; answered: number }
  leaderboard: LeaderboardRow[] | null
  winners: LeaderboardRow[] | null
}
export interface ParticipantInfo { id: string; code: string; number: string; name: string; school: string; photo_url: string | null; level: string; district: string }
export interface ParticipantState extends Omit<LiveState, 'session'> {
  session: LiveState['session'] | null
  participant: ParticipantInfo
  sessions: { code: string; name: string; status: SessionStatus; event_name: string; scheduled_at: string | null }[]
  my_answer: null | { submitted: true; option_id: string | null; answer_text: string | null; answered_at: string; response_time_ms: number; is_correct?: boolean; points?: number }
  me?: { on_roster: boolean; is_eliminated: boolean; elimination_reason: string | null; rank?: number; points?: number; correct?: number; wrong?: number; unanswered?: number }
}
export interface ControlRoundQuestion { id: string; question_id: string; sequence: number; status: CqStatus; duration_seconds: number; text: string; type: QuestionType; answered: number; correct: number }
export interface ControlState extends LiveState {
  can_control: boolean
  event_id: string
  current: LiveQuestion | null
  rounds: (CompetitionRound & { roster: number; questions: ControlRoundQuestion[] })[]
  leaderboard: LeaderboardRow[]
}
export interface SessionReport {
  session: { id: string; name: string; code: string; status: SessionStatus; finished_at: string | null; results_published: boolean; event_id: string; event_name: string; organizer: string | null; location: string | null; level: string }
  rounds: { id: string; name: string; mode: RoundMode; sequence: number; status: string }[]
  rows: LeaderboardRow[]
}
export interface AnswerHistoryRow {
  round: string; round_sequence: number; sequence: number; question_status: CqStatus; question: string
  participant_id: string; number: string; name: string; school: string; district: string
  answer: string | null; is_correct: boolean; response_time_ms: number; points: number; answered_at: string
}
export interface Branding { app_name: string; tagline: string; organizer: string; product_owner: string; developer: string; logo_url: string | null; description: string }

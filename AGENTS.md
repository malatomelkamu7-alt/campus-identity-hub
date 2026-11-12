<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Registered students (name, ID, live photo) live in the `registered_students` table and private `student-photos` bucket; all access goes through server functions in `src/lib/students.functions.ts` using the admin client, because there is no user auth and the table has no client policies.
- Every IT Admin read and write checks `IT_ADMIN_PASSCODE` server-side; keep the verified PIN only in component memory so reloads and locking require it again.
- The server-only `school_roster` stores school students and teachers; registration matches its canonical full names and derives class details from it, with one registration per roster ID to prevent duplicates.
- Name edits use the service-role-only `admin_edit_identity_name` RPC to update the roster and linked registration atomically, keeping sign-in names consistent.
- All exam state (settings singleton, question banks, attempts, alerts, per-round results) lives in the database and is reached only via server functions in `src/lib/exam.functions.ts`; screens poll every few seconds instead of keeping local copies, so every role sees the same live state.
- Director, IT Admin and Teacher access is checked server-side; `staff_credentials` rows override the env passcodes, and a per-teacher `teacher:<id>` row replaces the shared teacher password for that teacher only.
- Students re-prove name + ID + the session token issued at sign-in on every exam call; only the latest token is valid, and a second sign-in is refused while the exam is live and the first session is recently active, so one ID cannot be used on two devices.
- Exam attempts retain personal deadlines; scheduling controls new starts independently, and Director extensions update live deadlines atomically.
- Submission scoring and attempt/result writes use the service-role-only atomic submission RPC; per-exam marks remain on attempts and subject summaries on round_results.
- Round and alert removal archives or dismisses records instead of deleting marks; new rounds increment current_round and preserve earlier attempts.
- Face reset updates verification and photo fields instead of deleting identities, because exam attempts reference the official student code; registration replaces only unverified rows and exam calls require current verification.
- Teacher intake uses the shared validated teacher schema and server-side ID allocation; queued banks persist the sending teacher's target stream to enforce stream isolation for shared subjects.
- Automatic exam transitions use a service-role-only database function, called on reads and by a minute-level job armed only for enabled future schedules, so timing works without viewers and stops after closing.
- Per-student pause/extra time goes through the service-role-only `director_attempt_time` RPC; a paused attempt keeps `paused_at`, is skipped by deadline settling, and resuming pushes its deadline forward by the paused duration.
- Teacher-removed banks are archived (status `archived`) and teacher-dismissed flags use `teacher_dismissed_at`, so saved marks and the Director's alert feed are unaffected.
- IT Admin "Delete" is the only hard delete: removing a student also deletes their attempts, results and alerts; removing a teacher unlinks their papers instead of deleting them.
- Batch labels are school years computed by `academicYear()` (September start).
- Student devices heartbeat through studentSync (`last_seen_at`, `current_question`); the service-role-only `pause_disconnected_attempts` RPC, run in non-forced settling, freezes silent attempts at their last-seen time with `pause_reason='connection'`, and only the Director's resume restarts them. The exam screen also mirrors answers and position in localStorage per attempt.
- Flagged-question awards use the service-role-only `award_question_marks` RPC, which records the question in `exam_attempts.bonus_questions` (counted as correct by scoring) so awards are idempotent and survive later submission.
- Student result passcodes are stored only as a SHA-256 hash (`registered_students.results_pin_hash`, salted with the student code via `hashResultPin`); `studentResults` returns a locked state until the right passcode is sent, and students registered before passcodes existed set one on first unlock.
- Teacher mark views (`teacherMarks`) are scoped server-side to the teacher's own subjects and `teacherStream`, across every paper of that subject, never other subjects.

- `selected_student_codes` (NULL = everyone) is the exam-room list; only listed students may start.
- `hidden_staff_roles` hides staff pages from the home page and menus via `visibleRoles`; staff links render only after the setting loads, and direct links keep working.
- `apply_exam_schedule` closes when every admitted student finished (`auto_close`, sets `auto_completed`); in Auto its close time only ends new starts and the session stays live while attempts are in progress, so extended or paused students are never cut off.
- Vercel only proxies to the Lovable-published site (`vercel.json`); Cloud server keys can't leave Lovable.

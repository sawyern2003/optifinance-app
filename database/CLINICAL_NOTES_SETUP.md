# Clinical notes (patient file)

1. In **Supabase → SQL Editor**, run `database/add-clinical-notes.sql` once. This creates `clinical_notes` with RLS aligned to your other tables.

2. Deploy the updated voice parser:
   ```bash
   supabase functions deploy clinic-llm --project-ref YOUR_PROJECT_REF
   ```

3. **Voice Diary**: dictate clinical details per patient (procedure, areas, units, complications, satisfaction, follow-up). After review, notes are saved to that patient’s **Clinical file** in **Catalogue → Patients** (document icon).

4. **Manual entry**: open the patient’s clinical file from Catalogue and use **Add clinical note**.

If list/save fails with “relation clinical_notes does not exist”, the SQL migration has not been applied yet.

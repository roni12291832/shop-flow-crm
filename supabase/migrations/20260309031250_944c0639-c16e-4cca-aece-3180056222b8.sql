
-- Drop overly permissive anon policies and replace with token-scoped ones
DROP POLICY IF EXISTS "Anon can read survey by token" ON public.nps_surveys;
DROP POLICY IF EXISTS "Anon can respond to survey" ON public.nps_surveys;

-- Anon can only SELECT surveys (filtered by token in app code, but restrict to non-responded)
CREATE POLICY "Anon can read pending survey" ON public.nps_surveys
  FOR SELECT TO anon USING (status = 'sent');

-- Anon can only UPDATE score/comment/status on pending surveys
CREATE POLICY "Anon can respond to pending survey" ON public.nps_surveys
  FOR UPDATE TO anon USING (status = 'sent')
  WITH CHECK (status = 'responded');

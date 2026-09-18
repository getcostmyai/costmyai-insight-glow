ALTER TABLE public.feedback_posts
  ADD COLUMN board text NOT NULL DEFAULT 'customer';

ALTER TABLE public.feedback_posts
  ADD CONSTRAINT feedback_posts_board_check CHECK (board IN ('customer', 'partner'));

ALTER TABLE public.feedback_posts DROP CONSTRAINT IF EXISTS feedback_posts_category_check;

ALTER TABLE public.feedback_posts
  ADD CONSTRAINT feedback_posts_category_check CHECK (
    (board = 'customer' AND category IN ('feature', 'improvement', 'bug', 'integration'))
    OR
    (board = 'partner' AND category IN ('sales_materials', 'commission', 'referral_flow', 'product', 'bug', 'data_insights', 'other'))
  );

-- One predicate, named once, so post / comment / vote visibility cannot drift apart.
CREATE OR REPLACE FUNCTION public.can_see_feedback_board(_board text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT _board = 'customer'
      OR public.is_active_partner(auth.uid())
      OR public.is_platform_admin()
$$;

GRANT EXECUTE ON FUNCTION public.can_see_feedback_board(text) TO authenticated;

DROP POLICY IF EXISTS feedback_posts_select ON public.feedback_posts;
CREATE POLICY feedback_posts_select ON public.feedback_posts
  FOR SELECT
  USING (public.can_see_feedback_board(board));

DROP POLICY IF EXISTS feedback_posts_insert ON public.feedback_posts;
CREATE POLICY feedback_posts_insert ON public.feedback_posts
  FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (board = 'customer' OR public.is_active_partner(auth.uid()))
  );

DROP POLICY IF EXISTS feedback_comments_select ON public.feedback_comments;
CREATE POLICY feedback_comments_select ON public.feedback_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.feedback_posts p
      WHERE p.id = feedback_comments.post_id
        AND public.can_see_feedback_board(p.board)
    )
  );

DROP POLICY IF EXISTS feedback_comments_insert ON public.feedback_comments;
CREATE POLICY feedback_comments_insert ON public.feedback_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.feedback_posts p
      WHERE p.id = feedback_comments.post_id
        AND public.can_see_feedback_board(p.board)
    )
  );

DROP POLICY IF EXISTS feedback_votes_select ON public.feedback_votes;
CREATE POLICY feedback_votes_select ON public.feedback_votes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.feedback_posts p
      WHERE p.id = feedback_votes.post_id
        AND public.can_see_feedback_board(p.board)
    )
  );

DROP POLICY IF EXISTS feedback_votes_insert ON public.feedback_votes;
CREATE POLICY feedback_votes_insert ON public.feedback_votes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.feedback_posts p
      WHERE p.id = feedback_votes.post_id
        AND public.can_see_feedback_board(p.board)
    )
  );
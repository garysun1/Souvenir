WITH numbered AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, place_id ORDER BY captured_at, created_at, id
  ) AS sequence
  FROM public.editions
)
UPDATE public.editions AS edition
SET visit_sequence = numbered.sequence,
    request_id = edition.id,
    origin = 'legacy'
FROM numbered WHERE edition.id = numbered.id;
--> statement-breakpoint
INSERT INTO public.edition_counters (user_id, place_id, last_sequence)
SELECT user_id, place_id, max(visit_sequence)
FROM public.editions GROUP BY user_id, place_id;
--> statement-breakpoint
INSERT INTO public.api_requests (user_id, request_id, operation, request_hash, resource_id)
SELECT user_id, request_id, 'edition.create', 'legacy', id FROM public.editions;
--> statement-breakpoint
UPDATE public.rankings SET sentiment =
  CASE WHEN would_recommend THEN 'recommend'::public.sentiment
  ELSE 'depends'::public.sentiment END;
--> statement-breakpoint
INSERT INTO public.wishlist_members (wishlist_id, user_id)
SELECT id, owner_id FROM public.wishlists
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO public.wishlist_members (wishlist_id, user_id)
SELECT item.wishlist_id, item.added_by
FROM public.wishlist_items AS item
JOIN public.wishlists AS list ON list.id = item.wishlist_id
WHERE list.is_shared
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO public.wishlist_saves (wishlist_id, place_id, user_id, created_at)
SELECT wishlist_id, place_id, added_by, created_at FROM public.wishlist_items
ON CONFLICT DO NOTHING;
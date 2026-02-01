-- Establishments Ratings — Add rating columns for "best results" scoring
-- Adds avg_rating and review_count columns for sorting by quality

begin;

-- ---------------------------------------------------------------------------
-- Rating columns for establishments
-- ---------------------------------------------------------------------------
alter table public.establishments
  add column if not exists avg_rating numeric(2,1) null check (avg_rating >= 0 and avg_rating <= 5),
  add column if not exists review_count int not null default 0 check (review_count >= 0),
  add column if not exists reviews_last_30d int not null default 0 check (reviews_last_30d >= 0);

-- Index for sorting by best results
create index if not exists idx_establishments_rating_reviews
  on public.establishments (avg_rating desc nulls last, review_count desc)
  where status = 'active';

-- Index for velocity-based scoring
create index if not exists idx_establishments_reviews_velocity
  on public.establishments (reviews_last_30d desc)
  where status = 'active' and reviews_last_30d > 0;

-- Comment for documentation
comment on column public.establishments.avg_rating is 'Average rating (1-5 stars) from customer reviews';
comment on column public.establishments.review_count is 'Total number of reviews';
comment on column public.establishments.reviews_last_30d is 'Number of reviews received in the last 30 days (velocity indicator)';

commit;

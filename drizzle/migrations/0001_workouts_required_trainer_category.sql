ALTER TABLE public.workouts
  ALTER COLUMN trainer_id SET NOT NULL,
  ALTER COLUMN category SET NOT NULL;
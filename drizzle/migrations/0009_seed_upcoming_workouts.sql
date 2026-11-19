INSERT INTO public.workouts (trainer_id, title, category, start_time, duration_minutes, capacity, price, deposit_amount, description) VALUES
  (2, 'Sunrise Yoga', 'Group Class', now() + interval '1 day 7 hours', 60, 20, 15.00, 5.00, 'Gentle morning flow to wake up the body and focus the mind.'),
  (1, 'HIIT Burn', 'Group Class', now() + interval '1 day 18 hours', 45, 16, 20.00, 5.00, 'High-intensity intervals mixing cardio and bodyweight strength.'),
  (4, 'Spin Cycle', 'Group Class', now() + interval '2 days 8 hours', 45, 24, 16.00, 4.00, 'Energetic indoor cycling ride with climbs, sprints and great music.'),
  (3, 'Strength 1:1', 'Personal Training', now() + interval '2 days 10 hours', 60, 1, 70.00, 21.00, 'Personal strength session with a fully tailored lifting plan.'),
  (5, 'Boxing Fundamentals', 'Group Class', now() + interval '3 days 7 hours', 60, 14, 22.00, 5.50, 'Learn stance, footwork and punch combos on pads and bags.'),
  (2, 'Pilates Core', 'Group Class', now() + interval '3 days 17 hours', 50, 15, 19.00, 4.75, 'Mat Pilates focused on core strength, posture and flexibility.'),
  (1, 'CrossFit WOD', 'Group Class', now() + interval '4 days 8 hours', 60, 12, 25.00, 6.25, 'Workout of the day: functional movements at high intensity.'),
  (6, 'Mobility & Recovery', 'Personal Training', now() + interval '4 days 11 hours', 45, 1, 55.00, 16.50, 'One-on-one stretching and mobility work to move pain-free.'),
  (6, 'Aqua Aerobics', 'Group Class', now() + interval '5 days 9 hours', 45, 18, 14.00, 5.00, 'Low-impact cardio in the pool, easy on the joints.'),
  (2, 'Power Yoga', 'Group Class', now() + interval '5 days 18 hours', 60, 20, 18.00, 4.50, 'Dynamic yoga flow building strength, balance and stamina.'),
  (3, 'Fat Loss Coaching', 'Personal Training', now() + interval '6 days 8 hours', 60, 1, 75.00, 22.50, 'Personal training plus nutrition guidance for sustainable fat loss.'),
  (5, 'Kickboxing Basics', 'Group Class', now() + interval '6 days 20 hours', 60, 16, 22.00, 9.00, 'Cardio kickboxing combos for beginners, no experience needed.');
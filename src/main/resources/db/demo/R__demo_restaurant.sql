-- Restaurante ficticio para la demo. Solo se carga con el perfil demo.
INSERT INTO restaurant (slug, name, zone_id, cancellation_deadline_hours)
VALUES ('demo', 'La Mesa del Puerto', 'Europe/Madrid', 2)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dining_table (restaurant_id, label, seats, x, y)
SELECT r.id, t.label, t.seats, t.x, t.y
FROM restaurant r
CROSS JOIN (VALUES
    ('M1', 2, 100, 100),
    ('M2', 2, 300, 100),
    ('M3', 4, 100, 300),
    ('M4', 4, 300, 300),
    ('M5', 6, 500, 200)
) AS t (label, seats, x, y)
WHERE r.slug = 'demo'
ON CONFLICT (restaurant_id, label) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO shift (restaurant_id, name, start_time, end_time, days_of_week)
SELECT r.id, s.name, s.start_time, s.end_time, '{1,2,3,4,5,6,7}'
FROM restaurant r
CROSS JOIN (VALUES
    ('Comida', TIME '13:00', TIME '15:30'),
    ('Cena', TIME '20:30', TIME '23:00')
) AS s (name, start_time, end_time)
WHERE r.slug = 'demo'
  AND NOT EXISTS (SELECT 1 FROM shift existing WHERE existing.restaurant_id = r.id AND existing.name = s.name);

-- Cuándo se creó cada plano (también los borrados lógicamente): base del tope de planos creados por dueño y día.
-- Los planos que ya existían quedan con la fecha de esta migración. El valor de los nuevos lo pone la aplicación con su
-- reloj; el DEFAULT solo cubre inserciones que no lo indiquen.
ALTER TABLE restaurant
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX idx_restaurant_owner_created_at ON restaurant (owner_uid, created_at);

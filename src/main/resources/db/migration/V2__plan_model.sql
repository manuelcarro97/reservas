-- Planos de local: forma, tema, modo de reserva, dueño y borrado lógico.
-- Los DEFAULT dejan válidos el seed de demo y el SQL crudo de los tests; el código nuevo siempre escribe los valores.
ALTER TABLE restaurant
    ADD COLUMN owner_uid      VARCHAR(128),
    ADD COLUMN status         VARCHAR(10) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    ADD COLUMN room_shape     VARCHAR(10) NOT NULL DEFAULT 'RECTANGLE'
        CHECK (room_shape IN ('SQUARE', 'RECTANGLE', 'L', 'U', 'T')),
    ADD COLUMN room_width     INTEGER     NOT NULL DEFAULT 1200,
    ADD COLUMN room_height    INTEGER     NOT NULL DEFAULT 800,
    ADD COLUMN room_cut_width INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN room_cut_depth INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN room_rotation  INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN theme          VARCHAR(10) NOT NULL DEFAULT 'AZUL'
        CHECK (theme IN ('AZUL', 'BOSQUE', 'TERRACOTA', 'NOCHE')),
    ADD COLUMN booking_mode   VARCHAR(12) NOT NULL DEFAULT 'FREE_CHOICE'
        CHECK (booking_mode IN ('FREE_CHOICE', 'ASSIGNED')),
    ADD COLUMN deleted_at     TIMESTAMPTZ;

CREATE INDEX idx_restaurant_owner_uid ON restaurant (owner_uid);

ALTER TABLE dining_table RENAME COLUMN capacity TO seats;
ALTER TABLE dining_table RENAME COLUMN pos_x TO x;
ALTER TABLE dining_table RENAME COLUMN pos_y TO y;

ALTER TABLE dining_table
    ADD CONSTRAINT dining_table_seats_supported CHECK (seats IN (2, 4, 6, 8)),
    ADD COLUMN shape      VARCHAR(6)  NOT NULL DEFAULT 'SQUARE' CHECK (shape IN ('SQUARE', 'ROUND')),
    ADD COLUMN rotation   INTEGER     NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90)),
    ADD COLUMN deleted_at TIMESTAMPTZ;

-- Una mesa borrada (borrado lógico) libera su nombre para otra mesa.
ALTER TABLE dining_table DROP CONSTRAINT dining_table_restaurant_id_label_key;
CREATE UNIQUE INDEX uq_dining_table_label ON dining_table (restaurant_id, label) WHERE deleted_at IS NULL;

ALTER TABLE shift ADD COLUMN deleted_at TIMESTAMPTZ;

-- table_id nulo: reserva sin mesa (modo asignado). El índice parcial uq_reservation_active_slot no arbitra nulos.
ALTER TABLE reservation
    ALTER COLUMN table_id DROP NOT NULL,
    ALTER COLUMN code TYPE VARCHAR(32),
    ADD COLUMN cancelled_by_customer_at TIMESTAMPTZ;

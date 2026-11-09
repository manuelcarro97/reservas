-- Hora a la que llega el cliente dentro del turno. Solo informativa: la mesa sigue ocupada el turno entero, así que el
-- índice único de mesa, fecha y turno no cambia. Las reservas que ya existían quedan sin hora (NULL).
ALTER TABLE reservation
    ADD COLUMN arrival_time TIME;

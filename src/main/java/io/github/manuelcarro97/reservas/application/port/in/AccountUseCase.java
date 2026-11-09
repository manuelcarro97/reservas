package io.github.manuelcarro97.reservas.application.port.in;

import java.util.List;

/** La cuenta del dueño: qué ve de sí mismo, borrar un plano y borrar la cuenta entera. */
public interface AccountUseCase {

	/**
	 * Lo que el panel necesita de la cuenta. {@code uid} es del propio dueño y no sale en ninguna respuesta de la API.
	 * {@code telegramAvailable} y {@code telegramLinked} salen del mismo estado que {@code GET /admin/telegram}.
	 */
	record Me(String uid, String email, boolean demo, boolean telegramAvailable, boolean telegramLinked, int maxPlans,
			List<PlanSummary> plans) {
	}

	Me me(String ownerUid, String email);

	/**
	 * Borra el plano (borrado lógico) y anonimiza sus reservas. Lanza {@code PlanHasReservationsException} si tiene
	 * reservas activas futuras y {@code RestaurantNotFoundException} si no existe o no es del dueño.
	 */
	void deletePlan(String ownerUid, String slug);

	/**
	 * Borra todos los planos del dueño (con la misma condición que {@link #deletePlan}), su cuenta y, una vez confirmado
	 * el borrado, su usuario en el proveedor de identidad. Un fallo de este último no deshace el borrado. Lanza
	 * {@code DemoReadOnlyException} para la cuenta demo.
	 */
	void deleteAccount(String ownerUid);

}

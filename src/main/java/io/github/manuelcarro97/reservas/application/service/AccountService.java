package io.github.manuelcarro97.reservas.application.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import io.github.manuelcarro97.reservas.application.port.in.AccountUseCase;
import io.github.manuelcarro97.reservas.application.port.in.ManagePlanUseCase;
import io.github.manuelcarro97.reservas.application.port.in.TelegramLinkUseCase;
import io.github.manuelcarro97.reservas.application.port.in.TelegramStatus;
import io.github.manuelcarro97.reservas.application.port.out.IdentityProviderPort;
import io.github.manuelcarro97.reservas.application.port.out.OwnerAccountRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.ReservationRepositoryPort;
import io.github.manuelcarro97.reservas.application.port.out.RestaurantRepositoryPort;
import io.github.manuelcarro97.reservas.domain.exception.DemoReadOnlyException;
import io.github.manuelcarro97.reservas.domain.exception.PlanHasReservationsException;
import io.github.manuelcarro97.reservas.domain.model.Reservation;
import io.github.manuelcarro97.reservas.domain.model.Restaurant;

/**
 * Orden de bloqueos, el mismo que en el resto de operaciones: primero el dueño ({@code lockOwner}), después cada plano
 * ({@code lock}) y, si son varios, por id ascendente. Con el bloqueo del dueño en ambas operaciones, un borrado de
 * plano y un borrado de cuenta del mismo dueño no se cruzan.
 */
@Service
@Transactional
class AccountService implements AccountUseCase {

	private static final Logger log = LoggerFactory.getLogger(AccountService.class);

	private final RestaurantRepositoryPort restaurants;
	private final ReservationRepositoryPort reservations;
	private final OwnerAccountRepositoryPort accounts;
	private final ManagePlanUseCase plans;
	private final TelegramLinkUseCase telegram;
	private final IdentityProviderPort identityProvider;
	private final DemoAccount demoAccount;
	private final Clock clock;

	AccountService(RestaurantRepositoryPort restaurants, ReservationRepositoryPort reservations,
			OwnerAccountRepositoryPort accounts, ManagePlanUseCase plans, TelegramLinkUseCase telegram,
			IdentityProviderPort identityProvider, DemoAccount demoAccount, Clock clock) {
		this.restaurants = restaurants;
		this.reservations = reservations;
		this.accounts = accounts;
		this.plans = plans;
		this.telegram = telegram;
		this.identityProvider = identityProvider;
		this.demoAccount = demoAccount;
		this.clock = clock;
	}

	@Override
	@Transactional(readOnly = true)
	public Me me(String ownerUid, String email) {
		TelegramStatus telegramStatus = telegram.status(ownerUid);
		return new Me(ownerUid, email, demoAccount.isDemo(ownerUid), telegramStatus.available(),
				telegramStatus.linked(), PlanService.MAX_PLANS_PER_OWNER, plans.list(ownerUid));
	}

	@Override
	public void deletePlan(String ownerUid, String slug) {
		restaurants.lockOwner(ownerUid);
		Restaurant found = RestaurantAccess.owned(restaurants, slug, ownerUid);
		// Se revalida con la fila bloqueada: entre la lectura y el bloqueo el plano pudo cambiar.
		Restaurant plan = RestaurantAccess.requireOwnedBy(restaurants.lock(found.id()), ownerUid);

		List<String> activeCodes = activeReservationCodes(plan);
		if (!activeCodes.isEmpty()) {
			throw new PlanHasReservationsException(activeCodes);
		}
		delete(plan);
	}

	@Override
	public void deleteAccount(String ownerUid) {
		if (demoAccount.isDemo(ownerUid)) {
			throw new DemoReadOnlyException();
		}
		restaurants.lockOwner(ownerUid);
		// findByOwner viene por id ascendente; el bloqueo de cada plano devuelve su estado actual.
		List<Restaurant> locked = new ArrayList<>();
		for (Restaurant plan : restaurants.findByOwner(ownerUid)) {
			locked.add(RestaurantAccess.requireOwnedBy(restaurants.lock(plan.id()), ownerUid));
		}

		// Todo o nada: con un solo plano con activas futuras no se borra ninguno.
		List<String> activeCodes = new ArrayList<>();
		locked.forEach(plan -> activeCodes.addAll(activeReservationCodes(plan)));
		if (!activeCodes.isEmpty()) {
			throw new PlanHasReservationsException(activeCodes);
		}

		locked.forEach(this::delete);
		accounts.delete(ownerUid);
		deleteIdentityUserAfterCommit(ownerUid);
	}

	/** PENDING o CONFIRMED con fecha de hoy en adelante, con "hoy" en la zona del plano. */
	private List<String> activeReservationCodes(Restaurant plan) {
		LocalDate today = LocalDate.ofInstant(clock.instant(), plan.zone());
		return reservations.findActiveFrom(plan.id(), today).stream().map(Reservation::code).toList();
	}

	private void delete(Restaurant plan) {
		Instant now = clock.instant();
		reservations.anonymizeRestaurant(plan.id());
		restaurants.softDelete(plan.id(), now);
	}

	/**
	 * La cuenta del proveedor se borra cuando el borrado de la base de datos ya está confirmado: si se borrara antes y la
	 * transacción fallara, el dueño perdería el acceso con sus planos aún vivos. Si el proveedor falla no se deshace
	 * nada (ya está confirmado) y la respuesta sigue siendo un éxito; se registra para limpiarlo a mano.
	 */
	private void deleteIdentityUserAfterCommit(String ownerUid) {
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				try {
					identityProvider.deleteUser(ownerUid);
				}
				catch (RuntimeException failure) {
					// Nunca el mensaje ni la traza completa: el de una librería externa puede traer datos de la cuenta de
					// servicio. Clase y primer frame bastan para saber dónde falló. Ni el uid.
					StackTraceElement[] frames = failure.getStackTrace();
					log.warn("Identity provider user deletion failed: {} at {}", failure.getClass().getName(),
							frames.length > 0 ? frames[0] : "unknown");
				}
			}
		});
	}

}

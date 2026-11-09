package io.github.manuelcarro97.reservas.domain.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class SeatingCapacity {

	/**
	 * Indica si cada grupo puede sentarse en una mesa distinta con plazas suficientes. Voraz exacto para este
	 * problema: los grupos de mayor a menor, cada uno a la mesa libre más pequeña que le sirva.
	 */
	public boolean canSeatAll(List<Integer> freeTableSeats, List<Integer> partySizes) {
		List<Integer> remainingTables = new ArrayList<>(freeTableSeats);
		remainingTables.sort(Comparator.naturalOrder());
		List<Integer> parties = new ArrayList<>(partySizes);
		parties.sort(Comparator.reverseOrder());
		for (int party : parties) {
			int match = firstTableFor(remainingTables, party);
			if (match < 0) {
				return false;
			}
			remainingTables.remove(match);
		}
		return true;
	}

	private static int firstTableFor(List<Integer> sortedTables, int party) {
		for (int i = 0; i < sortedTables.size(); i++) {
			if (sortedTables.get(i) >= party) {
				return i;
			}
		}
		return -1;
	}

}

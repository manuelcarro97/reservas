package io.github.manuelcarro97.reservas.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.RestController;

import io.github.manuelcarro97.reservas.application.port.in.ResetDemoUseCase;

/**
 * El seeder crea el plano de la demo por un camino interno que se salta las restricciones de la cuenta demo. Nada de
 * eso puede colgar de un controlador.
 */
class DemoSeederExposureTest {

	private static List<Class<?>> controllers() throws ClassNotFoundException {
		ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
		scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
		List<Class<?>> found = new ArrayList<>();
		for (BeanDefinition definition : scanner.findCandidateComponents("io.github.manuelcarro97.reservas")) {
			found.add(Class.forName(definition.getBeanClassName()));
		}
		return found;
	}

	@Test
	void noControllerDependsOnTheSeederOrOnThePlanServiceItself() throws ClassNotFoundException {
		List<Class<?>> controllers = controllers();
		assertThat(controllers).isNotEmpty();

		List<Class<?>> dependencies = controllers.stream()
			.flatMap(controller -> Arrays.stream(controller.getDeclaredConstructors()))
			.flatMap(constructor -> Arrays.stream(constructor.getParameterTypes()))
			.toList();

		assertThat(dependencies).noneMatch(type -> ResetDemoUseCase.class.isAssignableFrom(type)
				|| PlanService.class.isAssignableFrom(type) || DemoSeeder.class.isAssignableFrom(type));
	}

}

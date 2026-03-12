import type { MissionDefinition } from './types';

const MISSION_REGISTRY: Map<string, MissionDefinition> = new Map();

/**
 * Register a mission definition. Called at module load time by
 * mission implementations (e.g. Housing Search in Phase 27).
 * Throws if a definition for the same type is already registered.
 */
export function registerMission(definition: MissionDefinition): void {
  if (MISSION_REGISTRY.has(definition.type)) {
    throw new Error(
      `Mission type '${definition.type}' is already registered. ` +
      'Each mission type can only be registered once.',
    );
  }
  MISSION_REGISTRY.set(definition.type, definition);
}

/**
 * Look up a registered mission definition by type.
 * Returns undefined if no definition is registered for the given type.
 */
export function getMissionDefinition(type: string): MissionDefinition | undefined {
  return MISSION_REGISTRY.get(type);
}

/** List all registered mission type strings. */
export function getRegisteredTypes(): readonly string[] {
  return [...MISSION_REGISTRY.keys()];
}

/**
 * Clear all registered missions. Only for use in tests.
 * @internal
 */
export function clearRegistry(): void {
  MISSION_REGISTRY.clear();
}

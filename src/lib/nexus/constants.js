/**
 * Browser-safe Nexus constants.
 * Keep this file free of mongodb / Node builtins — the canvas engine imports it.
 */

export const NODE_TYPES = {
  HUB: 'hub',
  CLUSTER: 'cluster',
  LEAF: 'leaf',
}

export const DEFAULT_LEAF_CAP_PER_PARENT = 400

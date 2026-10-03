export type Vec3 = { x: number; y: number; z: number };

export type SphereRing = {
  /** Rotation of the ring plane away from the screen plane, in radians. */
  inclination: number;
  /** In-screen rotation of the ring, in radians. */
  tilt: number;
  /** Starting angle of the ring's agent node, in radians. */
  nodePhase: number;
  /** Angular speed of the node along its ring, in radians per second. */
  nodeSpeed: number;
};

export type SphereSide = "back" | "front";

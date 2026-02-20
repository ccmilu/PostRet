export interface Vector3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Point3D {
  readonly x: number
  readonly y: number
  readonly z: number
}

function dot(v1: Vector3, v2: Vector3): number {
  return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z
}

function magnitude(v: Vector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

export function vectorAngle(v1: Vector3, v2: Vector3): number {
  const mag1 = magnitude(v1)
  const mag2 = magnitude(v2)

  if (mag1 === 0 || mag2 === 0) {
    return 0
  }

  const cosTheta = Math.max(-1, Math.min(1, dot(v1, v2) / (mag1 * mag2)))
  return Math.acos(cosTheta)
}

export function toDegrees(radians: number): number {
  return radians * (180 / Math.PI)
}

export function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

export function distance3D(p1: Point3D, p2: Point3D): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const dz = p2.z - p1.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function midpoint(p1: Point3D, p2: Point3D): Point3D {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: (p1.z + p2.z) / 2,
  }
}

export function normalize(v: Vector3): Vector3 {
  const mag = magnitude(v)

  if (mag === 0) {
    return { x: 0, y: 0, z: 0 }
  }

  return {
    x: v.x / mag,
    y: v.y / mag,
    z: v.z / mag,
  }
}

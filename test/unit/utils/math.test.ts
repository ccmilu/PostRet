import { describe, it, expect } from 'vitest'
import {
  vectorAngle,
  toDegrees,
  toRadians,
  distance3D,
  midpoint,
  normalize,
  type Vector3,
  type Point3D,
} from '@/utils/math'

describe('math utils', () => {
  describe('vectorAngle', () => {
    it('returns 0 for identical vectors', () => {
      const v: Vector3 = { x: 1, y: 0, z: 0 }
      expect(vectorAngle(v, v)).toBeCloseTo(0, 2)
    })

    it('returns PI/2 for perpendicular vectors', () => {
      const v1: Vector3 = { x: 1, y: 0, z: 0 }
      const v2: Vector3 = { x: 0, y: 1, z: 0 }
      expect(vectorAngle(v1, v2)).toBeCloseTo(Math.PI / 2, 2)
    })

    it('returns PI for opposite vectors', () => {
      const v1: Vector3 = { x: 1, y: 0, z: 0 }
      const v2: Vector3 = { x: -1, y: 0, z: 0 }
      expect(vectorAngle(v1, v2)).toBeCloseTo(Math.PI, 2)
    })

    it('computes correct angle for 3D vectors', () => {
      const v1: Vector3 = { x: 1, y: 1, z: 0 }
      const v2: Vector3 = { x: 0, y: 1, z: 1 }
      // cos(theta) = dot(v1,v2) / (|v1| * |v2|) = 1 / (sqrt(2) * sqrt(2)) = 0.5
      // theta = PI/3
      expect(vectorAngle(v1, v2)).toBeCloseTo(Math.PI / 3, 2)
    })

    it('returns 0 when a vector is zero', () => {
      const v1: Vector3 = { x: 1, y: 0, z: 0 }
      const zero: Vector3 = { x: 0, y: 0, z: 0 }
      expect(vectorAngle(v1, zero)).toBe(0)
    })

    it('returns 0 when both vectors are zero', () => {
      const zero: Vector3 = { x: 0, y: 0, z: 0 }
      expect(vectorAngle(zero, zero)).toBe(0)
    })

    it('handles non-unit-length vectors correctly', () => {
      const v1: Vector3 = { x: 3, y: 0, z: 0 }
      const v2: Vector3 = { x: 0, y: 5, z: 0 }
      expect(vectorAngle(v1, v2)).toBeCloseTo(Math.PI / 2, 2)
    })

    it('does not mutate input vectors', () => {
      const v1: Vector3 = { x: 1, y: 2, z: 3 }
      const v2: Vector3 = { x: 4, y: 5, z: 6 }
      const v1Copy = { ...v1 }
      const v2Copy = { ...v2 }
      vectorAngle(v1, v2)
      expect(v1).toEqual(v1Copy)
      expect(v2).toEqual(v2Copy)
    })
  })

  describe('toDegrees', () => {
    it('converts PI to 180', () => {
      expect(toDegrees(Math.PI)).toBe(180)
    })

    it('converts PI/2 to 90', () => {
      expect(toDegrees(Math.PI / 2)).toBe(90)
    })

    it('converts 0 to 0', () => {
      expect(toDegrees(0)).toBe(0)
    })

    it('converts 2*PI to 360', () => {
      expect(toDegrees(2 * Math.PI)).toBe(360)
    })

    it('converts negative radians', () => {
      expect(toDegrees(-Math.PI)).toBe(-180)
    })
  })

  describe('toRadians', () => {
    it('converts 180 to PI', () => {
      expect(toRadians(180)).toBe(Math.PI)
    })

    it('converts 90 to PI/2', () => {
      expect(toRadians(90)).toBe(Math.PI / 2)
    })

    it('converts 0 to 0', () => {
      expect(toRadians(0)).toBe(0)
    })

    it('converts 360 to 2*PI', () => {
      expect(toRadians(360)).toBe(2 * Math.PI)
    })

    it('converts negative degrees', () => {
      expect(toRadians(-90)).toBe(-Math.PI / 2)
    })
  })

  describe('distance3D', () => {
    it('returns 0 for same point', () => {
      const p: Point3D = { x: 1, y: 2, z: 3 }
      expect(distance3D(p, p)).toBe(0)
    })

    it('computes distance along single axis', () => {
      const p1: Point3D = { x: 0, y: 0, z: 0 }
      const p2: Point3D = { x: 3, y: 0, z: 0 }
      expect(distance3D(p1, p2)).toBe(3)
    })

    it('computes 3D euclidean distance', () => {
      const p1: Point3D = { x: 1, y: 2, z: 3 }
      const p2: Point3D = { x: 4, y: 6, z: 3 }
      // sqrt(9 + 16 + 0) = 5
      expect(distance3D(p1, p2)).toBe(5)
    })

    it('is symmetric', () => {
      const p1: Point3D = { x: 1, y: 2, z: 3 }
      const p2: Point3D = { x: 7, y: 8, z: 9 }
      expect(distance3D(p1, p2)).toBe(distance3D(p2, p1))
    })

    it('handles negative coordinates', () => {
      const p1: Point3D = { x: -1, y: -2, z: -3 }
      const p2: Point3D = { x: 1, y: 2, z: 3 }
      expect(distance3D(p1, p2)).toBeCloseTo(Math.sqrt(4 + 16 + 36), 10)
    })

    it('does not mutate input points', () => {
      const p1: Point3D = { x: 1, y: 2, z: 3 }
      const p2: Point3D = { x: 4, y: 5, z: 6 }
      const p1Copy = { ...p1 }
      const p2Copy = { ...p2 }
      distance3D(p1, p2)
      expect(p1).toEqual(p1Copy)
      expect(p2).toEqual(p2Copy)
    })
  })

  describe('midpoint', () => {
    it('returns same point when both points are identical', () => {
      const p: Point3D = { x: 2, y: 4, z: 6 }
      expect(midpoint(p, p)).toEqual({ x: 2, y: 4, z: 6 })
    })

    it('computes midpoint of two points', () => {
      const p1: Point3D = { x: 0, y: 0, z: 0 }
      const p2: Point3D = { x: 4, y: 6, z: 8 }
      expect(midpoint(p1, p2)).toEqual({ x: 2, y: 3, z: 4 })
    })

    it('handles negative coordinates', () => {
      const p1: Point3D = { x: -2, y: -4, z: -6 }
      const p2: Point3D = { x: 2, y: 4, z: 6 }
      expect(midpoint(p1, p2)).toEqual({ x: 0, y: 0, z: 0 })
    })

    it('returns a new object (immutability)', () => {
      const p1: Point3D = { x: 1, y: 2, z: 3 }
      const p2: Point3D = { x: 5, y: 6, z: 7 }
      const result = midpoint(p1, p2)
      expect(result).not.toBe(p1)
      expect(result).not.toBe(p2)
    })

    it('does not mutate input points', () => {
      const p1: Point3D = { x: 1, y: 2, z: 3 }
      const p2: Point3D = { x: 4, y: 5, z: 6 }
      const p1Copy = { ...p1 }
      const p2Copy = { ...p2 }
      midpoint(p1, p2)
      expect(p1).toEqual(p1Copy)
      expect(p2).toEqual(p2Copy)
    })
  })

  describe('normalize', () => {
    it('normalizes a unit axis vector to itself', () => {
      const v: Vector3 = { x: 1, y: 0, z: 0 }
      const result = normalize(v)
      expect(result.x).toBeCloseTo(1, 5)
      expect(result.y).toBeCloseTo(0, 5)
      expect(result.z).toBeCloseTo(0, 5)
    })

    it('normalizes a vector to unit length', () => {
      const v: Vector3 = { x: 3, y: 4, z: 0 }
      const result = normalize(v)
      const length = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2)
      expect(length).toBeCloseTo(1, 3)
    })

    it('normalizes 3D vector correctly', () => {
      const v: Vector3 = { x: 1, y: 1, z: 1 }
      const result = normalize(v)
      const expected = 1 / Math.sqrt(3)
      expect(result.x).toBeCloseTo(expected, 5)
      expect(result.y).toBeCloseTo(expected, 5)
      expect(result.z).toBeCloseTo(expected, 5)
    })

    it('returns zero vector for zero input', () => {
      const zero: Vector3 = { x: 0, y: 0, z: 0 }
      const result = normalize(zero)
      expect(result).toEqual({ x: 0, y: 0, z: 0 })
    })

    it('preserves direction', () => {
      const v: Vector3 = { x: 2, y: 0, z: 0 }
      const result = normalize(v)
      expect(result.x).toBeGreaterThan(0)
      expect(result.y).toBeCloseTo(0, 5)
      expect(result.z).toBeCloseTo(0, 5)
    })

    it('handles negative components', () => {
      const v: Vector3 = { x: -3, y: -4, z: 0 }
      const result = normalize(v)
      const length = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2)
      expect(length).toBeCloseTo(1, 3)
      expect(result.x).toBeLessThan(0)
      expect(result.y).toBeLessThan(0)
    })

    it('returns a new object (immutability)', () => {
      const v: Vector3 = { x: 1, y: 2, z: 3 }
      const result = normalize(v)
      expect(result).not.toBe(v)
    })

    it('does not mutate input vector', () => {
      const v: Vector3 = { x: 1, y: 2, z: 3 }
      const vCopy = { ...v }
      normalize(v)
      expect(v).toEqual(vCopy)
    })
  })
})

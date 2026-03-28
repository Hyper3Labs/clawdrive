import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RefObject } from "react";
import type CameraControlsImpl from "camera-controls";

interface FocusTarget {
  x: number;
  y: number;
  z: number;
}

interface MapCameraRigProps {
  focusTarget: FocusTarget | null;
  focusKey: string;
  controlsRef: RefObject<CameraControlsImpl | null>;
}

const OVERVIEW_POSITION = new THREE.Vector3(0, 0, 50);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);
const FOCUS_OFFSET = new THREE.Vector3(9, 5.5, 13);

const IDLE_TIMEOUT = 30; // seconds before auto-rotation starts
const RAMP_DURATION = 3; // seconds to fade in rotation
const ROTATE_SPEED = 0.06; // radians per second

export function MapCameraRig({ focusTarget, focusKey, controlsRef }: MapCameraRigProps) {
  const hasInitialized = useRef(false);
  const targetVec = useMemo(() => new THREE.Vector3(), []);
  const desiredVec = useMemo(() => new THREE.Vector3(), []);
  const idleTimer = useRef(IDLE_TIMEOUT);

  // Reset idle timer on any user interaction (called via CameraControls events)
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const resetIdle = () => { idleTimer.current = 0; isReturning.current = false; };
    controls.addEventListener("controlstart", resetIdle);
    controls.addEventListener("transitionstart", resetIdle);
    return () => {
      controls.removeEventListener("controlstart", resetIdle);
      controls.removeEventListener("transitionstart", resetIdle);
    };
  }, [controlsRef]);

  // Handle focus transitions
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.minDistance = 8;
    controls.maxDistance = 140;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = Math.PI * 0.78;
    controls.smoothTime = 0.65;
    controls.draggingSmoothTime = 0.12;
    controls.dollyToCursor = true;

    const shouldTransition = hasInitialized.current;
    hasInitialized.current = true;

    controls.stop();

    if (!focusTarget) {
      void controls.setLookAt(
        OVERVIEW_POSITION.x,
        OVERVIEW_POSITION.y,
        OVERVIEW_POSITION.z,
        OVERVIEW_TARGET.x,
        OVERVIEW_TARGET.y,
        OVERVIEW_TARGET.z,
        shouldTransition,
      );
      return;
    }

    targetVec.set(focusTarget.x, focusTarget.y, focusTarget.z);
    desiredVec.copy(targetVec).add(FOCUS_OFFSET);

    void controls.setLookAt(
      desiredVec.x,
      desiredVec.y,
      desiredVec.z,
      targetVec.x,
      targetVec.y,
      targetVec.z,
      shouldTransition,
    );
  }, [controlsRef, desiredVec, focusKey, focusTarget, targetVec]);

  // Idle auto-rotation + drift back to overview
  const isReturning = useRef(false);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || focusTarget) return;

    idleTimer.current += delta;
    if (idleTimer.current < IDLE_TIMEOUT) return;

    const ramp = Math.min((idleTimer.current - IDLE_TIMEOUT) / RAMP_DURATION, 1);
    controls.azimuthAngle += ROTATE_SPEED * delta * ramp;

    // Once fully ramped, smoothly return to overview distance
    if (ramp >= 1 && !isReturning.current) {
      isReturning.current = true;
      void controls.dollyTo(OVERVIEW_POSITION.z, true);
    }
  });

  return null;
}

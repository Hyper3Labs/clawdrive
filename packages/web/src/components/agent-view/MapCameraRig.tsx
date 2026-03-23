import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { RefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface FocusTarget {
  x: number;
  y: number;
  z: number;
}

interface MapCameraRigProps {
  focusTarget: FocusTarget | null;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  userInteracting: boolean;
}

export function MapCameraRig({
  focusTarget,
  controlsRef,
  userInteracting,
}: MapCameraRigProps) {
  const { camera, clock } = useThree();
  const targetVec = useMemo(() => new THREE.Vector3(), []);
  const desiredVec = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (focusTarget) {
      targetVec.set(focusTarget.x, focusTarget.y, focusTarget.z);
      desiredVec.set(focusTarget.x + 8, focusTarget.y + 5, focusTarget.z + 12);
      const settle = 1 - Math.exp(-delta * 3.2);
      camera.position.lerp(desiredVec, settle);
      if (controlsRef.current) {
        controlsRef.current.target.lerp(targetVec, settle);
        controlsRef.current.update();
      } else {
        camera.lookAt(targetVec);
      }
      return;
    }

    if (userInteracting) return;

    const t = clock.getElapsedTime();
    targetVec.set(
      Math.sin(t * 0.11) * 2.4,
      Math.cos(t * 0.07) * 1.5,
      Math.cos(t * 0.09) * 2.2,
    );
    desiredVec.set(
      Math.cos(t * 0.05) * 52,
      11 + Math.sin(t * 0.13) * 4,
      Math.sin(t * 0.05) * 52,
    );

    const drift = 1 - Math.exp(-delta * 0.65);
    camera.position.lerp(desiredVec, drift);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetVec, drift);
      controlsRef.current.update();
    } else {
      camera.lookAt(targetVec);
    }
  });

  return null;
}

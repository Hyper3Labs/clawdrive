import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";

function EmbeddingPoints({ points, colors, onSelect }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const colorArray = useMemo(() => {
    const arr = new Float32Array(points.length * 3);
    points.forEach((_, i) => {
      const c = new THREE.Color(colors[i] || "#4361ee");
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    });
    return arr;
  }, [points, colors]);

  useFrame(() => {
    if (!meshRef.current) return;
    points.forEach(([x, y, z], i) => {
      dummy.position.set(x * 50, y * 50, z * 50);
      dummy.scale.setScalar(0.3);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, points.length]}
      onClick={(e) => onSelect?.(e.instanceId)}
    >
      <sphereGeometry args={[1, 16, 16]}>
        <instancedBufferAttribute
          attach="attributes-color"
          args={[colorArray, 3]}
        />
      </sphereGeometry>
      <meshStandardMaterial vertexColors toneMapped={false} />
    </instancedMesh>
  );
}

export default function EmbeddingScene({ data }) {
  const points = data.map((d) => d.position);
  const colors = data.map((d) => d.color);

  return (
    <Canvas camera={{ position: [0, 0, 100], fov: 60 }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[100, 100, 100]} />
      <EmbeddingPoints points={points} colors={colors} />
      <OrbitControls enableDamping dampingFactor={0.1} />
    </Canvas>
  );
}

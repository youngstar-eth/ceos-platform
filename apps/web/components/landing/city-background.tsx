'use client';

import { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

/* ─── Procedural City Buildings ─────────────────────────────────── */

function Buildings() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const { matrices, colors } = useMemo(() => {
    const count = 200;
    const mat: THREE.Matrix4[] = [];
    const col: Float32Array = new Float32Array(count * 3);
    const temp = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 80;
      const z = -Math.random() * 60 - 5;
      const height = 2 + Math.random() * 18;
      const width = 0.5 + Math.random() * 2;
      const depth = 0.5 + Math.random() * 2;

      position.set(x, height / 2, z);
      scale.set(width, height, depth);
      quaternion.identity();
      temp.compose(position, quaternion, scale);
      mat.push(temp.clone());

      // Neon window color tints
      const colorChoice = Math.random();
      if (colorChoice < 0.3) {
        // Cyan
        col[i * 3] = 0;
        col[i * 3 + 1] = 0.6 + Math.random() * 0.4;
        col[i * 3 + 2] = 1;
      } else if (colorChoice < 0.5) {
        // Pink/Magenta
        col[i * 3] = 0.8 + Math.random() * 0.2;
        col[i * 3 + 1] = 0;
        col[i * 3 + 2] = 0.8 + Math.random() * 0.2;
      } else if (colorChoice < 0.65) {
        // Acid green
        col[i * 3] = 0.6 + Math.random() * 0.2;
        col[i * 3 + 1] = 1;
        col[i * 3 + 2] = 0;
      } else {
        // Dark blue/gray buildings
        const v = 0.03 + Math.random() * 0.06;
        col[i * 3] = v * 0.5;
        col[i * 3 + 1] = v * 0.5;
        col[i * 3 + 2] = v;
      }
    }

    return { matrices: mat, colors: col };
  }, []);

  useMemo(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    matrices.forEach((mat, i) => {
      mesh.setMatrixAt(i, mat);
    });

    // Set instance colors
    const colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceColor = colorAttr;
    mesh.instanceMatrix.needsUpdate = true;
  }, [matrices, colors]);

  // After mount, set instances
  const setRef = useCallback(
    (mesh: THREE.InstancedMesh | null) => {
      if (!mesh) return;
      (meshRef as React.MutableRefObject<THREE.InstancedMesh | null>).current = mesh;
      matrices.forEach((mat, i) => {
        mesh.setMatrixAt(i, mat);
      });
      const colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
      mesh.instanceColor = colorAttr;
      mesh.instanceMatrix.needsUpdate = true;
    },
    [matrices, colors]
  );

  return (
    <instancedMesh ref={setRef} args={[undefined, undefined, matrices.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        roughness={0.8}
        metalness={0.2}
        emissiveIntensity={0.15}
        emissive={new THREE.Color('#1a0530')}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/* ─── Neon Signs (floating light rectangles) ────────────────────── */

function NeonSigns() {
  const signs = useMemo(() => {
    return Array.from({ length: 30 }).map(() => ({
      position: [
        (Math.random() - 0.5) * 60,
        3 + Math.random() * 14,
        -Math.random() * 40 - 5,
      ] as [number, number, number],
      color:
        Math.random() < 0.4
          ? '#FF00FF'
          : Math.random() < 0.6
            ? '#00F0FF'
            : '#CCFF00',
      width: 0.5 + Math.random() * 2,
      height: 0.2 + Math.random() * 0.6,
      intensity: 2 + Math.random() * 5,
    }));
  }, []);

  return (
    <>
      {signs.map((sign, i) => (
        <mesh key={i} position={sign.position}>
          <planeGeometry args={[sign.width, sign.height]} />
          <meshBasicMaterial
            color={sign.color}
            transparent
            opacity={0.6 + Math.random() * 0.4}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}

/* ─── Rain Particles ────────────────────────────────────────────── */

function Rain() {
  const count = 3000;
  const meshRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60 - 10;
    }
    return pos;
  }, []);

  useFrame(() => {
    if (!meshRef.current) return;
    const attr = meshRef.current.geometry.attributes.position;
    if (!attr) return;
    // Direct typed-array view avoids noUncheckedIndexedAccess overhead
    const buf = new DataView(attr.array.buffer);

    for (let i = 0; i < count; i++) {
      const byteOffset = (i * 3 + 1) * 4; // Float32 = 4 bytes
      let y = buf.getFloat32(byteOffset, true);
      y -= 0.3 + Math.random() * 0.1;
      if (y < -2) y = 35 + Math.random() * 5;
      buf.setFloat32(byteOffset, y, true);
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#8899cc"
        transparent
        opacity={0.4}
        sizeAttenuation
      />
    </points>
  );
}

/* ─── Volumetric Fog (ground layer) ─────────────────────────────── */

function Fog() {
  return (
    <mesh position={[0, 0.5, -20]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[120, 80]} />
      <meshBasicMaterial
        color="#1a0a30"
        transparent
        opacity={0.35}
      />
    </mesh>
  );
}

/* ─── Slow Camera Drift ─────────────────────────────────────────── */

function CameraDrift() {
  const { camera } = useThree();
  const time = useRef(0);

  useFrame((_, delta) => {
    time.current += delta * 0.15;
    camera.position.x = Math.sin(time.current * 0.3) * 2;
    camera.position.y = 8 + Math.sin(time.current * 0.2) * 0.5;
    camera.lookAt(0, 5, -20);
  });

  return null;
}

/* ─── Flying Drones (distant lights) ────────────────────────────── */

function Drones() {
  const drones = useMemo(
    () =>
      Array.from({ length: 8 }).map(() => ({
        speed: 0.5 + Math.random() * 1.5,
        y: 10 + Math.random() * 12,
        z: -15 - Math.random() * 30,
        offset: Math.random() * Math.PI * 2,
        color:
          Math.random() < 0.5 ? '#FF00FF' : '#00F0FF',
      })),
    []
  );

  return (
    <>
      {drones.map((d, i) => (
        <DroneLight key={i} {...d} />
      ))}
    </>
  );
}

function DroneLight({
  speed,
  y,
  z,
  offset,
  color,
}: {
  speed: number;
  y: number;
  z: number;
  offset: number;
  color: string;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed + offset;
    ref.current.position.x = Math.sin(t) * 30;
    ref.current.position.y = y + Math.sin(t * 1.5) * 1;
  });

  return (
    <Float speed={0.5} floatIntensity={0.3}>
      <mesh ref={ref} position={[0, y, z]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </Float>
  );
}

/* ─── Main Exported Canvas ──────────────────────────────────────── */

export function CityBackground() {
  return (
    <div className="fixed inset-0 z-0" style={{ background: '#030014' }}>
      <Canvas
        camera={{ position: [0, 8, 12], fov: 60, near: 0.1, far: 200 }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 1.5]}
        style={{ background: '#030014' }}
      >
        <color attach="background" args={['#030014']} />
        <fog attach="fog" args={['#030014', 15, 70]} />

        {/* Minimal ambient */}
        <ambientLight intensity={0.08} color="#2a1050" />

        {/* Key lights */}
        <directionalLight
          position={[10, 20, -10]}
          intensity={0.15}
          color="#4400aa"
        />
        <pointLight position={[-15, 12, -20]} intensity={0.8} color="#FF00FF" distance={40} />
        <pointLight position={[15, 10, -25]} intensity={0.6} color="#00F0FF" distance={35} />
        <pointLight position={[0, 5, -10]} intensity={0.3} color="#CCFF00" distance={20} />

        <CameraDrift />
        <Buildings />
        <NeonSigns />
        <Rain />
        <Drones />
        <Fog />
      </Canvas>

      {/* Gradient overlay to blend into UI */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#030014] via-[#030014]/60 to-transparent" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#030014]/40 to-transparent" style={{ height: '15vh' }} />
    </div>
  );
}
